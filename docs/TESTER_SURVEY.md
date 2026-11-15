# Tester survey

A 5-minute web survey for soft-launch testers, separate from the app. No sign-in needed.

- **Parent link:** https://rakeshk99.github.io/ZCS-connect/survey/?role=parent
- **Staff link:** https://rakeshk99.github.io/ZCS-connect/survey/?role=staff

(The `role` part just pre-picks the first answer; testers can change it.)

## What it asks

| Step | Questions | What it tells us |
|---|---|---|
| About you | Parent / staff / both, how long they've used it, how they signed in | Who answered; whether sign-in works |
| What you did | Each feature: Didn't try, or 1 (very hard) to 5 (very easy). A "What got in the way?" box opens on 1–2 | Which feature to fix first |
| Overall | The 10 System Usability Scale (SUS) statements | One 0–100 ease score; 68 is average, 80+ is excellent |
| In your words | Most useful, most frustrating (and how much it got in the way), what broke, one thing to change | The why behind the numbers |
| Last few | 0–10 likely to recommend (gives a Net Promoter Score), compared with today's school news, notifications, optional name/email | Whether it's worth it to families |

Answers save as people go, so a tester can close the page and come back. Sending again from the same
browser updates their answer instead of adding a second one.

## Reading results

Staff website → **Tester survey** (office staff). It shows the scores, every task hardest-first, a
**Fix first** list (anything that broke or stopped someone), all written answers, and **Export CSV**.

Or just ask Claude to "check the tester survey": it can read the results straight from the database
and turn them into a fix list.

## Privacy

Only office staff can read answers. Testers are asked not to include private details about their
child. Name and email are optional.

## Updating the page

The source is `site/survey/index.html`. It's published to the `gh-pages` branch at `survey/index.html`.
