# Real sign-in (no demo accounts)

Nobody creates or remembers a password. People sign in one of three ways:

| Way | Who | What they do |
| --- | --- | --- |
| **6-digit email code** (main way) | Everyone | Type their email, then the code from the email |
| **Continue with Google** | Everyone; on the staff screen, limited to @zcs.org | One tap with a Google account they're already signed in to |
| **Continue with Apple** | Families on iPhone | Face ID with their Apple ID |

All three only work for people the school already knows. Families come from the roster; staff are
added under People & roles (or, during testing, with `private.add_tester`). Anyone else sees "We
couldn't find your family" and can ask the office.

Do these steps once, in this order. The 1.2.0 build turns the Google and Apple buttons on, so finish
steps 1–3 before installing it.

## 1. Email codes (Resend), about 15 minutes plus DNS time

1. Create a free account at resend.com with your Syzygy email.
2. **Domains → Add domain** → `syzygy.services`. Add the DNS records it shows at your domain host,
   then wait until it says **Verified**.
3. **API Keys → Create API key** (Sending access). Copy it.
4. Supabase → ZCS Connect → **Authentication → Emails → SMTP Settings** → turn on **custom SMTP**:
   - Host `smtp.resend.com`, port `465`, username `resend`, password = the API key
   - Sender email `connect@syzygy.services`, sender name `ZCS Connect`
5. **Authentication → Emails → Templates.** In both **Magic Link** and **Confirm signup**, set:
   - Subject: `Your ZCS Connect code`
   - Body: `<p>Your ZCS Connect code is <strong>{{ .Token }}</strong>.</p><p>It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p>`
6. **Authentication → Sign In / Providers → Email:** Email OTP length `6`, expiry `600` seconds.
7. **Authentication → Rate Limits:** raise *emails sent per hour* to at least 100.

## 2. Google, about 10 minutes

1. Go to console.cloud.google.com, signed in as rakesh@syzygy.services, and create a project named
   **ZCS Connect**.
2. **Google Auth Platform → Branding:** app name `ZCS Connect`, support email, and the logo if you
   like. **Audience:** External, then **Publish app**. The app only asks for name and email, so
   Google doesn't need to review it.
3. **Clients → Create client → Web application**, named `Supabase`.
   - Authorized redirect URI: `https://bymugelbfznkynivvckp.supabase.co/auth/v1/callback`
   - Copy the **Client ID** and **Client secret**.
4. Supabase → **Authentication → Sign In / Providers → Google:** turn it on, paste the Client ID and
   secret, and save.

When ZCS is ready to own this, make the same client in their Google Cloud and swap the two values.

## 3. Apple, about 2 minutes

1. Supabase → **Authentication → Sign In / Providers → Apple:** turn it on. Under **Client IDs**,
   enter `org.zcs.connect` and save. The iPhone app signs in directly, so no secret key is needed.
2. Apple Developer → Identifiers → `org.zcs.connect`: check that **Sign in with Apple** is ticked.
   EAS turned it on with the first build.

Families who choose **Hide My Email** get an Apple relay address the school doesn't have, so the
app can't find them. Tell families to choose **Share My Email**, or to use the email code.

## 4. Redirect URLs

Supabase → **Authentication → URL Configuration → Redirect URLs**, add:

- `zcsconnect://auth-callback`
- `zcsconnect://**`

## 5. Add the people who'll test with real accounts

Run this in the Supabase SQL editor. It's safe to run more than once.

```sql
select private.add_tester('james@syzygy.services', 'James', 'Oosterhouse', 'Mr.', '3S', 'Emma');
select private.add_tester('rakesh@syzygy.services', 'Rakesh', 'Kottapalli', 'Mr.', '3S', 'Noah');
select private.add_tester('pjenkins@zcs.org', 'Peter', 'Jenkins', 'Mr.', '3S');
```

Each person becomes a teacher of the demo class 3S. The last argument also makes them a demo
parent, so they can try switching roles. They sign in with their own email and a code, Google or
Apple, with no demo password.

## Checking it works

- **Email code:** tap **Get started** and enter your email. The code should arrive within a minute.
  If it doesn't, check Resend → Logs.
- **Google:** **Continue with Google** opens Google, then returns to the app signed in.
- **Apple:** on an iPhone, **Continue with Apple** asks for Face ID, then you're in.
