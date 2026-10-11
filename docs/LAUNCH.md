# Launch checklist

Everything in the code is built. These are the account and dashboard settings only a person can do.
Do them in this order; Apple Developer is last, as agreed.

## 1. Supabase (project `rajiykcsrybkddbutctb`)

1. **Plan:** upgrade to **Pro** before real families sign in. Free projects pause after a week idle and
   have no daily backups. Pro covers 5,000 families with plenty of room (the busiest moment, an
   emergency alert to every family, is about 5–10k push messages, which the queue sends in batches).
2. **Auth → Email:**
   - Turn on **Email OTP**. In *Email Templates → Magic Link*, make the body show the code:
     `Your ZCS Connect code is {{ .Token }}. It expires in 10 minutes.`
   - Set the OTP length to 6 and expiry to 600 seconds.
   - Under *SMTP settings*, use Resend (step 3) so codes don't come from the shared Supabase sender,
     which is rate-limited and often lands in spam.
3. **Auth → Providers:**
   - **Google:** create an OAuth client in the ZCS Google Cloud project (Web application). Authorized
     redirect URI: `https://rajiykcsrybkddbutctb.supabase.co/auth/v1/callback`. Paste the client ID
     and secret into Supabase.
   - **Apple:** done in step 6, once the Apple Developer account exists.
4. **Auth → URL configuration:**
   - Site URL: the console URL (step 4).
   - Redirect URLs: `zcsconnect://auth-callback`, `https://<console-domain>/auth/callback`,
     `http://localhost:3000/auth/callback`.
5. **Edge Function secrets** (`deliver`): `EXPO_ACCESS_TOKEN` (step 5), `RESEND_API_KEY`,
   `EMAIL_FROM` (for example `ZCS Connect <connect@zcs.org>`), `APP_LINK_BASE` (`zcsconnect://`).
   Until these are set, the worker records "email not configured" instead of failing.
6. **Remove the demo school** once ZCS's real roster is imported: `select private.remove_demo_data();`

## 2. Real data

1. In the console, sign in as an admin and add the office staff under **People & roles**.
2. The office imports the roster under **Roster import** (CSV or Excel, one sheet per grade works).
3. Grant teachers their classes, and give the office the *Emergency sender* role.

## 3. Email (Resend)

1. Create a Resend account under ZCS, add the sending domain (`zcs.org` or a subdomain like
   `connect.zcs.org`), and add the SPF, DKIM and return-path DNS records it shows.
2. Create an API key and put it in the Edge Function secrets and in Supabase Auth SMTP.

## 4. Staff console (Vercel)

1. Import the GitHub repo in Vercel and set the root directory to `apps/console`.
2. Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_KEY` (see `.env.example`).
3. Add a domain such as `connect.zcs.org`, then add `https://<domain>/auth/callback` to Supabase
   redirect URLs.

## 5. Expo / EAS (mobile builds)

1. Create an Expo account owned by ZCS (not a personal account), then in `apps/mobile` run
   `npx eas-cli login` and `npx eas-cli init`. Put the printed project ID in `EAS_PROJECT_ID`
   (an EAS environment variable), which push notifications need.
2. Create an access token under Expo account settings → Access tokens, with *push security*
   turned on, and save it as the `EXPO_ACCESS_TOKEN` Edge Function secret.
3. Android: create the Google Play developer account ($25, under ZCS), run
   `npx eas-cli build -p android --profile production`, and upload to *Internal testing* first.
   Set up Firebase (FCM) for Android push and upload its service-account key in
   `npx eas-cli credentials`.

## 6. Apple (last)

1. Enroll ZCS in the Apple Developer Program as an **organization** (needs a D-U-N-S number; a
   nonprofit/education fee waiver may apply).
2. Create the App ID `org.zcs.connect` with *Sign in with Apple* and *Push Notifications*.
3. Create a Services ID and key for Sign in with Apple, then turn on the Apple provider in Supabase.
4. In App Store Connect, create the app, copy its Apple ID into `apps/mobile/eas.json`
   (`ascAppId`), then `npx eas-cli build -p ios --profile production` and
   `npx eas-cli submit -p ios`.
5. App Review notes: give the reviewer the `rakesh+review@` demo account and explain that sign-in is
   by emailed code (they'll need the code sent to an inbox you watch, or a fixed review code).

## Store listing (both stores)

- Privacy policy and support URLs (hosted on zcs.org). Include the disclosure that administrators
  may review parent–teacher messages.
- Privacy labels: email address, name, and user content (messages), used for app functionality only;
  no tracking, no ads. The iOS privacy manifest is already in `app.config.ts`.
- In-app account deletion is built (Profile → Delete account), which Apple requires.
- Screenshots: 6.9" iPhone, 13" iPad (if iPad is enabled), and Android phone.

## Before going live

- [ ] Remove the demo school and the `rakesh+` demo accounts (keep `rakesh+review@` until approval).
- [ ] Send a test emergency alert to a staff-only audience.
- [ ] Check the Supabase security and performance advisors show no warnings.
