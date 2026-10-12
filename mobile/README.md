# NN Infra ERP — Android client

Flutter. Talks to the web app's mobile boundary at `/api/mobile/v1`, which
dispatches to the web's own server actions — so a refusal on the phone is the
same refusal, in the same words, for the same reason.

## Build

```bash
# where the server is, baked in at build time
flutter build apk --release --split-per-abi \
  --dart-define=NN_BASE_URL=https://erp.example

# the emulator reaches a laptop's dev server on 10.0.2.2
flutter build apk --debug --dart-define=NN_BASE_URL=http://10.0.2.2:3210
```

`NN_BASE_URL` defaults to `http://10.0.2.2:3210`, which is a development
machine seen from an Android emulator. A release build for anybody else must
pass the real host, or the app will look for a server that is not there.

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
| `calendar_test.dart` | Six weeks always; a span on every day it crosses; overdue measured against the **server's** clock |
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
- **`calendar_screen.dart`** — the month grid and the day panel. Nothing in it
  reads the handset clock.

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
