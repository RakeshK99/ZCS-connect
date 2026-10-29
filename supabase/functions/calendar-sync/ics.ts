// Minimal iCalendar (RFC 5545) reader for the ZCS Google Calendar feed.
// Turns VEVENTs into ZCS Connect calendar rows in the school's time zone.
// Handles all-day and timed events, multi-day events, TZID and UTC times,
// cancelled events, and the recurrence rules Google Calendar produces
// (DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL, BYDAY, EXDATE,
// and RECURRENCE-ID overrides). Pure TypeScript: runs in Deno and in Vitest.

export type SyncedEvent = {
  uid: string;
  title: string;
  starts_on: string; // yyyy-mm-dd
  ends_on: string | null;
  start_time: string | null; // HH:MM
  end_time: string | null;
  location: string | null;
  no_school: boolean;
};

type Stamp = { date: string; time: string | null }; // local to the school's zone
type Prop = { value: string; params: Record<string, string> };
type RawEvent = Record<string, Prop[]>;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const dayToDate = (day: string) => new Date(`${day}T00:00:00Z`);
const addDays = (day: string, n: number) => { const d = dayToDate(day); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescapeText(v: string) {
  return v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
}

function parseLine(line: string): [string, Prop] | null {
  const colon = (() => { // first colon outside quotes
    let q = false;
    for (let i = 0; i < line.length; i++) { if (line[i] === '"') q = !q; else if (line[i] === ":" && !q) return i; }
    return -1;
  })();
  if (colon < 0) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) { const i = p.indexOf("="); if (i > 0) params[p.slice(0, i).toUpperCase()] = p.slice(i + 1).replace(/^"|"$/g, ""); }
  return [name.toUpperCase(), { value: line.slice(colon + 1), params }];
}

function readEvents(text: string): RawEvent[] {
  const out: RawEvent[] = [];
  let cur: RawEvent | null = null, depth = 0;
  for (const line of unfold(text)) {
    if (/^BEGIN:VEVENT$/i.test(line)) { cur = {}; depth = 0; continue; }
    if (!cur) continue;
    if (/^BEGIN:/i.test(line)) { depth++; continue; } // VALARM etc.
    if (/^END:VEVENT$/i.test(line)) { out.push(cur); cur = null; continue; }
    if (/^END:/i.test(line)) { depth--; continue; }
    if (depth > 0) continue;
    const p = parseLine(line);
    if (p) (cur[p[0]] ??= []).push(p[1]);
  }
  return out;
}

/** Wall-clock date and time of a UTC instant in a time zone. */
function inZone(utc: Date, tz: string): Stamp {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(utc).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** UTC instant of a wall-clock time in a time zone (two passes handle DST). */
function fromZone(day: string, time: string, tz: string): Date {
  const guess = new Date(`${day}T${time}:00Z`);
  let t = guess.getTime();
  for (let i = 0; i < 2; i++) {
    const s = inZone(new Date(t), tz);
    const shown = new Date(`${s.date}T${s.time}:00Z`).getTime();
    t += guess.getTime() - shown;
  }
  return new Date(t);
}

function parseStamp(p: Prop | undefined, tz: string): Stamp | null {
  if (!p) return null;
  const v = p.value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const day = `${m[1]}-${m[2]}-${m[3]}`;
  if (!m[4] || p.params.VALUE === "DATE") return { date: day, time: null };
  const time = `${m[4]}:${m[5]}`;
  if (m[7]) return inZone(new Date(`${day}T${time}:${m[6] ?? "00"}Z`), tz);
  const src = p.params.TZID;
  if (src && src !== tz) {
    try { return inZone(fromZone(day, time, src), tz); } catch { /* unknown zone: treat as local */ }
  }
  return { date: day, time };
}

const NO_SCHOOL = /\b(no school|school closed|schools closed|no classes|closed for)\b/i;

function cleanTitle(summary: string, noSchool: boolean) {
  const t = summary.replace(/\s+/g, " ").trim() || "School event";
  if (!noSchool) return t;
  const rest = t.replace(/^(no school|school closed|no classes)\s*[-–—:·|]*\s*/i, "").trim();
  return `No school · ${rest || "No school"}`;
}

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Start dates of every occurrence of a recurring event inside [from, to]. */
function occurrences(start: string, rrule: string, exdates: Set<string>, from: string, to: string): string[] {
  const r: Record<string, string> = {};
  for (const part of rrule.split(";")) { const [k, v] = part.split("="); if (k && v) r[k.toUpperCase()] = v; }
  const freq = r.FREQ, interval = Math.max(1, Number(r.INTERVAL ?? 1));
  const count = r.COUNT ? Number(r.COUNT) : Infinity;
  const until = r.UNTIL ? `${r.UNTIL.slice(0, 4)}-${r.UNTIL.slice(4, 6)}-${r.UNTIL.slice(6, 8)}` : null;
  const byday = r.BYDAY ? r.BYDAY.split(",").map((d) => WEEKDAYS.indexOf(d.slice(-2))).filter((d) => d >= 0) : null;
  const out: string[] = [];
  let n = 0;
  const take = (day: string) => {
    if (day < start) return true;
    if ((until && day > until) || n >= count) return false;
    n++;
    if (day >= from && day <= to && !exdates.has(day)) out.push(day);
    return day <= to;
  };
  const s = dayToDate(start);
  for (let i = 0; i < 2000; i++) {
    if (freq === "DAILY") { if (!take(addDays(start, i * interval))) break; }
    else if (freq === "WEEKLY") {
      const weekStart = addDays(start, i * 7 * interval - s.getUTCDay());
      const days = (byday ?? [s.getUTCDay()]).slice().sort((a, b) => a - b);
      let go = true;
      for (const d of days) { if (!take(addDays(weekStart, d))) { go = false; break; } }
      if (!go) break;
    } else if (freq === "MONTHLY" || freq === "YEARLY") {
      const d = new Date(s);
      if (freq === "MONTHLY") d.setUTCMonth(s.getUTCMonth() + i * interval); else d.setUTCFullYear(s.getUTCFullYear() + i * interval);
      if (d.getUTCDate() !== s.getUTCDate()) continue; // e.g. the 31st in a 30-day month
      if (!take(iso(d))) break;
    } else { take(start); break; }
  }
  return out;
}

/**
 * Parse an iCalendar feed into calendar rows whose start falls in [from, to]
 * (yyyy-mm-dd), in time zone `tz`. Recurring events become one row per
 * occurrence with uid `${UID}/${date}`.
 */
export function parseIcs(text: string, opts: { from: string; to: string; tz?: string }): SyncedEvent[] {
  const tz = opts.tz ?? "America/Detroit";
  const raw = readEvents(text);
  const overrides = new Set<string>(); // `${uid}/${date}` replaced by a RECURRENCE-ID event
  for (const e of raw) {
    const rid = parseStamp(e["RECURRENCE-ID"]?.[0], tz);
    if (rid && e.UID?.[0]) overrides.add(`${e.UID[0].value}/${rid.date}`);
  }
  const out: SyncedEvent[] = [];
  for (const e of raw) {
    const uid = e.UID?.[0]?.value?.trim();
    const start = parseStamp(e.DTSTART?.[0], tz);
    if (!uid || !start) continue;
    if ((e.STATUS?.[0]?.value ?? "").toUpperCase() === "CANCELLED") continue;
    const end = parseStamp(e.DTEND?.[0], tz);
    const summary = unescapeText(e.SUMMARY?.[0]?.value ?? "");
    const noSchool = NO_SCHOOL.test(summary);
    const location = unescapeText(e.LOCATION?.[0]?.value ?? "") || null;
    // length in days (all-day DTEND is exclusive)
    let spanDays = 0;
    if (end) {
      const endDay = start.time === null ? addDays(end.date, -1) : end.date;
      spanDays = Math.max(0, Math.round((dayToDate(endDay).getTime() - dayToDate(start.date).getTime()) / 86_400_000));
    }
    const sameDayEnd = start.time !== null && end?.time && spanDays === 0 ? end.time : null;
    const row = (day: string, id: string): SyncedEvent => ({
      uid: id,
      title: cleanTitle(summary, noSchool).slice(0, 200),
      starts_on: day,
      ends_on: spanDays > 0 ? addDays(day, spanDays) : null,
      start_time: noSchool ? null : start.time,
      end_time: noSchool ? null : sameDayEnd,
      location: location?.slice(0, 200) ?? null,
      no_school: noSchool,
    });
    const rid = parseStamp(e["RECURRENCE-ID"]?.[0], tz);
    const rrule = e.RRULE?.[0]?.value;
    if (rid) {
      if (start.date >= opts.from && start.date <= opts.to) out.push(row(start.date, `${uid}/${rid.date}`));
    } else if (rrule) {
      const ex = new Set<string>();
      for (const p of e.EXDATE ?? []) for (const v of p.value.split(",")) {
        const s = parseStamp({ value: v, params: p.params }, tz);
        if (s) ex.add(s.date);
      }
      for (const day of occurrences(start.date, rrule, ex, opts.from, opts.to)) {
        if (!overrides.has(`${uid}/${day}`)) out.push(row(day, `${uid}/${day}`));
      }
    } else if (start.date <= opts.to && (row(start.date, uid).ends_on ?? start.date) >= opts.from) {
      out.push(row(start.date, uid));
    }
  }
  return out.sort((a, b) => a.starts_on.localeCompare(b.starts_on) || (a.start_time ?? "").localeCompare(b.start_time ?? ""));
}
