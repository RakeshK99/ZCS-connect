# Supabase project setup

**Production project:** ZCS Connect · `bymugelbfznkynivvckp` · us-east-1 · SYZYGY-services organization (Pro).
API URL `https://bymugelbfznkynivvckp.supabase.co`. The publishable key is in `apps/mobile/app.config.ts`
and `apps/console/src/lib/supabase.ts` (safe to ship; every permission is enforced in the database).

The previous project (`rajiykcsrybkddbutctb`, V1 organization) only ever held the fictional demo school,
so the new project was built fresh from the migrations rather than copied.

## What was set up (October 16, 2026)

| Step | How | Check |
| --- | --- | --- |
| Extensions | `http` (to apply migrations from a pinned commit); the migrations enable `citext`, `pgmq`, `pg_cron`, `pg_net` | `select * from pg_extension` |
| Schema | Every file in `supabase/migrations/`, in order | 13 rows in `supabase_migrations.schema_migrations` |
| Demo school | `supabase/seed/demo_school.sql` | 46 students, 33 people, 7 posts, 6 conversations, 15 calendar events |
| Playground sign-ins | Auth users for the `rakesh+…@syzygy.services` personas with the shared demo password | Sign in on the playground |
| Delivery worker | Edge Function `deliver` from `supabase/functions/deliver/index.ts`, **JWT verification off** (it checks its own shared secret) | Function list shows `deliver` ACTIVE |
| Worker secrets | Vault `deliver_url` (the function URL) and `deliver_secret` (random, generated in the database, never shown) | `select name from vault.secrets` |
| Scheduled jobs | Created by the migrations: dispatch due posts (every minute), email fallback (every 5 min), worker kick (every minute), queue pruning (daily) | 4 rows in `cron.job` |
| End-to-end | `select private.kick_worker()` → worker answered 200 and processed the queued demo jobs | `net._http_response` |
| Tests | All three suites in `supabase/tests/` run on the live project inside a rolled-back transaction | 85 / 85 checks passed |
| Advisors | Security: no errors (the "signed-in users can execute" warnings are expected, every function checks permissions itself). Performance: fixed in `20261016000001_advisor_fixes.sql` | Dashboard → Advisors |

## Rebuilding a project from scratch (e.g. a staging copy)

1. Create the project and enable the `http` extension (schema `extensions`).
2. Apply each migration in `supabase/migrations/` in filename order.
3. Optional: run `supabase/seed/demo_school.sql` for the demo school.
4. Deploy `supabase/functions/deliver` with JWT verification **off**.
5. Add Vault secrets `deliver_url` = `https://<ref>.supabase.co/functions/v1/deliver` and
   `deliver_secret` = a long random value (`encode(extensions.gen_random_bytes(32), 'hex')`).
6. Run `select private.kick_worker();` and check `net._http_response` for a 200.
7. Point the apps at the project: `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_KEY` and
   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_KEY`.
8. Dashboard-only settings (Auth email code template, redirect URLs, Google/Apple providers, Edge
   Function secrets for Expo and Resend): see [`LAUNCH.md`](LAUNCH.md) step 1.

## Still to do in the dashboard (only a person can)

- **Authentication → Email:** email OTP on, template shows `{{ .Token }}`, 6 digits, 600 s.
- **Authentication → URL Configuration:** add `zcsconnect://auth-callback`,
  `https://rakeshk99.github.io/ZCS-connect/console/auth/callback` (playground) and the real console URL.
- **Authentication → Providers → Google:** redirect URI `https://bymugelbfznkynivvckp.supabase.co/auth/v1/callback`.
- **Edge Functions → deliver → Secrets:** `EXPO_ACCESS_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_LINK_BASE`.
- **Old project** `rajiykcsrybkddbutctb`: pause or delete once you're happy with the new one.
