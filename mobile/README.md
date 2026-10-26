# Nandini Logistics Rider CRM — Android client

Flutter. Talks to the web app's mobile boundary at `/api/mobile/v1`, which
dispatches to the web's own server actions — so a refusal on the phone is the
same refusal, in the same words, for the same reason.

## Build

The server address is **baked in at build time**. There is no setting inside the
app to correct it, and nothing on screen explains it when it is wrong — the app
simply reaches nothing and looks broken. So the build command is the decision.

```bash
# Production. The address is already the default for a release build, so this
# is the whole command.
flutter build apk --release

# A real phone, against a development machine on the same wifi.
# Works out this machine's address, permits cleartext to it, and builds.
./scripts/lan-apk.sh

# An emulator, which sees the host machine as 10.0.2.2. Also the default for
# a debug build, so the flag is only needed to point somewhere else.
flutter build apk --debug
```

**A release build defaults to `https://nninfra.zapeat.in`** — nginx terminates
TLS there and proxies to the app — and a debug build defaults to
`http://10.0.2.2:3210`, which is this machine as an emulator sees it.
`--dart-define=NN_BASE_URL=…` overrides either.

It used to default to the emulator address in both, and a release APK built
without the flag went out and reached nothing: the sign-in screen said "built
to use http://10.0.2.2:3210" and the server never heard from the phone at all.
`test/base_url_test.dart` now fails if production is ever a loopback, a private
address or a non-standard port.

### Testing on a real handset

```bash
cd ..            # the server
pnpm dev -p 3210 # must print  Network: http://<this machine>:3210

cd mobile
./scripts/lan-apk.sh
adb install -r build/app/outputs/flutter-apk/app-arm64-v8a-release.apk
```

The phone and the machine have to be on the same wifi, and the address changes
whenever the router hands out a new lease — so a build older than the lease
stops working, and the fix is to run the script again.

Android has refused plain HTTP since API 28. `android/app/src/main/res/xml/
network_security_config.xml` names the permitted addresses one at a time and the
script keeps that list up to date. It is deliberately not a blanket permission:
production is HTTPS, and a mistyped URL should fail loudly rather than quietly
send a password in the clear.

## Test

```bash
flutter analyze
flutter test
```

Four suites, and what each is for:

| File | What it holds to account |
|---|---|
| `permissions_test.dart` | `can()` — including a super admin with **no** roles, whose permission array is empty and who may still do everything |
| `sign_in_test.dart` | The three refusals, and that being barred takes the password field away rather than inviting a retry |
| `list_screen_test.dart` | One screen rendering whatever columns the server sent; search and filters producing the web's own query parameters |
| `usability_test.dart` | Contrast against WCAG AA, 44px targets, 200% system font, 320px width, Indian numbering |

## The shape of it

- **`api.dart`** — the only place a URL is built or a status code read. 401 means
  sign in again; 403 means stop asking. Confusing the two puts the app in a loop.
- **`session.dart`** — `can(code)` is the only permission check in the app.
  Never test the set directly: see the test for why.
- **`modules.dart`** — the web's own six nav sections. A module whose permission
  the viewer lacks is not drawn, so nothing in the drawer refuses when tapped.
- **`list_screen.dart`** — one screen for all 24 lists. The server sends
  `columns` with the rows, so there is nothing per-module here.

## Known

- The primary button is the web's `brand-500` (#0089C9) with white text, which
  is 3.87:1 — short of AA for 15.5px bold. Pinned in `usability_test.dart`
  rather than silently tolerated. The fix is one token on **both** sides:
  `#0678AE` is already the web button's hover colour and clears AA at 4.88:1.
- Tasks, Checklists, Approvals, Knowledge Base and Notifications have no list
  endpoint yet, because the web has no export route for them to answer from.
  They are absent from the drawer rather than present and broken.
- Detail screens are built from the list row. The documents — indent, PO, GRN,
  cost sheet — need their lines, and so need a detail endpoint.
