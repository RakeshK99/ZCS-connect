# Frontend build — prompts for Claude Code

Paste these one at a time, in order. Each ends with a working, demoable state. Review the result
(run it on your phone with Expo Go or the iOS simulator) before pasting the next one.
Claude Code reads `CLAUDE.md` automatically; the prompts assume it has.

---

## Prompt 1 — Scaffold and design system

> Read CLAUDE.md and docs/SPEC.md fully. Then scaffold the pnpm workspace exactly as described in
> CLAUDE.md "Repo layout": apps/mobile (Expo, latest stable SDK, Expo Router, TypeScript strict),
> apps/console (Next.js App Router + Tailwind), packages/core, packages/mock, packages/ui.
> Set up `pnpm dev:mobile`, `pnpm dev:console` and `pnpm check` (ESLint, tsc, Vitest).
> In packages/ui create the design tokens from CLAUDE.md "Design system" (light + dark), bundle Cabin,
> and build the base mobile components: Screen, Header (navy), Button (primary/secondary/destructive),
> Card, Chip, Avatar, Badge, ListRow, EmptyState, Skeleton, Toast, PriorityPill (Normal/Important/Emergency).
> Add a hidden /dev/components screen in the mobile app that shows every component in both themes.
> Stop when `pnpm check` passes and both apps start. Summarize what you built and anything you assumed.

## Prompt 2 — Domain model, permissions and mock data

> Implement packages/core: TypeScript types mirroring SPEC §Data model (people, memberships, students,
> guardianships, classes, groups, posts, post_recipients, deliveries, reads, acknowledgments, threads,
> messages, calendar events, academic calendar days, preferences, audit_log).
> Define the `DataSource` interface (async methods the screens need: session, contexts, feed, post detail,
> compose/send/schedule, reach report, threads/messages, calendar, preferences, roster import, users &
> memberships, audit log, oversight).
> Implement pure permission functions: deriveContexts(person), canReadPost, allowedAudiences(membership),
> resolveAudience(spec), canMessage(a, b). Write Vitest tests for every row of SPEC §Roles and
> §Audience rules, including the DENIED cases (e.g. teacher cannot see another class; parent cannot see
> a post for a grade their child isn't in; no-contact guardian receives nothing).
> Implement packages/mock: a fictional school (Preschool–8th, ~12 classes, ~60 students, ~100 guardians),
> all demo personas from CLAUDE.md, 30 days of posts across all priorities, threads, an academic calendar
> for 2026-27, and simulated delivery progress for newly sent posts.

## Prompt 3 — Sign-in and onboarding (mobile)

> Build the passwordless sign-in and onboarding flow from SPEC §Parent onboarding against MockDataSource:
> welcome screen (the one place "burns bright" campaign voice appears), Sign in with Apple / Google /
> email code (6-digit code entry with paste + autofill), "we found your children" confirmation,
> notification pre-permission explainer, and the "we couldn't find your family" screen with a one-tap
> request to the office. Add a dev-only persona picker so we can sign in as any demo persona.
> No password fields anywhere.

## Prompt 4 — Parent experience

> Build the parent context tabs: Home (pinned/Important at top, Emergency banner, feed, child filter
> chips, search, pull-to-refresh, offline cached state), Post detail (attachments, acknowledge button,
> "edited" label), Messages (threads grouped by child, thread view, composer with attachments, staff
> office-hours notice, oversight disclosure), Calendar (academic calendar month + agenda views, no-school
> days, events, add-to-phone-calendar), Profile (children, notification preferences per category with
> quiet hours — Emergency locked on, language, help, sign out, delete account flow).

## Prompt 5 — Teacher experience and the context switcher

> Build the teacher context: Classes tab (class list, roster with guardian contacts respecting
> hide_contact flags), the New post floating button and the under-30-second compose flow (class picker
> defaulting to last used, dictation-friendly text field, photos/PDFs, schedule, request acknowledgment,
> audiences limited by allowedAudiences), and a per-post live reach bar ("23 of 24 families reached ·
> 18 read") with drill-down to families not reached.
> Then build the context switcher for multi-context people (Mrs. Smith): header control, per-context
> feed/inbox/badges, remembers last context, and notification taps switch context automatically.
> Add tests proving Mrs. Smith's own class posts never appear as unread in her parent context.

## Prompt 6 — Staff console (web)

> Build the Next.js console against MockDataSource, with Google-only (@zcs.org) sign-in mocked and a
> persona picker in dev. Screens: Dashboard (recent sends with reach), Compose (any allowed audience,
> priority incl. Emergency with confirm step and optional second approver, schedule, preview as parent),
> Reach report per post (by channel, not reached, CSV export), Roster import wizard (upload CSV → map
> columns with auto-detection for shifted name columns → dry-run diff of adds/changes/deactivations and
> guardian de-dup → confirm; reversible), People & roles (grant/revoke memberships with scope and dates),
> Pending family requests queue, Academic calendar editor, Oversight (read any parent–teacher thread;
> every open writes an audit entry and shows a banner), Audit log (filterable).
> Make the roster wizard usable by a non-technical office manager.

## Prompt 7 — Polish and store readiness pass

> Do an accessibility and polish pass on both apps: screen-reader labels, Dynamic Type at the largest
> size, 44pt targets, contrast check against the tokens, dark mode, haptics, empty/loading/error states on
> every screen, and skeletons instead of spinners. Add app icon and splash from the brand assets with
> correct clear space. Add a reviewer demo mode (seeded fake school) for App Store review. List anything
> in SPEC §Privacy and §Apple/Google checklists that the frontend still doesn't satisfy.
