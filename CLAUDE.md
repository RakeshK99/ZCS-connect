# ZCS Connect — instructions for Claude Code

Parent–school communication platform for Zeeland Christian School (ZCS): an Expo app for iOS + Android
(parents and teachers) and a Next.js web console for office staff. Backend will be Supabase.

**Read `docs/SPEC.md` before any feature work.** It is the requirements source of truth. If code and spec
disagree, stop and ask; don't silently pick one.

## Current phase: frontend first, on mock data

We are building the UI for both apps against an in-memory mock data layer. Supabase is wired in later.
So:

- All data access goes through the `DataSource` interface in `packages/core`. Screens never import
  fixtures directly and never call `fetch`/Supabase directly.
- `packages/mock` implements `DataSource` with realistic fixtures and simulated latency (150–400 ms) and
  simulated delivery progress, so loading, empty and error states are real.
- Permission and audience logic (`can_read_post`, `can_post_to`, audience resolution, context derivation)
  lives as pure functions in `packages/core/permissions` with unit tests. The UI uses these to decide
  what to *show*; the database will enforce the same rules later. Keep them in sync with SPEC §Roles
  and §Audience rules.

## Repo layout (pnpm workspace)

```
apps/mobile      Expo SDK (latest stable), Expo Router, TanStack Query, TypeScript strict
apps/console     Next.js (App Router), Tailwind, TypeScript strict
packages/core    Domain types, DataSource interface, permissions, audience resolution, zod schemas
packages/mock    Fixtures + MockDataSource
packages/ui      Design tokens (colors, type, spacing) shared by both apps
docs/            SPEC.md, prompts/, decisions/ (one short md per decision, ADR style)
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

- TypeScript strict, no `any`. Zod for every form and every DataSource boundary.
- Feature folders: `apps/mobile/src/features/<feature>/{screens,components,hooks}`.
- Copy is warm and plain. "Families", not "users". Use the child's preferred name.
- Tests: Vitest for `packages/*`; React Native Testing Library for key screens; Playwright smoke test
  for the console. `pnpm check` = lint + typecheck + test must pass before every commit.
- Small commits with clear messages. Don't add dependencies without a one-line reason in the PR.

## Commands (keep these working)

```
pnpm install
pnpm dev:mobile     # Expo dev server (press i / a, or scan with Expo Go)
pnpm dev:console    # http://localhost:3000
pnpm check          # lint + typecheck + tests, all workspaces
```

## Demo personas (mock data must include all of these)

- **Sarah VanDyke** — parent of Emma (3rd grade) and Noah (Kindergarten). Two guardians on both kids.
- **Mrs. Jennifer Smith** — 3rd-grade teacher **and** parent of Lily (6th grade) → exercises the context switcher.
- **Mr. David Kuiper** — Middle School principal.
- **Linda Brouwer** — office communicator + emergency sender.
- **Tom Hoekstra** — district admin (IT): users, roster import, audit log, oversight.
- **Unknown parent** — signs in with an email not on the roster.

Use invented names only; never put real roster data in fixtures or commits.
