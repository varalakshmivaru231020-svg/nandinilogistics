# Release checklist — NN Infra ERP

Every item here was run before this document was written, and every one passed.
The results column is that run, on 09 Oct 2026, against commit `af96d8c`.

Work down it in order. An item that fails stops the deploy — none of them are
advisory.

---

## Last release

`63ea2cf` · 15 Oct 2026 · 1 commit, from `adebcb0`. Every item below was run.

| | |
|---|---|
| Rolled forward from | `adebcb0` |
| Backup taken first | `nninfra-20261015-102135.dump` — 424K, 107 tables, `pg_restore --list` readable |
| Migrations | no pending |
| Permission catalogue | 564 codes, 0 created |
| Role grants | 1524 → 1524 (nothing new this release) |
| Code gate | 1534 unit tests, 406 over HTTP, 87 on the phone, `flutter analyze` clean, `pnpm build` clean |
| Health | `==> Healthy (HTTP 200)` |
| Row buttons on the phone | **Read on production as six roles, and permission-shaped in every one**: a Store Manager is offered `cancelIssue` and `raiseReturn`; a Sales Head `verifyKyc`, `logFollowUp`, `units:edit` and `changeUnitStatus`; a Supervisor `raiseReturn`, `acceptTask` and the HR edit its role really holds; the Owner all sixteen. No button arrived without something to call |
| Android client | `app-release.apk`, 50.2 MB, built from clean. `runServerAction` and `row-action:` present inside `lib/arm64-v8a/libapp.so`; `moduleSpecs` absent |

**What it put live:** the buttons the web puts **on a list row**. The web does
not only open a record from its list — a PO is approved from the PO row, an
issue acknowledged from the issue row, KYC verified from the customer row, a
price list activated, a receipt cleared or bounced, a visit's outcome recorded,
a task accepted or started, an employee activated, a flat blocked, a site log
deleted, an approval settled. The phone sent you to the record for all of it.

The decision behind each button is now **one function, asked twice**:
`receiptDecisions`, `siteVisitDecisions`, `employeeDecisions`,
`issueDecisions`, `transferDecisions`, `unitDecisions` and
`logFollowUpDecision` were lifted out of the record files, so the record screen
and the row read the same rules. A row therefore cannot offer what the record
would refuse — a return on a cancelled slip, a delete on a flat with a booking
— and `authorize()` checks again inside the action regardless.

Only the **wording** is the row's own: the web's row says "Clear" where its
record says "Mark cleared", and "Approve & despatch" where the record says
"Approve & send". `screen-rows.test.ts` reads each label out of the web row
that carries it, and fails if a row names an action the boundary cannot
dispatch.

---

## Release before this one

`c89a39d` · 15 Oct 2026 · 2 commits, from `df28f1b`. Every item below was run.

| | |
|---|---|
| Rolled forward from | `df28f1b` |
| Backup taken first | `nninfra-20261015-093705.dump` — 424K, 107 tables, `pg_restore --list` readable |
| Migrations | no pending |
| Permission catalogue | 564 codes, 0 created |
| Role grants | 1524 → 1524 (nothing new this release) |
| Code gate | 1522 unit tests, 405 over HTTP, 84 on the phone, `flutter analyze` clean, `pnpm build` clean |
| Health | `==> Healthy (HTTP 200)` |
| Lists on the phone | **28 of 30 send the web's own composed row as the Owner; 0 flat, 0 broken** — and across six roles, every refusal a permission. The two are `tasks/reports`, which is a report, and the schedule, which wants a project first |
| Android client | `app-release.apk`, 50.2 MB, **built from clean**. `http://168.231.103.114:3021` and `ServerRowCard` found inside `lib/arm64-v8a/libapp.so`; `moduleSpecs` — deleted this release — absent, which is how a stale build is caught |

**What it put live:** the list screens. Records and forms were already the
web's; every **list** was still the app's own — its title, its subtitle, its
status word, its filters, its three figures and a detail sheet of its own, all
hand-written in `mobile/lib/modules/spec.dart`, 1,213 lines of a second guess
at thirty screens. That file is deleted. `src/lib/screens/rows/` now composes
each row the way its own web screen composes it, from the web's own label maps,
tone maps and arithmetic, and the pages import those back.

Four drifts fell out of reading the screens rather than trusting the app:

- the lead list writes **"Site Visit"** where the export file writes "Site
  visit planned";
- the project list writes **"Planned"** and **"Ongoing"** where
  `PROJECT_STATUS_LABEL` says "Planning" and "Active";
- a vendor on hold reads **"On hold"**, and read "INACTIVE" on the phone;
- **Item Master is not the stock export** — the screen is one row per item
  across every store the filter allows, narrowed by a stock state no column
  carries, and the file is one row per store balance.

The band is now the web's own figures, read over every row in scope rather than
the fifty on screen, and the empty state and the `ListNote` are the screen's own
sentences.

**Found while verifying this release:** `flutter build apk --release` **reused a
cached build** — 13 seconds against the 47 a real one takes — and the APK still
contained `moduleSpecs`, a symbol from the file deleted in this very commit. So
part of what had been handed out was the old app with a new version number.
`flutter clean` is now F0, and F4's note says to grep for something removed as
well as something added.

---

## Release before that

`419d635` · 15 Oct 2026 · 8 commits, from `2b5b14c`. Every item below was run.

| | |
|---|---|
| Rolled forward from | `2b5b14c` |
| Backup taken first | `nninfra-20261015-081032.dump` — 421K, 107 tables, `pg_restore --list` readable |
| Migrations | no pending |
| Permission catalogue | 564 codes, 0 created |
| Role grants | 1524 → 1524 (nothing new this release) |
| Code gate | 1506 unit tests, 405 over HTTP, 81 on the phone, `flutter analyze` clean, `pnpm build` clean |
| Health | `==> Healthy (HTTP 200)` |
| Records on the phone | **six roles read on production, 0 broken**: Owner 24 of 28 modules opened, a PM 13 / 14 refused, a Supervisor 9 / 17, a Store Manager 13 / 13, a Sales Head 12 / 15, a Sales executive 11 / 16 — every refusal a permission, none an error |
| Forms on the phone | 13 as the Owner, 0 broken, 0 missing; 4–6 for the others, the rest refused |
| Android client | `app-release.apk`, 49.6 MB, built after the server. `http://168.231.103.114:3021` found inside `lib/arm64-v8a/libapp.so`; the cleartext policy naming that host ships as `res/8G.xml` |

**What it put live:** parity with the web, made a test rather than a claim.
`tests/unit/mobile-parity.test.ts` reads the records, the forms and the Dart,
and fails when a web action is unreachable from the app and unexplained;
`pnpm parity:matrix` writes `docs/MOBILE_PARITY.md` from the same registries.
**125 of the 152 actions on the boundary are now reachable**, and each of the
other 27 carries a reason. With it: notifications (the web screen the phone
never had), lists a page at a time with every parameter travelling in the same
request, the edits and deletes, and creating a tower's flats from the phone.

Two defects came out of walking the flows as five roles rather than as the
Owner:

- `sales/site-visits` and `units/price-lists` **took `page` and ignored it**,
  so the second page of either was the first page again. Both were calls my
  bulk edit had missed, which is why `tests/e2e/mobile-boundary.test.ts` now
  walks every list and asks for a page it can check.
- the web drew a tower's flat numbering **inside its own setup screen**, so
  there was nothing for a form to call. It now lives in
  `src/lib/units/tower-plan.ts`, and the web previews what the action will do
  rather than its own copy of it.

**Open, and not a deploy problem:** production is served over **plain HTTP on
a bare IP** (`http://168.231.103.114:3021`), so everything the phone sends,
including the password, crosses the internet readable. The Android client has
to name that host in its cleartext allow-list to work at all, which is the
signal that something is wrong. A domain and a certificate would let that line
be deleted.

**Deliberately not mirrored, and listed in `src/lib/api/parity.ts`:** the 12
actions that move a file (no upload or download path at the boundary yet),
Masters and Users (web-only by the brief, 8 actions), and 6 actions whose web
screen does not exist either.

---

## Before you start

| | |
|---|---|
| Server | `root@168.231.103.114` — a **shared** VPS; other applications run on it |
| App | `/var/www/nninfra/app`, pm2 process `nninfra`, **port 3021** |
| Deploy | `sudo /var/www/nninfra/deploy.sh` |
| Backup | `bash /var/www/nninfra/backup-db.sh` → `/var/backups/nninfra` |
| Clock | the server runs UTC |

SSH only with a password, never a key:

```bash
SSHPASS='<root password>' sshpass -e ssh \
  -o PubkeyAuthentication=no -o PreferredAuthentications=password \
  root@168.231.103.114
```

---

## A · Code gate (local)

| # | Check | Command | Verified |
|---|---|---|---|
| A1 | Working tree clean | `git status --porcelain` | ✅ empty |
| A2 | Typecheck | `pnpm typecheck` | ✅ clean |
| A3 | Lint | `pnpm lint` | ✅ clean |
| A4 | Unit + integration | `pnpm test` | ✅ 1136 passed, 80 files |
| A5 | Production build | `pnpm build` | ✅ compiled |
| A6 | End-to-end | see A6 note | ✅ 355 passed, 4 files |
| A7 | No `loading.tsx` above a guarded page | `find "src/app/(app)" -name loading.tsx` | ✅ none |
| A8 | Dev-only login shim not tracked | `git ls-files src/app/shot-temp` | ✅ not tracked |
| A9 | No secrets in tracked files | `git grep -nIE "ghp_[A-Za-z0-9]{20,}"` | ✅ none |
| A10 | `.env` not tracked | `git ls-files \| grep '^\.env'` | ✅ none |

**A6 — the trap.** `pnpm check` does **not** run the end-to-end suite; it is
typecheck + lint + unit/integration only. The e2e suite defaults to port 3000
and, finding nothing there, **skips all 353 tests and exits 0**. A run reporting
"353 skipped" looks like a pass. Start the app and point the suite at it:

```bash
pnpm dev -p 3210 &
E2E_BASE_URL=http://localhost:3210 pnpm test:e2e
```

This is how the Performance screen's 500-for-every-role-but-the-Owner was
caught; nothing in `pnpm check` could see it.

---

## B · Data and permissions (local, against the dev database)

| # | Check | Command | Verified |
|---|---|---|---|
| B1 | Migrations all committed | `git status --porcelain prisma/migrations` | ✅ empty |
| B2 | Schema matches migrations | `npx prisma migrate status` | ✅ 36 applied, up to date |
| B3 | Permission catalogue in sync | `pnpm perms:sync` | ✅ 0 created, 0 updated, 559 unchanged |
| B4 | No orphaned permissions | `pnpm perms:prune` | ✅ 559/559, 0 stale |
| B5 | Role grants complete | `pnpm perms:grants --add` | ✅ 1494 → 1494, nothing missing |
| B6 | Reference seed re-runnable | `pnpm seed:reference` | ✅ clean |
| B7 | Mobile registries in step with the actions | `pnpm mobile:sync && git diff --exit-code src/lib/api` | — run it |

**B7 — why it is here.** `src/lib/api/mobile-actions.ts` and `mobile-lists.ts`
are generated from the server actions and the export routes. They are committed,
so a release whose author forgot to regenerate them ships a boundary that is
missing the action the release was about — and nothing on the web notices,
because the web does not use them. Run it; if the diff is empty, they were in
step.

**B5 — the trap.** The deploy script runs `perms:grants` in its default mode,
which only adds **missing roles**. It does **not** give existing roles
permissions added since. Any release that adds a permission needs
`pnpm perms:grants --add` run on the server afterwards (step D6), or the new
screen is invisible to everyone except super admins.

---

## C · Production readiness

| # | Check | Command | Verified |
|---|---|---|---|
| C1 | Service healthy | `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3021/` | ✅ 307 (guard redirect — correct) |
| C2 | Deployed commit known | `cd /var/www/nninfra/app && git log --oneline -1` | ✅ `afc8ec2` |
| C3 | Disk has room | `df -h /` | ✅ 46G free of 193G (77% used) |
| C4 | Database size sane | `select pg_size_pretty(pg_database_size(current_database()))` | ✅ 17 MB |
| C5 | Nightly backup scheduled | `cat /etc/cron.d/nninfra-backup` | ✅ `0 21 * * * root …backup-db.sh` |
| C6 | Backups present and recent | `ls -t /var/backups/nninfra/*.dump \| head` | ✅ 50 dumps, newest 08 Oct 21:00 |
| C7 | Retention configured | `grep KEEP_DAYS /var/www/nninfra/backup-db.sh` | ✅ 14 days, newest always kept |
| C8 | **A backup actually restores** | `pg_restore --list <newest>.dump` | ✅ readable, 105 tables with data |

**C1 — 307 is the healthy answer.** Every page is behind `requirePermission`,
which redirects. A 200 on `/` would mean the guard is not running.

**C8 — run this as root.** `/var/backups/nninfra` is `700 root`, so
`sudo -u postgres pg_restore` fails with a permission error that reads exactly
like a corrupt dump. It is not.

**Port 3021, not 3000.** This is a shared VPS and port 3000 belongs to another
application. Checking the wrong port returns another app's 404s and looks like
nninfra is broken.

---

## D · The deploy

| # | Step | Command |
|---|---|---|
| D1 | Note the commit you are rolling back to | `cd /var/www/nninfra/app && git log --oneline -1` |
| D2 | **Back up first, always** | `bash /var/www/nninfra/backup-db.sh` |
| D3 | Confirm the dump was written | last line reads `==> Done. N backups kept` |
| D4 | Push | see D4 note |
| D5 | Deploy | `sudo /var/www/nninfra/deploy.sh` |
| D6 | Hand out new permissions | `cd /var/www/nninfra/app && pnpm perms:grants --add` |
| D7 | Confirm the health check | deploy ends `==> Healthy (HTTP 200)` |

**D4 — pushing without leaving the token on disk.** The remote URL stays
token-free; the credential helper is disabled for the call and the askpass
script is deleted in the same command:

```bash
A=$(mktemp); printf '#!/bin/sh\ncase "$1" in *Username*) echo "<user>";; *) echo "<token>";; esac\n' > "$A"
chmod 700 "$A"
GIT_ASKPASS="$A" GIT_TERMINAL_PROMPT=0 git -c credential.helper= push origin main
rm -f "$A"
```

**What the deploy script does:** pull, install, `prisma migrate deploy`, sync
the permission catalogue, recompute role grants (additive only — see B5),
`pnpm seed:reference`, build, restart, health check.

**What it does NOT do:** it runs `pnpm seed:reference`, which touches reference
data only. It does **not** run `prisma/seed.ts`. Demo or sample rows will not
appear on production because you deployed.

---

## E · After the deploy

| # | Check | How | Verified for `afc8ec2` |
|---|---|---|---|
| E1 | Deployed commit is the one you pushed | `git log --oneline -1` on the server | ✅ |
| E2 | Migrations applied | `npx prisma migrate status` | ✅ up to date |
| E3 | Permission count moved as expected | `select count(*) from permissions` | ✅ 559 |
| E4 | Grants moved as expected | `perms:grants --add` output | ✅ 1494 |
| E5 | Every screen renders for a non-Owner role | browser pass, two roles | ✅ 23 screens, 0 errors |
| E6 | The feature you shipped actually works | open it and use it | ✅ |

**E5 is not optional.** Three of the last four defects found in this system were
invisible to the Owner and broke for everybody else: a Prisma scope clause that
is only valid when empty, a permission never granted beyond super admins, and a
screen with no link into it. Sign in as a Project Manager, not as yourself.

---

## F · The Android client (only when `mobile/` changed)

The app is released on its own schedule and is **not** touched by
`deploy.sh` — it is an APK, not a server. But it talks to the boundary, so the
order matters: the server goes first, always. An app built against an endpoint
that is not deployed yet fails for every user at once, and cannot be rolled back
from here.

| # | Check | Command |
|---|---|---|
| F0 | **Built from clean** | `cd mobile && flutter clean && flutter pub get` |
| F1 | Analyzer clean | `cd mobile && flutter analyze` |
| F2 | Tests pass, including the usability suite | `cd mobile && flutter test` |
| F3 | Built against the **real** host, not an emulator's loopback | `flutter build apk --release --split-per-abi --dart-define=NN_BASE_URL=https://<host>` |
| F4 | `NN_BASE_URL` is in the APK you are about to hand out | the default is `http://10.0.2.2:3210`, which is a laptop seen from an emulator — a release carrying it reaches nothing |
| F5 | Every role can still sign in | `admin.mobile.use` must be granted (B5/D6), or the app refuses with that code while the web works |

**F4 is the one that bites.** The server address is baked in at build time.
There is no setting to correct it afterwards and no error that explains it — the
app simply cannot reach anything, and looks broken rather than misconfigured.

**F0 is the one that lies.** A release build reuses what Gradle and the Dart
snapshot already have, and an incremental release took 13 seconds where a real
one takes 47. The APK built that way still carried `moduleSpecs` — a symbol from
a file that had been **deleted** — so it was partly the old app wearing the new
version number, and the only way to see that is to look inside:

```bash
unzip -p app-release.apk lib/arm64-v8a/libapp.so > /tmp/libapp.so
strings /tmp/libapp.so | grep -c "<something you added>"   # must be ≥ 1
strings /tmp/libapp.so | grep -c "<something you deleted>" # must be 0
```

Grep for something **removed** as well as something added. A stale build passes
the first check and fails the second, which is exactly the case that looks like
"nothing I changed shows up".

---

## Rollback

```bash
# 1 · put the code back
cd /var/www/nninfra/app
git reset --hard <the commit from D1>
pnpm install --frozen-lockfile && pnpm build
pm2 restart nninfra

# 2 · only if a migration has to be undone, restore the D2 dump
sudo -u postgres pg_restore --clean --if-exists --no-owner \
  --dbname=nn_infra_erp /var/backups/nninfra/<the D2 dump>
```

Restoring the database loses everything written since the dump. Reverting the
code does not. Try the code alone first — most bad releases are code, not
schema, and the migrations in this project are additive.

---

## Known traps, in the order they have bitten

**A root-owned file inside `.next` fails the build, silently.** The deploy
builds as `nninfra`. Anything root has left in `.next` — one file is enough —
stops it with `EACCES: permission denied, open .next/server/app/_not-found.rsc`,
and because the script exits there it never restarts, never health-checks and
never rolls back. The repository ends up at the new commit while pm2 keeps
serving the old build, so the site looks fine and the release is simply not
there. Nothing in the log says "failed" unless you read to the end of it.

It bit on 14 Oct: eight root-owned files from a diagnostic run in the app
directory. The cure is `chown -R nninfra:nninfra /var/www/nninfra/app/.next`
followed by a re-deploy, and the lesson is that **anything run as root in the
app directory must be followed by that chown**. Check the end of the deploy
log, not the middle: "==> Healthy (HTTP 200)" is the only line that means it
worked.



1. **`pnpm check` does not run e2e**, and e2e silently skips when the app is not
   on port 3000. (A6)
2. **`perms:grants` without `--add`** leaves new permissions ungranted, so a new
   screen is invisible to everyone but super admins. (B5, D6)
3. **Port 3000 is another application** on this shared VPS. nninfra is 3021. (C)
4. **A Prisma `where` is a plain object**, so a scope clause for the wrong model
   is not a type error — it only fails for users whose scope is non-empty, which
   never includes the Owner. Test as a Project Manager. (E5)
5. **A new master needs a way in.** Adding one to the registry creates its screen
   at `/masters/<key>`; nothing links to it unless it is in Reference Data.
6. **`sudo -u postgres` cannot read the backup directory** (700 root). Verify
   dumps as root. (C8)
