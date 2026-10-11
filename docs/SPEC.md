# ZCS Connect — Product Requirements & Architecture Spec

Source of truth: the living spec doc (Claude Docs). This file is a snapshot dated 2026-10-10 for engineering.

**Build status (2026-10-10):** v1 is implemented: app (parent + teacher), staff console, database and delivery. Remaining work is account setup in `docs/LAUNCH.md`.
When the two disagree, ask Rakesh; update this file in the same PR as the code that depends on the change.

## Decisions recorded since the spec was drafted

| ID | Decision | Effect on the build |
| --- | --- | --- |
| AUTH-1 | **No passwords anywhere.** | Parents: Sign in with Apple, Google, or a 6-digit email code. Staff: Google Workspace (`@zcs.org`). No password fields, no "forgot password" flow. |
| H3 | **Admins can read all parent–teacher conversations.** | Add an *Oversight* view in the staff console. Every oversight read is written to `audit_log`. A short disclosure is shown to parents ("Messages may be reviewed by ZCS administration") in the Messages tab and the privacy policy. |
| CAL-1 | **Academic calendar is in scope for v1.** | The calendar must show the school-year calendar (first/last day, breaks, no-school days, conferences), not only event posts. |
| ROS-1 | **Roster ingestion from the admin side must be easy.** | The console import is a guided, 4-step wizard (upload → map columns → preview diff → confirm), designed for the office manager, not IT. |

## Overview

We are building one trusted channel between Zeeland Christian School (ZCS) and its families: a free iOS and Android app for parents and teachers, plus a web console for office staff. Success means the office stops double-sending through email and Facebook because the app reports exactly who was reached.

**Working name:** ZCS Connect (placeholder; store listing name needs ZCS sign-off).

### Goals

1. **Reach every family.** One message goes out as push, with email (and optionally SMS) as fallback, and staff see "412 of 430 families reached, 318 read."
2. **Right message, right people.** Announcements are scoped to school, division, grade, class or group; each person sees only what applies to their children or role.
3. **Effortless for parents.** No setup beyond signing in, no passwords. Children are linked by the office roster, not typed in. One feed, one inbox, a calendar.
4. **Less work for teachers.** Posting to a class takes under 30 seconds from a phone. School-wide info is sent centrally, once.
5. **Store-ready and school-owned.** Passes App Store and Play review on first submission; every account is in ZCS's name.

### Non-goals for v1

- Grades, report cards or an LMS (the SIS stays system of record).
- Payments, lunch accounts or tuition.
- Student accounts. Adults only.
- Parent-to-parent social features (comments, DMs).

### Success metrics (first full semester)

| Metric | Target |
| --- | --- |
| Families with ≥1 guardian active in the app | 90% |
| Announcement reach (push or email delivered) | 98% of targeted guardians |
| Median publish → delivered | < 60 s |
| Staff double-posting to email/Facebook | none for routine announcements |
| Store rating | ≥ 4.5 |

## Source material

| Source | What it tells us | How we use it |
| --- | --- | --- |
| ZCS Identity Guide (11/22/19) | Navy Pantone 282 `#041E42`, maize Pantone 7406 `#F1C400`, black, white. Icon clear space = ¼ icon. Digital min size 30 px. Never recolor/stretch/add effects. | Design tokens, app icon, splash |
| Campaign Guide 2019 + Typeface folder | Campaign voice ("burns bright"); Cabin typeface | Headings in Cabin; campaign line used once |
| Family-experience memo | Four connected events: Welcome Night, Partnership Night, Fall Growth Conversation, Spring Learning Celebration. Rule: "Information is communicated once and remains easy to find." | Product principle; future event hub, family hopes form, conference sign-ups |
| Parent email list 26-27 (Google Sheet) | One tab per grade. Row = student full/first/middle/preferred name, grade, up to two guardians (email, first, last). Columns shift when middle/preferred name present. | Roster import template; needs guardian de-dup and messy-column handling |
| Athletic and Creation Ridge logos | Sub-brands | Not used in v1 |
| Old starter repo (jameso107/ZCS-app) | Expo + Supabase; push never worked; self-promote-to-admin bug | Keep stack; discard schema, self-selected roles, parent-typed child linking |

**What we change from the starter:** roles are granted by the school, never self-selected; one person can hold many memberships; parents link to children from the roster; delivery is a first-class system (queue, fallback, receipts).

## Users, roles and permissions

A person has one account and any number of **memberships** (role + scope: school, division, class or group). Permissions = union of active memberships, enforced server-side on every row; the app mirrors it.

### Roles

| Role | Scope | Can read | Can send | Granted by |
| --- | --- | --- | --- | --- |
| Guardian (parent) | Linked students | School-wide posts; posts for their children's divisions, grades, classes, groups; own DMs | Replies and DMs to their children's staff; absence notes (phase 2) | Roster import or office approval |
| Teacher | Assigned classes | Their classes' feeds and rosters with guardian contacts; staff posts | Posts to own classes; DMs with guardians of their students | Office admin |
| Specialist / aide | Assigned classes (read) or groups | Same as teacher for scope | Posts to assigned groups; teacher may grant co-posting on a class | Office admin |
| Group leader (coach, club, band) | A group | Group roster and feed | Posts to their group | Office admin |
| Division principal | A division (Preschool, Elementary, Middle) | Everything in the division + delivery/read reports | Division and grade announcements | District admin |
| Office communicator | School | All announcements and reports | School-wide announcements, events, any audience | District admin |
| Emergency sender | School | Alert history | Emergency alerts (override quiet hours); optional second approver | Head of School names individuals |
| District admin (IT) | School | Users, roster, settings, audit log, **all parent–teacher conversations (H3, audited)** | None by default | Bootstrap / other admins |

**Principles:** least privilege; staff verified by `@zcs.org` Google sign-in; guardians come from the roster (unknown parents see an "ask the office" state, never self-link); per-guardian restrictions (no-contact, hide contact info) for custody cases (D1); oversight reads are always logged.

### Switching roles (one person, many hats)

A teacher who is also a parent gets a **context switcher** at the top of the app: *Mrs. Smith · Teacher* and *Smith family · Parent*. Each context has its own feed, inbox, notification channel and badge count. App opens in last-used context. Notifications are labeled with the context; tapping one switches automatically. Switching is client-side only.

### Audience rules

| Audience | Who may target it | Resolves to |
| --- | --- | --- |
| Whole school (families) | Office communicator, emergency sender | All active guardians |
| Whole school (staff) | Office communicator, principals | All staff memberships |
| Division or grade | That division's principal, office | Guardians of enrolled students in scope |
| Class | That class's teachers and co-posters | Guardians of approved students |
| Group | Group leader, office | Members' guardians (+ staff in group) |
| Individual families | Teachers (own students), office | Selected guardians |

Audiences are resolved at send time and the recipient list is stored.

## Core features

| ID | Feature | Requirement | Release |
| --- | --- | --- | --- |
| F-01 | Announcements | Title, rich text, up to 10 photos/PDFs (25 MB each), links. Composer offers only scopes the sender holds. | v1 |
| F-02 | Scheduling | Send now or up to 60 days ahead; edit/cancel before send; post-send edits show "edited", no re-notify unless chosen | v1 |
| F-03 | Priority | Normal · Important (pinned 48 h) · Emergency (bypasses quiet hours, critical sound where allowed, always email + SMS if enabled) | v1 |
| F-04 | Delivery fan-out | Push first → email after 15 min if unread or no device → SMS for emergencies if F1 approved | v1 |
| F-05 | Receipts & reach report | Targeted, delivered (by channel), opened, acknowledged; drill into families not reached; CSV export | v1 |
| F-06 | Acknowledge | Optional "I've read this" with reminder nudges | v1 |
| F-07 | Direct messages | Guardian↔staff threads about a student; group thread with both guardians when appropriate; staff office hours + auto-reply; no parent-to-parent | v1 |
| F-08 | Feed & filters | One feed per context; child filter chips ("Emma · 3rd grade"); search; pinned on top | v1 |
| F-09 | Calendar | **Academic calendar (CAL-1)** + ZCS ICS feed (mirrored) + event posts; add to phone calendar | v1 |
| F-10 | Notification prefs | Per context and category (class, school, messages); quiet hours; emergency can't be muted | v1 |
| F-11 | Translation | On-demand MT of posts/messages; original always viewable; languages per G1 | v1.1 |
| F-12 | Family event hub | Welcome Night, Partnership Night, conference pages | v1.1 |
| F-13 | Conference sign-ups | Slots, book/swap, reminders | v2 |
| F-14 | Forms & permission slips | E-signature by verified guardian; family hopes form | v2 |
| F-15 | Absence reporting | Guardian reports absence/late; office queue | v2 |
| F-16 | Staff console | Compose to any audience, reports, roster import wizard (ROS-1), users & roles, audit log, oversight (H3), moderation | v1 |

### Non-functional

- **Scale:** ~1,000 students / ~1,800 guardians (confirm C1); a school-wide send ≈ 3,500 pushes; design for 10×.
- **Latency:** push p95 < 60 s school-wide; feed < 1 s on 4G.
- **Availability:** 99.9% in school year; status page; emergency email fallback independent of app backend.
- **Offline:** last 30 days of feed and messages cached and readable.
- **Accessibility:** WCAG 2.2 AA; Dynamic Type; screen-reader labels on every control; maize only on navy (contrast).
- **Auditability:** every send, edit, delete, role change, oversight read logged.

## User experience

Download → child's class feed in under a minute; no codes, no forms, no passwords.

### Parent onboarding

1. Download app or tap link in office welcome email.
2. Sign in with Apple, Google or 6-digit email code. Email must match roster.
3. App shows children found ("Emma, 3rd grade · Noah, Kindergarten"); parent confirms.
4. Notifications: explain benefit first ("Snow days and early dismissals arrive here"), then OS prompt.
5. Land on feed.

Not on roster → friendly "we couldn't find your family" screen with one-tap request to office; office approves from a console queue.

### Navigation

| Context | Tabs |
| --- | --- |
| Parent | Home (pinned + feed, child chips) · Messages (grouped by child) · Calendar · Profile (children, notifications, language, context switcher, help) |
| Teacher | Home · Messages · Classes (roster, compose, reach per post) · Profile; floating **New post** button |

### Teacher compose (target < 30 s)

Pick class (defaults to last) → type or dictate → attach photos → optional schedule / request acknowledgment → Send → live "23 of 24 families reached" bar.

### Design system

- **Colors:** Navy `#041E42` primary + header; Maize `#F1C400` accent, only on navy or as fill with navy text; white surfaces; red reserved for Emergency.
- **Type:** Cabin for headings; system font (SF Pro / Roboto) for body.
- **Icon:** official maize flame on navy, ¼-icon clear space (needs ZCS sign-off).
- **Feel:** native tab bars, sheets, haptics; dark mode follows system.
- **Tone:** warm and plain; "burns bright" appears once, on welcome.

## Tech stack and architecture

**Expo (React Native) for iOS + Android, Next.js staff console, Supabase (Postgres + RLS) backend, dedicated delivery worker.**

```
Mobile app (Expo) ──app API──┐
Staff console (Next.js) ─────┼──► Supabase (owned by ZCS)
Roster source (CSV/Sheet) ───┘     Auth · Postgres+RLS · Storage · Edge Functions
                                         │  send jobs out / delivery status back
                                         ▼
               Push (Expo→APNs/FCM) ◄── Delivery worker ──► Email (Postmark/Resend), SMS (Twilio, if F1)
                                         │
                                 Guardians' phones and inboxes
```

| Layer | Choice | Why |
| --- | --- | --- |
| Mobile | Expo (RN, TypeScript), Expo Router, TanStack Query | One codebase, native UI, EAS Build/Submit/Update |
| Console | Next.js on Vercel, Tailwind | Fast data-heavy screens; shared types |
| DB & auth | Supabase: Postgres, RLS, Auth (Apple, Google, email OTP), Storage | Permissions enforced in DB |
| Server logic | Edge Functions + pgmq queue + worker | Durable, retryable sends |
| Push | Expo Push → APNs/FCM | One API, per-token receipts |
| Email | Postmark or Resend on ZCS subdomain (SPF/DKIM/DMARC) | Deliverability |
| SMS (opt.) | Twilio + 10DLC | Only if F1 approved |
| Translation | Google Cloud Translation or DeepL, cached | Pay per message |
| Observability | Sentry, Supabase logs, uptime monitor | |
| CI/CD | GitHub Actions: lint, typecheck, pgTAP for every RLS policy, EAS preview builds | Proves who **cannot** see a row |

Not a PWA (iOS push requires add-to-home-screen). Not fully native (2× cost, no user benefit).
Environments: local, staging (TestFlight / Play internal, fake school), production.

## Data model and authorization

| Table | Key fields | Notes |
| --- | --- | --- |
| `schools`, `divisions`, `grades`, `terms` | name, sort order, active term | Seeded per year |
| `people` | auth user id, display name, preferred language, phone? | One per adult; **no role column** |
| `memberships` | person, role, scope_type (school/division/class/group), scope_id, starts_at, ends_at, granted_by | Single source of authority; time-bounded |
| `students` | sis_id, legal + preferred name, grade, active | From roster; never an account |
| `guardianships` | person, student, relationship, flags (no_contact, hide_contact, can_sign_forms) | Import or office approval only |
| `classes`, `enrollments`, `groups`, `group_members` | sis section id, term, staff | Rebuilt each term |
| `posts` | author_membership, audience_spec, priority, body, scheduled_at, status | Audience as spec ("class:abc") |
| `post_recipients` | post, person, context, resolved_at | Snapshot at send |
| `deliveries` | recipient, channel, provider_id, status, timestamps | Reach report, retries |
| `reads`, `acknowledgments` | person, post, at | Receipts |
| `threads`, `thread_participants`, `messages` | student context, participants, body, attachments | Staff + guardians only |
| `devices` | person, expo token, platform, last_seen | Pruned on DeviceNotRegistered |
| `preferences` | person, context, category, channel, quiet hours | Emergency not disableable |
| `audit_log` | actor, action, target, before/after, ip, at | Append-only |

Enforcement: RLS on every table, deny by default; `security definer` helpers (`can_read_post`, `can_post_to(scope)`) with pgTAP allow+deny tests; role grants and roster changes only via audited admin RPCs; service-role keys only in worker/functions; private storage with short-lived signed URLs; memberships expire at year rollover.

## Privacy, compliance, store approval

Treat as education records from day one; counsel confirms FERPA / COPPA / Michigan obligations.

- Adults only; data minimization (no birthdates, addresses, grades, health data in v1).
- No ads, no tracking SDKs; first-party aggregate analytics only.
- TLS + encryption at rest; tokens in SecureStore/Keystore.
- Notification previews configurable: full text or content-free (F2).
- Retention configurable per type (H2), auto-purge.
- DPAs with Supabase, Vercel, Expo, email provider, Sentry — in ZCS's name.

**Apple:** org enrollment (D-U-N-S; check fee waiver) · Sign in with Apple alongside Google · in-app account deletion · privacy labels + hosted policy · reviewer demo account with seeded fake school · push permission in context · critical-alert entitlement only if requested · real native functionality.

**Google Play:** org developer account · data safety form, content rating, audience = adults · current target API, Android 13+ notification permission · account deletion in app and on web.

**Security:** pen test before launch; dependency + secret scanning; admin MFA via Workspace; incident response plan.

## Integrations

| Integration | v1 | Later |
| --- | --- | --- |
| Roster | CSV / Google Sheet import wizard: column mapping, dry-run diff, guardian de-dup by email | Nightly SIS sync (OneRoster/API) per C3 |
| Staff sign-in | Google Workspace, `@zcs.org` only | Auto-provision from Workspace groups |
| Parent sign-in | Apple, Google, email OTP | Optional SMS code |
| School calendar | Academic calendar managed in console + ZCS ICS feed | Two-way if K1 says own |
| Email | Transactional provider on e.g. `notify.zcs.org` | Weekly digest |
| SMS | Off unless F1 | Twilio + opt-in |
| Existing channels | Optional auto-post to ZCS Facebook | Website news widget |

Import safeguards: never delete on import (deactivate); every import logged and reversible; office-set custody flags never overwritten.

## Rollout

Five phases, each ends at a ZCS sign-off gate. No calendar dates until ZCS confirms the 2026-27 academic calendar.

| Phase | Scope | Gate |
| --- | --- | --- |
| 1. Foundations | ZCS accounts, schema + RLS, roster import | Security review passed |
| 2. Core build | Feed, compose, messages, delivery worker | Push proven on test devices |
| 3. Pilot | One grade's teachers and families | 95% reach in pilot |
| 4. Launch | Store review, school-wide, parallel email | Office stops double-sending |
| 5. Expand | Translation, event hub, sign-ups, forms | — |

### Open decisions for ZCS

| ID | Question |
| --- | --- |
| C1 | Exact enrollment: students, families, distinct guardian emails |
| C3 | Which SIS; can it export/sync? |
| K1 | Calendar, forms, conferences, absences: own, mirror or intake? |
| D1 | Custody restrictions and hidden contact details |
| E2 | What can a principal do that a teacher can't? |
| F1 | SMS in scope? |
| F2 | Message text in notification previews, or content-free? |
| F7 | Named emergency senders; second approver? |
| G1 | Which languages? |
| H2 | Retention per data type |
| J1 | App icon and store name |
