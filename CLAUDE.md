# ZCS Connect — instructions for Claude Code

Parent–school communication platform for Zeeland Christian School (ZCS): an Expo app for iOS + Android
(parents and teachers) and a Next.js web console for office staff, on Supabase.

**Read `docs/SPEC.md` before any feature work.** It is the requirements source of truth. If code and spec
disagree, stop and ask; don't silently pick one. `docs/LAUNCH.md` lists the remaining manual setup.

## How it's built

- **The database is the authority.** Every read is gated by row-level security (deny by default) and
  every write goes through a `SECURITY DEFINER` RPC with `search_path = ''` that checks permissions and
  writes `audit_log`. Clients only `select` and call RPCs. Authority comes only from `memberships`
  (staff roles with scope) and `guardianships` (parent ↔ student); there is no role column on people.
- **Schema changes are new migrations** in `supabase/migrations/` (never edit an applied one). Add an
  allow and a deny case to `supabase/tests/permissions_test.sql` for any new permission.
- **Clients** call Supabase only through the typed wrappers in `packages/core` (`api.ts`, `admin.ts`).
  The UI may hide things the user can't do, but must never be the only check.
- **Delivery:** posts and messages enqueue jobs on pgmq `notify`; the `deliver` Edge Function sends
  push (Expo) and email (Resend), records `deliveries`, and pg_cron drives scheduling, email fallback
  after 15 minutes and receipts. Quiet hours delay everything except emergencies.

## Repo layout (pnpm workspace)

```
apps/mobile      Expo SDK 57, Expo Router, TanStack Query (persisted offline cache), TypeScript strict
apps/console     Next.js 16 (App Router), Tailwind v4, TypeScript strict
packages/core    Types, typed RPC client, formatting, context helpers, roster parsing (Vitest)
supabase/        migrations, functions/deliver, seed/demo_school.sql, tests/permissions_test.sql
docs/            SPEC.md, LAUNCH.md, screenshots
```

## Non-negotiable product rules

1. **No passwords.** Parents: Sign in with Apple, Google, or 6-digit email code. Staff: Google, `@zcs.org` only.
2. **Roles are never self-selected.** No "I am a teacher/parent" picker. Contexts come from memberships.
3. **Parents never link themselves to children.** Children come from the roster; unknown email →
   "we couldn't find your family" + request-to-office.
4. **Context switcher** for people with more than one context (e.g. teacher + parent). Each context has
   its own feed, inbox and badge counts. Opens in last-used context.
5. **Composer only offers audiences the sender may target.**
6. **Emergency** priority is visually distinct (semantic red), can't be muted, and is limited to
   emergency-sender memberships.
7. **Oversight (H3):** district admins can read all parent–teacher threads in the console; every view
   writes an audit entry; parents see a disclosure in Messages.
8. No parent-to-parent messaging, no comments, no student accounts, no ads or third-party trackers.

## Design system

- Navy `#041E42` (primary, headers), Maize `#F1C400` (accent — only on navy, or as a fill with navy text),
  white surfaces, red only for Emergency. Never maize text on white (fails contrast).
- Headings: Cabin (OFL; bundle the font files). Body: system font.
- Native patterns per platform: tab bars, sheets, haptics, swipe actions. Dark mode follows system.
- WCAG 2.2 AA: every touchable has an accessibility label, ≥44pt hit area; support Dynamic Type.
- Logo files go in `apps/mobile/assets/brand/` — never recolor, stretch, rotate or add effects;
  keep ¼-icon clear space.

## Conventions

- TypeScript strict, no `any`. Validate inputs in the RPC; keep client validation for friendly messages only.
- Routes live in `apps/mobile/src/app` (Expo Router); shared pieces in `src/features/<feature>` and `src/components`.
- Copy is warm and plain. "Families", not "users". Use the child's preferred name.
- Tests: Vitest for `packages/core`, SQL permission tests for the database. `pnpm check` (typecheck +
  tests) and CI must pass before merging.
- Small commits with clear messages. Don't add dependencies without a one-line reason in the PR.

## Commands (keep these working)

```
pnpm install
pnpm dev:mobile     # Expo dev server (use a development build: npx eas-cli build --profile development)
pnpm dev:console    # http://localhost:3000
pnpm check          # typecheck + tests, all workspaces
```

## Demo personas (in `supabase/seed/demo_school.sql`)

- **Sarah VanDyke** — parent of Emma (3rd grade) and Noah (Kindergarten). Two guardians on both kids.
- **Mrs. Jennifer Smith** — 3rd-grade teacher **and** parent of Lily (6th grade) → exercises the context switcher.
- **Mr. David Kuiper** — Middle School principal.
- **Linda Brouwer** — office communicator + emergency sender.
- **Tom Hoekstra** — district admin (IT): users, roster import, audit log, oversight.
- **Unknown parent** — signs in with an email not on the roster.

Use invented names only; never put real roster data in fixtures or commits.
