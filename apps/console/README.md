# ZCS Connect · staff console (web)

Next.js 16 (App Router) + Tailwind v4 + Supabase. For the office, principals and admins.
Not part of the Claude Design file, so it reuses the same brand tokens (navy, maize, Cabin).

| Page | Who sees it | What it does |
| --- | --- | --- |
| Dashboard | Office, principals | School stats, recent announcements with live reach |
| New announcement | All staff | Any audience the server allows, priority (emergency with confirmation), schedule, photos/PDFs, preview as a parent |
| Post reach | Author, office, principal | Reached/read/confirmed, by channel, remind, CSV export |
| Family requests | Office | Connect an unknown parent to their children (or dismiss) |
| Roster import | Office | 4-step wizard: upload → check columns → preview diff → apply; undo the latest import |
| People & roles | Office (view), admin (edit) | Add staff, grant/revoke roles with scope and end date |
| School calendar | Office | Academic calendar and no-school days shown in the app |
| Conversation review | Admin | Read a parent–teacher thread with a required reason; always audited |
| Audit log | Admin | Append-only record, filterable |

```bash
pnpm dev:console           # http://localhost:3000
pnpm --filter console build
```

Sign-in: Google restricted to `@zcs.org`, or an email code for existing staff accounts.
Deploy on Vercel (root directory `apps/console`), with `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_KEY` set, and add the deployed URL plus `/auth/callback` to Supabase
Auth → URL configuration.
