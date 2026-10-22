# TestFlight public beta

The beta is the `demo` EAS profile: the real app with the **Playground: demo school** sign-in
compiled in, on the fictional demo school. Testers share the demo accounts, so they don't need a
roster entry or a ZCS email.

- Privacy policy: https://rakeshk99.github.io/ZCS-connect/privacy/
- Support: https://rakeshk99.github.io/ZCS-connect/support/
- Sources: `scripts/pages/`. `scripts/build-playground.sh` publishes them with the playground.

## Ship a new beta build

```
cd apps/mobile
eas build --platform ios --profile demo --auto-submit
```

The build number goes up on its own. When Apple finishes processing (10–30 min), add the build to
the external group (below). Builds after the first approved one usually skip review or clear it in
under a day.

## One-time setup in App Store Connect (ZCS Connect → TestFlight)

1. **Test Information** (left sidebar):
   - Beta App Description: *ZCS Connect brings Zeeland Christian School's announcements, calendar and
     teacher messages into one app. This beta runs a fictional demo school. Try it as a parent, a
     teacher who is also a parent, the principal or the office.*
   - Feedback Email: `rakesh@syzygy.services`
   - Marketing URL: the support URL. Privacy Policy URL: the privacy URL.
   - **Beta App Review Information**: your name, email and phone. Tick *Sign-in required* and give
     `rakesh+jen@syzygy.services` with the demo password. In *Review Notes*, write:
     *Sign in with the "Playground: demo school" box on the sign-in screen: pick any person and enter
     the password. The school and its people are fictional. Push notifications are not enabled in
     this beta.*
2. **External Testing → +** → create a group called **Public beta**. Add the latest build, answer
   *What to Test*, and **Submit for Review**. Beta review usually takes about a day.
3. Once approved, open the group → **Public Link → Enable Public Link**. Set a tester limit (for
   example 200) so the link can't spread without limit. Share the `testflight.apple.com/join/…` link
   together with the demo password.

## Before sharing the link

- [ ] The demo password goes only to people you invite. Anyone with the link and the password can
      post to the shared demo school.
- [ ] Reset the demo school between demos if testers leave a mess: run `private.remove_demo_data()`,
      then re-run `supabase/seed/demo_school.sql`.
- [ ] iPad: `supportsTablet` is on, so testers on iPad get the iPad layout. Check it once, or turn
      `supportsTablet` off for the beta.
