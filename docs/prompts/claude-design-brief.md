# ZCS Connect: Claude Design brief

Design a mobile app (iOS + Android) and a web staff console for **ZCS Connect**. It is the official communication app for Zeeland Christian School (Preschool to 8th grade, about 1,000 students). The school uses it to reach families: announcements, messages between teachers and parents, and the school calendar. The bar is "as smooth as the best consumer apps." A parent should go from download to their child's class feed in under a minute.

## Brand (from the ZCS Identity Guide; do not deviate)
- Navy #041E42 is the primary color, used for headers and primary buttons. Maize #F1C400 is the accent. Use maize only on navy, or as a fill under navy text. Never put maize text on white. Surfaces are white. Red is reserved for Emergency alerts only.
- Headings use Cabin. Body text uses the system font (SF Pro on iOS, Roboto on Android).
- Logo: the maize flame icon on navy, with clear space of 1/4 of the icon on every side. Never recolor, stretch, rotate or add effects.
- Tone: warm and plain, the voice of a caring school office. Use "families," not "users." Use the child's preferred name. The campaign line "burns bright" may appear once, on the welcome screen.
- Feel: native platform patterns (tab bars, bottom sheets, swipe actions). Design light and dark mode. Meet WCAG 2.2 AA, with tap targets of at least 44 pt and support for large text sizes.

## Who uses it (one account can hold several roles)
- **Parent (guardian):** sees school-wide posts and posts for their children's grades, classes and groups. Messages their children's teachers.
- **Teacher:** posts to their own classes and messages the parents of their students. Many teachers are also ZCS parents.
- **Principal:** posts to their division (Preschool, Elementary or Middle) and sees reach reports.
- **Office staff:** post to the whole school, send Emergency alerts, run reports.
- **Admin:** manages people, roles and roster import, and can review any parent–teacher conversation (each review is logged).

## Hard rules
- No passwords anywhere. Parents sign in with Apple, Google or a 6-digit email code. Staff sign in with Google on @zcs.org.
- Nobody picks their own role. Parents never type in their child; children appear from the school roster.
- **Role switcher:** a teacher who is also a parent switches between "Mrs. Smith · Teacher" and "Smith family · Parent" from the header. Each role has its own feed, inbox and badge counts.
- Three post priorities, each visually distinct: Normal, Important (pinned) and Emergency (red, unmissable).
- No comments, no parent-to-parent messaging, no ads.

## Mobile screens to design
1. Welcome, then sign-in (Apple, Google, email code), then 6-digit code entry.
2. "We found your children" confirmation, showing each child's name and grade.
3. Notification explainer shown before the system prompt ("Snow days and early dismissals arrive here").
4. "We couldn't find your family" screen, with a one-tap request to the office.
5. **Parent Home:** Emergency banner, pinned Important posts, the feed, child filter chips ("Emma · 3rd grade") and search.
6. Post detail: photos and PDFs, an "I've read this" acknowledge button and an "edited" label.
7. **Messages:** threads grouped by child, a thread view, a composer, teacher office-hours notice, and a short note that ZCS administration may review messages.
8. **Calendar:** the school-year calendar in month and agenda views, with no-school days, events and add-to-phone-calendar.
9. **Profile:** children, notification settings by category with quiet hours (Emergency is always on), language, help, sign out and delete account.
10. **Teacher Classes tab:** class list and roster with parent contacts.
11. **Compose a post:** it should take under 30 seconds. Choose the class (defaults to the last one used), write or dictate, add photos, optionally schedule or request acknowledgment, then Send.
12. Post reach after sending: a live bar ("23 of 24 families reached · 18 read") with a list of families not yet reached.
13. The role switcher control, plus a notification that switches roles when tapped.
14. Empty, loading (skeleton) and offline states for the feed and messages.

## Web console screens (desktop, for office staff)
1. Dashboard showing recent sends and their reach.
2. Compose with an audience picker (whole school, division, grade, class, group or individual families) and priority. Emergency gets a confirmation step. Include preview-as-parent.
3. Reach report: delivered by push or email, opened, not reached, CSV export.
4. **Roster import wizard** for a non-technical office manager: upload the spreadsheet, match columns (auto-detected), preview changes ("42 new families, 3 updated, 1 duplicate parent merged"), then confirm.
5. People and roles: grant or remove roles, with a scope and dates.
6. Queue of pending family requests.
7. Academic calendar editor.
8. Conversation review: an admin opens any parent–teacher thread, with a visible "this view is logged" banner.
9. Audit log.

## Sample people (all fictional)
- Sarah VanDyke: mom of Emma (3rd grade) and Noah (Kindergarten).
- Mrs. Jennifer Smith: 3rd-grade teacher and mom of Lily (6th grade).
- Mr. David Kuiper: Middle School principal.
- Linda Brouwer: office staff and emergency sender.
- Tom Hoekstra: admin.

Sample posts: "Early dismissal Friday at 12:30" (Important), "Snow day — school closed today" (Emergency), "3rd grade field trip photos!", "Partnership Night is Oct 23".

## Deliverables
High-fidelity screens for both platforms in light and dark mode, plus a reusable component set: buttons, cards, chips, priority pills, list rows, the role switcher, the reach bar, and empty and skeleton states. These designs will be built in React Native (Expo) and Next.js, so stick to patterns those frameworks support.
