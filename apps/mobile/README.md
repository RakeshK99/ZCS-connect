# ZCS Connect · mobile app (iOS + Android)

Expo SDK 57 · Expo Router · TypeScript · TanStack Query · Supabase. Screens follow the
Claude Design file (`ZCS App.dc.html`): welcome A, home A (feed), messages A (grouped by
child), compose B (quick sheet).

## Run it

```bash
pnpm install                 # from the repo root
pnpm dev:mobile              # then press i (iOS simulator) or a (Android), or scan with Expo Go
```

Sign in with the email-code option using one of the demo inboxes (codes arrive in the
developer inbox): `rakesh+sarah@syzygy.services` (parent), `rakesh+jen@syzygy.services`
(teacher + parent, shows the role switcher). See `supabase/seed/demo_school.sql`.

Push notifications need a development build on a real device (`npx eas-cli build --profile development`)
and `EAS_PROJECT_ID` set (`npx eas-cli init` once the Expo account belongs to ZCS).

## Structure

```
src/app/                 routes (Expo Router)
  (auth)/                welcome, sign-in, code, found, notify, not-found
  (app)/(tabs)/          home, classes (teachers), messages, calendar, profile
  (app)/post/[id]        post detail + acknowledge
  (app)/thread/[id]      conversation
  (app)/roster/[id]      class roster with family contacts
  (app)/reach/[id]       live reach report after sending
  (app)/new-message      start a conversation about a child
  compose                quick compose sheet
src/components/          UI kit (ui.tsx), Sheet, Toast, ZcsIcon
src/features/            feed, roles (switcher), calendar
src/lib/                 supabase client, auth, session/contexts, queries, notifications
src/theme/               design tokens (light/dark) from the ZCS Identity Guide
```

## Behaviour worth knowing

- **No passwords.** Apple, Google or a 6-digit email code. Staff use Google restricted to `@zcs.org`.
- **Contexts, not roles.** `session_info()` returns the contexts a person has (staff, parent). People with both get the switcher; each context has its own feed, inbox and badges.
- **Offline.** Feed, threads and calendar are persisted on device for 30 days; messages typed offline show "Waiting to send" and go out on reconnect.
- **Security.** Sessions live in the keychain/keystore (chunked SecureStore). The publishable key in `app.config.ts` is safe to ship; all access is enforced by RLS and RPC checks.

## Checks

```bash
pnpm --filter mobile typecheck
npx expo export --platform ios    # bundles the app; catches resolution errors
```
