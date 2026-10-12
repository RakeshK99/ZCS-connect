# Supabase backend

Project: **ZCS Connect** (`rajiykcsrybkddbutctb`, ca-central-1).

| Path | What it is |
| --- | --- |
| `migrations/` | Schema, row-level security, RPCs, delivery queue, cron jobs. Source of truth; apply in order. |
| `functions/deliver/` | Edge Function that drains the `notify` queue and sends push (Expo) and email. |
| `seed/demo_school.sql` | Fictional demo school for development, the pilot walkthrough and App Store review. |
| `tests/permissions_test.sql` | 44 allow/deny checks across every role. Runs in a transaction and rolls back. |

## Security model in one paragraph

Authority comes only from `memberships` (staff roles, each scoped to the school, a
division or a class) and `guardianships` (parent ↔ student links created by roster
import or the office). There is no role column a user could edit. Every table has
RLS with deny-by-default; clients read through policies and write only through
`SECURITY DEFINER` RPCs that check permissions and write `audit_log`. Admins can
review parent–teacher conversations only through `oversight_open_thread()`, which
requires a reason and is always audited.

## Common tasks

```bash
# apply migrations to a new environment
supabase link --project-ref <ref> && supabase db push
# load the demo school (dev/staging only)
psql "$DB_URL" -f supabase/seed/demo_school.sql
# run the permission tests
psql "$DB_URL" -f supabase/tests/permissions_test.sql
```

Before loading the real roster: `select private.remove_demo_data();`

## Tests and benchmarks

```bash
supabase/tests/run_local.sh          # migrations + demo seed + every *_test.sql (85 checks), on a throwaway PostgreSQL
BENCH=1 supabase/tests/run_local.sh  # scales the demo school to ~1,000 students / ~2,000 guardians and times the hot paths
```

Both run on plain PostgreSQL 16+ with small stand-ins for the Supabase platform (`tests/local/platform_stubs.sql`),
so they work locally and in CI without Docker. CI runs the tests on every pull request.
