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
};

const EXPO_TOKEN = Deno.env.get("EXPO_ACCESS_TOKEN");
const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "ZCS Connect <notify@zcs.org>";
const APP_LINK_BASE = Deno.env.get("APP_LINK_BASE") ?? "zcsconnect:/";
const TIME_BUDGET_MS = 45_000;

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

async function sendPushBatch(jobs: Job[]): Promise<Result[]> {
  // One Expo message per device token; results folded back per job.
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

  const results: Result[] = jobs.map((j) => ({
    msg_id: j.msg_id, post_id: j.job.post_id, message_id: j.job.message_id, person_id: j.job.person_id,
    channel: "push", status: "failed", invalid_tokens: [],
  }));

  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST", headers: expoHeaders(), body: JSON.stringify(chunk.map((m) => m.payload)),
      });
      const json = await res.json();
      const tickets: { status: string; id?: string; message?: string; details?: { error?: string } }[] = json.data ?? [];
      tickets.forEach((t, k) => {
        const m = chunk[k];
        const r = results[m.jobIndex];
        if (t.status === "ok") {
          r.status = "sent";
          r.provider_id = r.provider_id ?? t.id;
        } else {
          if (t.details?.error === "DeviceNotRegistered") r.invalid_tokens!.push(m.token);
          if (r.status !== "sent") r.detail = t.details?.error ?? t.message ?? "push failed";
        }
      });
    } catch (e) {
      chunk.forEach((m) => { results[m.jobIndex].detail = `push error: ${(e as Error).message}`; });
    }
  }
  return results;
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

async function sendEmail(j: Job): Promise<Result> {
  const base: Result = { msg_id: j.msg_id, post_id: j.job.post_id, message_id: j.job.message_id, person_id: j.job.person_id, channel: "email", status: "skipped" };
  if (isTestAddress(j.email)) return { ...base, detail: "test address" };
  if (!RESEND_KEY) return { ...base, detail: "email not configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: EMAIL_FROM, to: [j.email],
        subject: j.priority === "emergency" ? `EMERGENCY: ${j.title.replace(/^Emergency · /, "")}` : j.title,
        html: emailHtml(j),
        headers: { "X-Entity-Ref-ID": `${j.job.kind}-${j.job.post_id ?? j.job.message_id}-${j.job.person_id}` },
      }),
    });
    const json = await res.json();
    if (!res.ok) return { ...base, status: "failed", detail: json?.message ?? `email ${res.status}` };
    return { ...base, status: "sent", provider_id: json.id };
  } catch (e) {
    return { ...base, status: "failed", detail: `email error: ${(e as Error).message}` };
  }
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
    const pushResults = await sendPushBatch(push);
    pushResults.forEach((r, i) => {
      results.push(r);
      // every token failed → fall back to email right away
      if (r.status !== "sent") email.push({ ...push[i], action: "email", msg_id: null });
    });
  }
  const emailResults = await Promise.all(email.map(sendEmail));
  results.push(...emailResults);
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
  });
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
