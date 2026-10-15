# Release checklist — NN Infra ERP

Every item here was run before this document was written, and every one passed.
The results column is that run, on 09 Oct 2026, against commit `af96d8c`.

Work down it in order. An item that fails stops the deploy — none of them are
advisory.

---

## Last release

`872cd11` · 15 Oct 2026 · 1 commit, from `07bbd91`. Every item below was run.

| | |
|---|---|
| Rolled forward from | `07bbd91` |
| Backup taken first | `nninfra-20261015-130950.dump` — 107 tables, `pg_restore --list` readable |
| Migrations | no pending |
| Permission catalogue | 564 codes, 0 created |
| Role grants | 1524 → 1524 (nothing new this release) |
| Code gate | 1576 unit tests, 406 over HTTP, 104 on the phone, `flutter analyze` clean, `pnpm build` clean |
| Health | `==> Healthy (HTTP 200)` |
| Read on production | every screen's creates (`Receive goods · GRN`, `New item master record`, `New unit` + `Create units`), the task form's levels (`levels · shown when checklistIds · led by assigneeId`), the KB's `files` field, the customer's `Identity documents` collection with `Attach Aadhaar or PAN`, and the site log's `position:geo` |
| Android client | `app-release.apk`, 51.3 MB, built from clean. `openRecord`, `fieldsFrom`, `level-add:`, `files-` and `geo-` present inside `lib/arm64-v8a/libapp.so`; `moduleSpecs` absent; `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` in the manifest. Two new plugins — `geolocator` for the site log's position, `file_picker` for attachments |

**What it put live:** the seven gaps named after the last release.

1. **A customer's Aadhaar and PAN copies.** `Customer.kycDocuments` has been on
   the model since the schema was written and nothing filled it — the web
   records the two numbers and the paper lived elsewhere. Attaching and reading
   them is now on the customer's record, behind `viewKyc` to read and
   `verifyKyc` to attach, removable only while KYC is unverified, and in the
   audit trail. **The web has no customer detail screen to put this on, so it
   is the phone's own** rather than parity.
2. **Knowledge-base attachments**, which *is* parity: the editor has always
   taken files and the phone could not choose one.
3. **Every form audited against its web modal.** `form-fields.test.ts` reads
   every name each modal submits and insists the form asks for it, with a
   written reason for the few it deliberately does not. It found two real
   gaps — the site log had no position while the browser fills latitude and
   longitude from its own geolocation, and the employee form had no country
   code, so a number typed without one lost it. Both fixed; the code list is
   now one list the web and the phone read. **Every dropdown is searchable**:
   a short list keeps the design's chips and gains a "Search…" chip beside
   them.
4. **Review and approval levels are drawn as levels** — numbered rows, level 1
   locked to the assignee with "· the assignee" beside it, a searchable picker
   per level above, Remove, and "+ Add level N" — and they appear only once a
   checklist is picked, as the web reveals them.
5. **Goods receipt can be raised from its own list.** The web does it in two
   screens, because the lines cannot be drawn until the order is known, so the
   forms layer grew a shape for exactly that: `openRecord` asks one question
   and opens the record where the next step lives.
6. **The item master's create**, in the web's own fields, with the code
   generated as the web generates it.
7. **Available Flats carries its create buttons** — a single flat and a whole
   tower — where the web's page header has them.

**Two plugins were added to the app**, each behind a seam so a widget test can
drive it: `geolocator` (the site log's position, asked for at the moment it is
used and refusable — the log saves without it, as the web's does) and
`file_picker` (attachments, offering only the types `upload-rules.ts` lets the
server store). `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` are declared
in the manifest.

**One thing to know about the GRN picker:** it lists approved and part-received
orders only, which is what the web lists. On production that list is currently
empty — there is no order awaiting delivery — so the picker opens with nothing
in it until one is approved.

---

## Release before this one

`a1dc609` · 15 Oct 2026 · 2 commits, from `9614543`. Every item below was run.

| | |
|---|---|
| Rolled forward from | `9614543` |
| Backup taken first | `nninfra-20261015-115330.dump` — 424K, 107 tables, `pg_restore --list` readable |
| Migrations | no pending |
| Permission catalogue | 564 codes, 0 created |
| Role grants | 1524 → 1524 (nothing new this release) |
| Code gate | 1547 unit tests, 406 over HTTP, 96 on the phone, `flutter analyze` clean, `pnpm build` clean |
| Health | `==> Healthy (HTTP 200)` |
| Read on production | the board for a Sales Head (3 towers · 148 flats · 116 available, 32 booked · legend 3 · chips 4 · types 3 · panel buttons Hold unit and Remove booking), the task tabs for a PM and a Supervisor, and the checkpoint icons ↑ ↓ 🗑 for the Owner |
| Android client | `app-release.apk`, 50.3 MB, built from clean. `BoardScreen`, `flat-action:`, `fieldsFrom` and `excludeSemantics` present inside `lib/arm64-v8a/libapp.so`; `moduleSpecs` absent |

**What it put live:** three screens the app had the wrong shape for.

**Available Flats is a board.** The drawer's entry opens `/units/board`, and the
phone was drawing the flats *table* instead. The board now travels: the towers
as chips — clusters, on a villa project — the three-colour legend, the status
and type chips, the floors stacked highest first, and every flat as a tile in
the colour of its state. A filter **fades** what it excludes rather than
removing it, so a tower does not change shape as the filters are used. A tile
opens the web's right-rail panel: who it is held or booked for, Hold unit,
Release hold, Remove booking, and "Book unit" — which opens the flat's record,
because booking is a cost sheet followed by a booking rather than one action.
`src/lib/units/board.ts` holds the three states, their words, the tower wording
and the holder line, and `board-grid.tsx` reads them too.

**The task detail has the web's tabs.** Checklist · Review and approval ·
History, with the "Next:" line beside them. The checklist tab carries the bar
the web draws, the "Yours to review · N" chip and each point's own square — ✓
through, ✕ denied, its number until then — with Approve and Deny where the
viewer holds the point. The levels tab is the web's own list of who judges and
what each is holding.

**A checkpoint moves by its icons** — ↑, ↓ and 🗑 as the web draws them, each
keeping its name for a screen reader, beside the worded "Edit text".

**Found by reading it on production:** the record offered Approve and Deny only
when `canDo` allowed, and `canDo` reads the **task's** status. On a task in
Rework with one denied point back at its approver, the web offered the buttons
and `reviewChecklistItemAction` accepted them — the action authorises on the
level's own permission and on the point waiting on you, and never asks the
task's status. So the phone hid a button that worked. It now asks exactly what
the web and the action ask. Re-read afterwards: the approver holding that point
gets Approve/Deny on it and on nothing else; a supervisor holding none gets
none.

Two more things the same read settled rather than broke: the empty "Next:" line
is the web's own behaviour on a Rework task, and Available Flats refusing a
Project Manager, a Supervisor and a Store Manager is correct — those roles hold
no unit permissions at all, so the web refuses them too. The list's gate is now
the board's own `unit.board.view`, which is the screen the phone shows; the file
keeps the unit master's permission.

---

## Release before that

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
