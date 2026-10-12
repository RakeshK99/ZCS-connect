// ZCS Connect · delivery worker
//
// Drains the pgmq `notify` queue: worker_claim() decides per job whether to push,
// email or skip (preferences, quiet hours, no device, already read); this function
// performs the sends and reports results with worker_complete(). It also polls
// Expo push receipts so the reach report can show "delivered" vs "failed".
//
// Triggered by pg_net right after a send (fast path) and by pg_cron every minute
// (safety net). Protected by a shared secret header, not a user JWT.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (provided),
//      EXPO_ACCESS_TOKEN (optional), RESEND_API_KEY + EMAIL_FROM (optional until DNS is set up),
//      APP_LINK_BASE (e.g. https://app.zcs.org) for links in emails.
// The trigger secret lives in Vault (deliver_secret) and is checked via worker_check_secret().

import { createClient } from "npm:@supabase/supabase-js@2.117.3";

type Job = {
  msg_id: number | null;
  attempt?: number;
  job: { kind: "post" | "message"; post_id?: string; message_id?: string; person_id: string; channel: "push" | "email"; context: string };
  action: "push" | "email" | "skip";
  reason: string | null;
  email: string;
  first_name: string;
  tokens: string[];
  title: string;
  body: string;
  route: string;
  context: string;
  context_label: string;
  priority: "normal" | "important" | "emergency";
  author: string | null;
  full_body: string | null;
};

type Result = {
  msg_id: number | null;
  post_id?: string;
  message_id?: string;
  person_id: string;
  channel: "push" | "email";
  status: "sent" | "delivered" | "failed" | "skipped" | "none";
  provider_id?: string;
  detail?: string;
  invalid_tokens?: string[];
  device_token?: string;
  /** retryable failure (rate limit, provider outage, timeout): the job stays queued with backoff */
  retry?: boolean;
};

const EXPO_TOKEN = Deno.env.get("EXPO_ACCESS_TOKEN");
const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "ZCS Connect <notify@zcs.org>";
const APP_LINK_BASE = Deno.env.get("APP_LINK_BASE") ?? "zcsconnect:/";
const TIME_BUDGET_MS = 45_000;
const FETCH_TIMEOUT_MS = 15_000;
const EMAIL_BATCH = 100;          // Resend batch endpoint limit
const EMAIL_BATCH_GAP_MS = 600;   // stay under Resend's default 2 requests/second

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const retryable = (status: number) => status === 429 || status >= 500;

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

// Reserved test domains never receive mail.
const isTestAddress = (email: string) => /@(example\.(com|org|net)|test)$/i.test(email);

function expoHeaders() {
  const h: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (EXPO_TOKEN) h.Authorization = `Bearer ${EXPO_TOKEN}`;
  return h;
}

async function sendPushBatch(jobs: Job[]): Promise<{ results: Result[]; fallbackEmail: Job[] }> {
  // One Expo message per device token. Each ticket becomes its own delivery row
  // (with its token) so receipts can prune devices that were uninstalled.
  const messages: { jobIndex: number; token: string; payload: Record<string, unknown> }[] = [];
  jobs.forEach((j, jobIndex) => {
    for (const token of j.tokens) {
      const emergency = j.priority === "emergency";
      messages.push({
        jobIndex,
        token,
        payload: {
          to: token,
          title: j.title,
          subtitle: j.context === "parent" ? j.context_label : undefined,
          body: j.body,
          sound: "default",
          priority: "high",
          channelId: emergency ? "emergency" : j.job.kind === "message" ? "messages" : "default",
          interruptionLevel: emergency ? "time-sensitive" : "active",
          data: { route: j.route, context: j.context, kind: j.job.kind },
        },
      });
    }
  });

  const base = (j: Job): Result => ({ msg_id: j.msg_id, post_id: j.job.post_id, message_id: j.job.message_id, person_id: j.job.person_id, channel: "push", status: "failed" });
  const perJob: { sent: Result[]; failed: Result[]; retry: boolean; invalid: string[] }[] = jobs.map(() => ({ sent: [], failed: [], retry: false, invalid: [] }));

  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST", headers: expoHeaders(), body: JSON.stringify(chunk.map((m) => m.payload)),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        const transient = retryable(res.status);
        chunk.forEach((m) => {
          if (transient) perJob[m.jobIndex].retry = true;
          else perJob[m.jobIndex].failed.push({ ...base(jobs[m.jobIndex]), device_token: m.token, detail: `push ${res.status}` });
        });
        continue;
      }
      const json = await res.json();
      const tickets: { status: string; id?: string; message?: string; details?: { error?: string } }[] = json.data ?? [];
      chunk.forEach((m, k) => {
        const t = tickets[k];
        const out = perJob[m.jobIndex];
        if (t?.status === "ok") {
          out.sent.push({ ...base(jobs[m.jobIndex]), status: "sent", provider_id: t.id, device_token: m.token });
        } else if (t?.details?.error === "DeviceNotRegistered") {
          out.invalid.push(m.token);
        } else if (t?.details?.error === "MessageRateExceeded") {
          out.retry = true;
        } else {
          out.failed.push({ ...base(jobs[m.jobIndex]), device_token: m.token, detail: t?.details?.error ?? t?.message ?? "push failed" });
        }
      });
    } catch (e) {
      // network error or timeout: try the whole chunk again later
      chunk.forEach((m) => { perJob[m.jobIndex].retry = true; perJob[m.jobIndex].failed.push({ ...base(jobs[m.jobIndex]), detail: `push error: ${(e as Error).message}` }); });
    }
  }

  const results: Result[] = [];
  const fallbackEmail: Job[] = [];
  perJob.forEach((o, i) => {
    const j = jobs[i];
    if (o.sent.length) {
      // at least one device got it: record the tickets (and prune dead tokens)
      results.push(...o.sent.map((r, k) => (k === 0 ? { ...r, invalid_tokens: o.invalid } : r)));
    } else if (o.retry) {
      results.push({ ...base(j), status: "failed", detail: o.failed[0]?.detail ?? "push temporarily unavailable", retry: true, invalid_tokens: o.invalid });
    } else {
      // every device failed for good: record it, prune dead tokens, and email instead
      // (emergencies already have their own email job, so they don't get a second one)
      results.push({ ...base(j), status: "failed", detail: o.failed[0]?.detail ?? "no working device", invalid_tokens: o.invalid });
      if (j.priority !== "emergency") fallbackEmail.push({ ...j, action: "email", msg_id: null });
    }
  });
  return { results, fallbackEmail };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function emailHtml(j: Job) {
  const emergency = j.priority === "emergency";
  const body = escapeHtml(j.full_body ?? j.body).replace(/\n/g, "<br>");
  const link = `${APP_LINK_BASE}${j.route}`;
  return `<!doctype html><html><body style="margin:0;background:#F5F7F9;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111C2C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #DDE2E9">
<tr><td style="background:${emergency ? "#B3261E" : "#041E42"};padding:18px 24px;color:#fff;font-weight:700;font-size:16px">
${emergency ? "EMERGENCY ALERT · " : ""}Zeeland Christian School</td></tr>
<tr><td style="padding:24px">
<div style="font-size:13px;color:#52637A;margin-bottom:6px">${escapeHtml(j.author ?? "ZCS")}</div>
<h1 style="font-size:22px;line-height:1.25;margin:0 0 14px">${escapeHtml(j.title.replace(/^Emergency · /, ""))}</h1>
<div style="font-size:16px;line-height:1.55">${body}</div>
<p style="margin:24px 0 0"><a href="${link}" style="display:inline-block;background:#041E42;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">Open in ZCS Connect</a></p>
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #DDE2E9;font-size:12px;color:#627084">
You're receiving this because you're listed as a ZCS family contact. Install the ZCS Connect app to get these as notifications instead of email.
</td></tr></table></td></tr></table></body></html>`;
}

function emailPayload(j: Job) {
  return {
    from: EMAIL_FROM, to: [j.email],
    subject: j.priority === "emergency" ? `EMERGENCY: ${j.title.replace(/^Emergency · /, "")}` : j.title,
    html: emailHtml(j),
    headers: { "X-Entity-Ref-ID": `${j.job.kind}-${j.job.post_id ?? j.job.message_id}-${j.job.person_id}` },
  };
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Sends through Resend's batch endpoint (100 per request), paced under the rate
// limit. A batch that hits a rate limit or outage is retried later; the
// idempotency key stops a retried batch from being delivered twice.
async function sendEmails(jobs: Job[]): Promise<Result[]> {
  const base = (j: Job): Result => ({ msg_id: j.msg_id, post_id: j.job.post_id, message_id: j.job.message_id, person_id: j.job.person_id, channel: "email", status: "skipped" });
  const results: Result[] = [];
  const sendable: Job[] = [];
  for (const j of jobs) {
    if (!j.email || isTestAddress(j.email)) results.push({ ...base(j), detail: "test address" });
    else if (!RESEND_KEY) results.push({ ...base(j), detail: "email not configured" });
    else sendable.push(j);
  }
  for (let i = 0; i < sendable.length; i += EMAIL_BATCH) {
    const chunk = sendable.slice(i, i + EMAIL_BATCH);
    if (i > 0) await sleep(EMAIL_BATCH_GAP_MS);
    const key = await sha256(chunk.map((j) => `${j.job.kind}:${j.job.post_id ?? j.job.message_id}:${j.job.person_id}:${(j.job as { reminder?: boolean }).reminder ? "r" : ""}`).sort().join("|"));
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(chunk.map(emailPayload)),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = json?.message ?? `email ${res.status}`;
        chunk.forEach((j) => results.push({ ...base(j), status: "failed", detail, retry: retryable(res.status) }));
        if (res.status === 429) await sleep(1000);
        continue;
      }
      const ids: { id: string }[] = json.data ?? [];
      chunk.forEach((j, k) => results.push({ ...base(j), status: "sent", provider_id: ids[k]?.id }));
    } catch (e) {
      chunk.forEach((j) => results.push({ ...base(j), status: "failed", detail: `email error: ${(e as Error).message}`, retry: true }));
    }
  }
  return results;
}

async function processBatch(jobs: Job[]) {
  const results: Result[] = [];
  const push = jobs.filter((j) => j.action === "push");
  const email = jobs.filter((j) => j.action === "email");
  for (const j of jobs.filter((j) => j.action === "skip")) {
    results.push({ msg_id: j.msg_id, post_id: j.job.post_id, message_id: j.job.message_id, person_id: j.job.person_id,
      channel: j.job.channel, status: "skipped", detail: j.reason ?? undefined });
  }
  if (push.length) {
    const { results: pushResults, fallbackEmail } = await sendPushBatch(push);
    results.push(...pushResults);
    email.push(...fallbackEmail);
  }
  results.push(...(await sendEmails(email)));
  const { error } = await db.rpc("worker_complete", { p_results: results });
  if (error) throw error;
  return results;
}

async function pollReceipts() {
  const { data: pending } = await db.rpc("worker_pending_receipts", { p_limit: 300 });
  const rows = (pending ?? []) as { id: number; provider_id: string }[];
  if (!rows.length) return 0;
  const res = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
    method: "POST", headers: expoHeaders(), body: JSON.stringify({ ids: rows.map((r) => r.provider_id) }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return 0;
  const json = await res.json();
  const receipts = json.data ?? {};
  const updates = rows.filter((r) => receipts[r.provider_id]).map((r) => {
    const rc = receipts[r.provider_id];
    return { id: r.id, status: rc.status === "ok" ? "delivered" : "failed", detail: rc.details?.error ?? rc.message ?? null };
  });
  if (updates.length) await db.rpc("worker_apply_receipts", { p_receipts: updates });
  return updates.length;
}

Deno.serve(async (req) => {
  const secret = req.headers.get("x-deliver-secret") ?? "";
  const { data: ok } = secret ? await db.rpc("worker_check_secret", { p_secret: secret }) : { data: false };
  if (!ok) return new Response("forbidden", { status: 403 });
  const started = Date.now();
  let processed = 0;
  try {
    while (Date.now() - started < TIME_BUDGET_MS) {
      const { data, error } = await db.rpc("worker_claim", { p_n: 100 });
      if (error) throw error;
      const jobs = (data ?? []) as Job[];
      if (!jobs.length) break;
      await processBatch(jobs);
      processed += jobs.length;
    }
    const receipts = await pollReceipts();
    return Response.json({ processed, receipts, ms: Date.now() - started });
  } catch (e) {
    console.error("deliver failed", e);
    return Response.json({ processed, error: (e as Error).message }, { status: 500 });
  }
});
