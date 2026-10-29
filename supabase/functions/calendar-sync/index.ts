// ZCS Connect · school calendar sync
//
// ZCS keeps its school-wide events in Google Calendar (the source of truth,
// agreed Oct 2026). The office pastes the calendar's private iCal address into
// the staff console; pg_cron calls this function every 15 minutes (and the
// console's "Sync now" calls it right away). It reads the feed, turns events
// into calendar rows (ics.ts) and hands them to worker_sync_calendar(), which
// adds, updates and removes Google events without touching events entered by
// hand or class events.
//
// Protected by the same shared secret as the delivery worker (Vault
// deliver_secret, checked with worker_check_secret), not a user JWT.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (provided).

import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { parseIcs } from "./ics.ts";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024;
const TZ = "America/Detroit";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function windowDays() {
  const today = new Date();
  const from = new Date(today); from.setUTCDate(from.getUTCDate() - 60);
  const to = new Date(today); to.setUTCDate(to.getUTCDate() + 400);
  const d = (x: Date) => x.toISOString().slice(0, 10);
  return { from: d(from), to: d(to) };
}

async function fetchFeed(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "text/calendar" } });
    if (!res.ok) throw new Error(`The calendar link answered ${res.status}. Check that it's the calendar's secret iCal address.`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error("The calendar feed is larger than 5 MB.");
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("That link isn't an iCal calendar feed.");
    return text;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("The calendar took too long to answer.");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  const secret = req.headers.get("x-deliver-secret") ?? "";
  const { data: ok } = await db.rpc("worker_check_secret", { p_secret: secret });
  if (!ok) return json({ error: "forbidden" }, 403);

  const { data: sources, error } = await db.rpc("worker_calendar_sources");
  if (error) return json({ error: error.message }, 500);

  const { from, to } = windowDays();
  const results: { school_id: string; events?: number; error?: string }[] = [];
  for (const s of (sources ?? []) as { school_id: string; ics_url: string }[]) {
    try {
      const events = parseIcs(await fetchFeed(s.ics_url), { from, to, tz: TZ });
      const { error: e } = await db.rpc("worker_sync_calendar", { p_school: s.school_id, p_events: events, p_from: from, p_to: to, p_error: null });
      if (e) throw new Error(e.message);
      results.push({ school_id: s.school_id, events: events.length });
    } catch (e) {
      const message = (e as Error).message.slice(0, 300);
      await db.rpc("worker_sync_calendar", { p_school: s.school_id, p_events: [], p_from: from, p_to: to, p_error: message });
      results.push({ school_id: s.school_id, error: message });
    }
  }
  return json({ synced: results });
});
