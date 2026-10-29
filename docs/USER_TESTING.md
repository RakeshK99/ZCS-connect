# Staff user testing

Goal (from the Oct 23 call with ZCS): 5–10 ZCS staff test the app in about two weeks, signing in with
their own `@zcs.org` email. They land in the **demo school** as a teacher of a demo class, so they can
post, message and add class events without reaching real families. A one-class family pilot comes after.

## One-time setup

### 1. Email codes (Resend)
Supabase's built-in mailer only sends to members of the Supabase organization and is heavily
rate-limited, so testers need our own sender.

1. Create a free account at resend.com (under Syzygy for now).
2. **Domains → Add domain** `syzygy.services` (or a subdomain like `mail.syzygy.services`) and add the
   DNS records it shows (SPF, DKIM, return path). Wait for **Verified**.
3. **API Keys → Create API key** (sending access).
4. Supabase → **Authentication → Emails → SMTP settings → Enable custom SMTP**:
   host `smtp.resend.com`, port `465`, user `resend`, password = the API key,
   sender `ZCS Connect <connect@syzygy.services>`.
5. Supabase → **Authentication → Emails → Templates → Magic link**: subject `Your ZCS Connect code`,
   body `Your ZCS Connect code is {{ .Token }}. It expires in 10 minutes.`
6. Supabase → **Authentication → Providers → Email**: email OTP length 6, expiry 600 seconds.
7. Save the same API key as the `RESEND_API_KEY` Edge Function secret and set `EMAIL_FROM` to the
   same sender, so post notifications can fall back to email.

### 2. Push notifications
Expo → Account settings → **Access tokens** → create a token with push security on. Save it as the
`EXPO_ACCESS_TOKEN` Edge Function secret (or send it to Rakesh to set).

### 3. TestFlight
App Store Connect → TestFlight → **Public Beta** → Public Link → set the tester limit to **50**.

## Adding a tester

In the Supabase SQL editor:

```sql
-- teacher of 3S in the demo school
select private.add_tester('pjenkins@zcs.org', 'Peter', 'Jenkins', 'Mr.', '3S');
-- also a demo parent of Emma, to try the role switcher
select private.add_tester('jdoe@zcs.org', 'Jane', 'Doe', 'Mrs.', '3S', 'Emma');
```

Running it again for the same email is safe. Testers then:

1. Install TestFlight and open the beta link.
2. Open ZCS Connect → **I work at ZCS** → enter their `@zcs.org` email → type the 6-digit code.
3. Take the short tour, then try: post to 3S, add a class event, message a demo family.

## What's new for this round

| Change | Why (Oct 23 feedback) |
| --- | --- |
| **I work at ZCS** signs in with an emailed code to an `@zcs.org` address | Staff test with their own accounts before Google sign-in is approved by ZCS IT |
| **New to ZCS? Schedule a tour** on the welcome screen | Prospective families can schedule a tour, ask a question or apply |
| **Save** on any post, and a **Saved** filter on Home | Parents can mark posts that matter to them |
| First-run **tour** (also in Profile → Take the tour) | Families and staff learn the app without a walkthrough |
| **Add class event** in Calendar for teachers | Field trips and theme days that only that class sees |
| Links, emails and phone numbers in posts and messages are tappable | Teachers link to class newsletters |
| Google and Apple buttons hidden until those providers are set up | Testers only see sign-in options that work |
| Demo accounts can't be deleted | One tester can't remove a shared demo person for everyone |

## Still open

- **Middle school rosters:** Mr. Jenkins is checking whether every teacher a student has should see
  that family, or only the homeroom teacher.
- **Calendar sync** from the school-wide Google Sheet / Google Calendar: needs the source to be agreed.
  Events are entered in the console for now.
- Phone-number sign-in, translated posts, photo and voice privacy review, principal photo directory
  (deprioritized).
