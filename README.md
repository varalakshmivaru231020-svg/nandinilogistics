# NN Infra ERP & Sales CRM

Construction and real-estate ERP with an integrated sales CRM for **NN
Infrastructure Developers** — projects, site quality, material procurement and
residential sales on one database with one permission model.

Web platform first; the Android and iOS apps (Flutter) consume the same data and
are planned for a later phase.

---

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19, Server Actions) |
| Language | TypeScript, strict |
| Database | PostgreSQL 17 + Prisma 6 |
| Auth | Signed JWT in an httpOnly cookie (`jose`) + revocable server sessions |
| Passwords | bcrypt, cost 12 |
| Validation | Zod, shared between client and server |
| UI | Tailwind CSS 4, custom component layer, lucide icons |

Server Actions are the write path; every one of them re-checks permissions
server-side, so the UI can never be the security boundary.

---

## Getting started

```bash
pnpm install

cp .env.example .env          # then set DATABASE_URL and AUTH_SECRET
#   AUTH_SECRET: openssl rand -base64 32

createdb nn_infra_erp
pnpm db:migrate               # apply migrations
pnpm db:seed                  # permissions, roles, masters, users, demo project
pnpm db:demo                  # optional: stock, indents mid-approval, leads

pnpm dev                      # http://localhost:3000
```

### Demo accounts

All use the password `Nninfra@2026`. Each lands on a different dashboard with a
different menu — that is the permission model doing its job, not five different
builds.

| Email | Role | Sees |
| --- | --- | --- |
| `owner@nninfra.example` | Owner / Admin | Everything (468 permissions) |
| `pm@nninfra.example` | Project Manager | Projects, schedule, indent approval (124) |
| `supervisor@nninfra.example` | Supervisor | Raise indents, site log, own data only (33) |
| `store@nninfra.example` | Store Manager | Full material chain, stock, vendors (103) |
| `saleshead@nninfra.example` | Sales Head | Whole pipeline, pricing, discounts (110) |
| `sales@nninfra.example` | Sales Executive | Own leads, availability board (49) |

---

## Scripts

| Command | Does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm db:migrate` | Create and apply a migration |
| `pnpm db:seed` | Permissions, roles, masters, users, demo project |
| `pnpm db:demo` | Demo transactions (stock, indents, leads) |
| `pnpm db:reset` | Drop, re-migrate, re-seed |
| `pnpm db:studio` | Prisma Studio |
| `pnpm perms:sync` | Regenerate typed codes **and** sync the DB catalogue |
| `pnpm test` | Unit + integration tests |
| `pnpm test:unit` | Pure logic only — no database needed |
| `pnpm test:integration` | Against the real database |
| `pnpm test:e2e` | HTTP access-control tests (needs the app running) |
| `pnpm test:all` | Everything |
| `pnpm test:coverage` | Coverage over `src/lib` |
| `pnpm check` | typecheck + lint + test — the gate before a commit |

---

## Architecture

```
src/
  lib/
    permissions/registry.ts   ← THE permission catalogue (hand-authored)
    permissions/codes.ts      ← generated typed codes — do not edit
    rbac/context.ts           ← resolves a user's effective permissions
    rbac/guard.ts             ← requirePermission / authorize / runAction
    masters/registry.ts       ← all 22 masters as configuration
    masters/schema.ts         ← pure: zod build, coercion, query shaping
    masters/service.ts        ← Prisma-touching half of the master engine
    inventory.ts              ← stock posting, weighted average, three-way match
    storage.ts                ← document storage driver (local; swappable for S3)
    material/grn-posting.ts   ← GRN → stock ledger → PO status
    sales/cost-sheet.ts       ← pure: charge derivation, payment milestones
    sales/service.ts          ← price-list resolution, hold expiry
    reports/index.ts          ← the 13 reports and their queries
    navigation.ts             ← sidebar, filtered by permission
    audit.ts                  ← audit trail with field-level diff
    numbering.ts              ← per-project document numbering
  components/
    rbac/                     ← <Can>, <Sensitive>, PermissionProvider
    ui/                       ← buttons, tables, modals, primitives
    shell/                    ← sidebar, topbar, app shell
  app/
    (auth)/login              ← sign-in
    (app)/                    ← everything behind auth
```

**Read [docs/PERMISSIONS.md](docs/PERMISSIONS.md) before adding any feature.**
Every guarded surface needs a registered permission, and there is a seven-step
checklist for adding one.

---

## Modules

| # | Module | Status |
| --- | --- | --- |
| 01 | Project Management | ✅ Projects, work breakdown, team, versioned document repository, geo-tagged site progress, units |
| 02 | Task Management | ⏸ **Pending client verification** |
| 03 | Checklist Management | ⏸ **Pending client verification** |
| 04 | Project Schedule | ✅ Gantt with baseline vs planned vs actual, critical path, mandatory delay reasons |
| 05 | Material & Inventory | ✅ **Complete chain** — indent → PM/Admin approval → stock check → PO → GRN → 3-way match → payment → issue → inter-store transfer |
| 06 | Lead Management & Sales CRM | ✅ **Complete** — leads, pipeline, follow-ups, site visits, customers & KYC, cost sheets, bookings, milestone demands, collections |
| 07 | Available Flats | ✅ **Complete** — interactive availability board, self-expiring holds, versioned price lists |
| — | Masters | ✅ All 22, fully working |
| — | Administration | ✅ Users, roles, permission matrix, approval limits, audit, sessions |
| — | Reports | ✅ 13 reports computing live data, each with CSV export |

Task and Checklist are held deliberately — see
[docs/PENDING_MODULES.md](docs/PENDING_MODULES.md).

Only the Flutter mobile apps remain outside this list.

Documents are stored on the local filesystem behind a driver boundary
(`src/lib/storage.ts`); swapping in S3 or GCS means changing `put`, `get` and
`remove` and nothing else. Files are addressed by an opaque generated key and
served through a guarded route, so a document cannot be reached by guessing a
URL or by escaping the storage root with a crafted filename.

---

## Access control in one paragraph

A user holds roles; roles hold permissions; a user may also carry direct
`ALLOW` / `DENY` overrides, and `DENY` always wins. On top of that, data is
scoped to the projects a user is mapped to unless they hold
`project.project.accessAll`, and approvals are capped by a configurable value
ceiling per approval chain. Everything a user can see or do — every menu entry,
tab, button, sensitive column and approval step — is a projection of that one
resolution, computed once per request.

---

## The sales chain

```
Lead → follow-ups → site visit → hold a unit (self-expiring)
  ↓
Cost sheet     generated from the active price list and the charge-head master.
  ↓            Floor rise, PLC and parking are derived from the unit itself.
Discount       needs approval, capped by the approver's ceiling
  ↓
Booking        unit leaves the board, hold is released, lead marked booked
  ↓
Demands        construction-linked milestones raised from the booking total,
  ↓            reconciled to the rupee
Receipts       collected against a demand; the demand and booking advance
  ↓
Agreement → Registration
```

A discount that was never approved cannot walk into a booking, and the price
list is resolved **by date** — so a booking made under an earlier version keeps
that version's rate even after a revision is published.

## The controlled material chain

The signature workflow from the scope document, working end to end:

```
Indent          supervisor raises it on site, against a work package
  ↓
PM approval     may revise quantities — the change is recorded on the trail
  ↓             below the PM's configured ceiling, the Admin step is skipped
Admin approval  owner clears anything above that ceiling
  ↓
Stock check     what is already in store is marked for issue;
  ↓             only the shortfall becomes a purchase order
Purchase order  approved against the PO value ceiling
  ↓
Goods receipt   accepted / rejected / short recorded against the challan.
  ↓             Only accepted quantity enters the stock ledger.
Invoice         three-way match: PO ↔ GRN ↔ invoice.
  ↓             Over-billing or an above-PO rate blocks approval.
Payment         released only against an approved invoice
  ↓
Issue           store → supervisor, valued at weighted average,
                acknowledged by whoever receives it
```

Two guarantees hold throughout:

- **Valuation is weighted average.** Receiving 100 @ ₹400 then 100 @ ₹500 leaves
  the average at ₹450, not ₹500. Issues are valued at the average and do not
  move it. Proved by `pnpm verify:inventory`.
- **The ledger is append-only.** A posted GRN is never rewritten; a correction
  is a new stock adjustment. The ledger always sums to the balance.

Clearing a blocked mismatch needs `material.vendorInvoice.overrideMismatch` —
a permission Store Manager deliberately does not hold — and the override is
named in the audit trail.

## Testing

```bash
pnpm test          # 275 unit + integration tests
pnpm dev &         # the E2E suite drives the running app
pnpm test:e2e      # 62 access-control tests over HTTP
pnpm test:all      # all 337
```

**337 tests across 17 files**, ~87% statement coverage of `src/lib`.

| Layer | What it proves |
| --- | --- |
| `tests/unit` (120) | Cost-sheet and payment-schedule arithmetic, three-way match, permission resolution (DENY precedence, inactive roles, ceilings), the master engine's schema building and query shaping, money formatting in Indian numbering, the password policy, document storage including path-traversal defence |
| `tests/integration` (155) | Weighted-average valuation against a real database, the indent → PO → GRN → stock chain, all 22 masters through a full CRUD cycle, date-based price-list resolution, self-expiring holds, document numbering under concurrency, all 13 reports, document upload and versioning, **and the server actions themselves** — approval routing against real value ceilings, explicit DENY, blocked-invoice overrides |
| `tests/e2e` (62) | That the **server** enforces access, not the UI — route guards per role, button-level gating, row-level scoping, approval steps, and immediate session revocation |

Some deliberate choices worth knowing:

- Server actions are called **directly** in `tests/integration/action-guards.test.ts`.
  Only `cookies()` is stubbed — permission resolution, approval ceilings, the
  database writes and the business rules are all the production code path.
- Integration tests run against the same Postgres database as development and
  clean up after themselves. `fileParallelism` is off so they cannot race.
- The E2E suite **skips itself** with a warning when the app is not running,
  rather than failing misleadingly.

### Two bugs these tests caught

1. **Double-posting a goods receipt.** The "already posted" guard lived only in
   the server action, not in `postGrnToStock` where the invariant belongs — so
   posting the same GRN twice silently doubled the stock and corrupted the
   weighted average. The guard now sits with the arithmetic.
2. **Price lists could not resolve by date.** The lookup filtered on
   `isActive: true`, which meant a superseded version could never be found for a
   past date — defeating the whole point of "a past booking keeps the rate it
   was sold at". Resolution is now purely by effective date.

Both have regression tests.

## Continuous integration

`.github/workflows/ci.yml` runs the whole gate against a real Postgres service:
migrate → seed → typecheck → lint → test → build → start → E2E. A second job
regenerates `src/lib/permissions/codes.ts` and fails if it differs from what is
committed, so the registry and the generated codes can never drift apart.

## Security notes

- Passwords hashed with bcrypt (cost 12) and never returned to the client.
- Sessions are rows in the database, so deactivating a user or resetting their
  password revokes every device on the next request rather than at token expiry.
- Sign-in failures are recorded in the audit trail; the error message never
  reveals whether an address exists.
- Every create, update, approve and delete writes an audit row with a
  field-level before/after diff.
- Server Actions re-authorise on every call — hidden UI is never the boundary.
