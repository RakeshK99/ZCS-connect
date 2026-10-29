// No imports beyond the parser, so CI needs no network for these tests.
function assertEquals(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected\n${e}\ngot\n${a}`);
}
import { parseIcs } from "./ics.ts";

const cal = (...events: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR"].join("\r\n");
const ev = (...lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");
const W = { from: "2026-08-01", to: "2027-07-31" };

Deno.test("all-day single and multi-day events (DTEND is exclusive)", () => {
  const rows = parseIcs(cal(
    ev("UID:a", "DTSTART;VALUE=DATE:20261023", "DTEND;VALUE=DATE:20261024", "SUMMARY:Partnership Night prep"),
    ev("UID:b", "DTSTART;VALUE=DATE:20261125", "DTEND;VALUE=DATE:20261128", "SUMMARY:No School - Thanksgiving Break"),
  ), W);
  assertEquals(rows, [
    { uid: "a", title: "Partnership Night prep", starts_on: "2026-10-23", ends_on: null, start_time: null, end_time: null, location: null, no_school: false },
    { uid: "b", title: "No school · Thanksgiving Break", starts_on: "2026-11-25", ends_on: "2026-11-27", start_time: null, end_time: null, location: null, no_school: true },
  ]);
});

Deno.test("timed events: TZID, UTC (converted to Detroit), folded and escaped text", () => {
  const rows = parseIcs(cal(
    ev("UID:c", "DTSTART;TZID=America/Detroit:20261023T183000", "DTEND;TZID=America/Detroit:20261023T200000",
       "SUMMARY:Partnership Night", "LOCATION:Central Avenue\\, Gym"),
    ev("UID:d", "DTSTART:20261028T121500Z", "DTEND:20261028T130000Z", "SUMMARY:All-school chap", " el"),
  ), W);
  assertEquals(rows.map((r) => [r.uid, r.title, r.starts_on, r.start_time, r.end_time, r.location]), [
    ["c", "Partnership Night", "2026-10-23", "18:30", "20:00", "Central Avenue, Gym"],
    ["d", "All-school chapel", "2026-10-28", "08:15", "09:00", null],
  ]);
});

Deno.test("UTC after the DST change uses EST", () => {
  const [r] = parseIcs(cal(ev("UID:e", "DTSTART:20261203T140000Z", "SUMMARY:Concert")), W);
  assertEquals([r.starts_on, r.start_time], ["2026-12-03", "09:00"]);
});

Deno.test("cancelled events and events outside the window are skipped", () => {
  const rows = parseIcs(cal(
    ev("UID:f", "DTSTART;VALUE=DATE:20261101", "STATUS:CANCELLED", "SUMMARY:Gone"),
    ev("UID:g", "DTSTART;VALUE=DATE:20250101", "SUMMARY:Old"),
    ev("UID:h", "DTSTART;VALUE=DATE:20261102", "SUMMARY:Kept", "BEGIN:VALARM", "TRIGGER:-PT15M", "SUMMARY:Alarm", "END:VALARM"),
  ), W);
  assertEquals(rows.map((r) => r.title), ["Kept"]);
});

Deno.test("weekly recurrence with BYDAY, COUNT, EXDATE and an override", () => {
  const rows = parseIcs(cal(
    ev("UID:chapel", "DTSTART;TZID=America/Detroit:20261104T081500", "DTEND;TZID=America/Detroit:20261104T090000",
       "RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=4", "EXDATE;TZID=America/Detroit:20261111T081500", "SUMMARY:Chapel"),
    ev("UID:chapel", "RECURRENCE-ID;TZID=America/Detroit:20261118T081500", "DTSTART;TZID=America/Detroit:20261118T100000", "SUMMARY:Chapel (late start)"),
  ), W);
  assertEquals(rows.map((r) => [r.uid, r.starts_on, r.start_time, r.title]), [
    ["chapel/2026-11-04", "2026-11-04", "08:15", "Chapel"],
    ["chapel/2026-11-18", "2026-11-18", "10:00", "Chapel (late start)"],
    ["chapel/2026-11-25", "2026-11-25", "08:15", "Chapel"],
  ]);
});

Deno.test("daily recurrence with UNTIL, and monthly", () => {
  const rows = parseIcs(cal(
    ev("UID:conf", "DTSTART;VALUE=DATE:20261117", "RRULE:FREQ=DAILY;UNTIL=20261119", "SUMMARY:Conferences"),
    ev("UID:pta", "DTSTART;VALUE=DATE:20260915", "RRULE:FREQ=MONTHLY;COUNT=3", "SUMMARY:Parent Council"),
  ), W);
  assertEquals(rows.map((r) => `${r.uid}`), ["pta/2026-09-15", "pta/2026-10-15", "conf/2026-11-17", "pta/2026-11-15", "conf/2026-11-18", "conf/2026-11-19"].sort((a, b) => {
    const d = (s: string) => s.split("/")[1]; return d(a).localeCompare(d(b));
  }));
});
