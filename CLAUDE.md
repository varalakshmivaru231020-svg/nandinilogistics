# Nandini Logistics Rider CRM — working notes

Rider CRM, onboarding and payout platform for a delivery-logistics company,
per Supreme One's SOW (ref SOS/SOW/2026/RCRM-01). Next.js 16 App Router,
PostgreSQL, Prisma 6, Tailwind 4. See `README.md` for setup,
`docs/PERMISSIONS.md` for the access-control model and
`docs/SCOPE_MAPPING_RIDER_CRM.md` for how the SOW maps onto the modules.

The codebase began life as a construction ERP; the platform (auth, RBAC,
masters engine, audit, exports, the mobile boundary) is that codebase's, and
the business modules were replaced for the SOW.

## The one rule

**Nothing guarded ships without a permission registered first.**

Every page, tab, list, button, sensitive field, approval step and report has a
code in `src/lib/permissions/registry.ts`. Adding a feature means adding its
permissions in the same change — see the seven-step checklist in
`docs/PERMISSIONS.md`.

After editing the registry: `pnpm perms:sync` (regenerates
`src/lib/permissions/codes.ts` and syncs the database catalogue).

## Guard in three places, every time

```tsx
const ctx = await requirePermission(PERM.x.y.view);   // page
<Can I={PERM.x.y.create}>…</Can>                      // control (courtesy only)
const ctx = await authorize(PERM.x.y.create);         // server action (the boundary)
```

Never rely on hidden UI. `authorize()` inside the action is what actually stops
anything.

## The four roles

Admin (web only — it never holds `admin.mobile.use`), Team Leader,
Tele-caller and Rider. `prisma/role-matrix.ts` is the proposed default and
is editable from Administration → Roles. Two codes are *duties*, not access:
`sales.lead.receiveAssignment` (who is handed leads — the tele-callers) and
`sales.followUp.receiveEscalation` (who is told about a lapse — the Team
Leaders). They are resolved without the super-admin bypass.

### Approval rule (fixed, not configurable)

Leads and referrals: anything a **Tele-caller** raises waits as *Pending
approval* until a Team Leader or Super Admin decides (`initialApproval()`).

Riders, advances, edits, deletions and status changes follow the **chain**
(`needsApproval()` / `mayDecideFor()` in `src/lib/approvals/rule.ts`): a
Tele-caller's work waits for a Team Leader *or* Super Admin — whichever decides
first; a Team Leader's waits for Super Admin; Super Admin's goes through. Nobody
decides their own request. "Super Admin" is the flag or an approver holding
`hr.employee.viewAll`; "Team Leader" any other holder of
`approvals.queue.decide`.

- A new rider is created with `Employee.approval = PENDING` and cannot be
  submitted for onboarding until approved.
- An edit, deletion or Left/reactivate is held as a `ChangeRequest`
  (`src/lib/approvals/changes.ts`) and applied only on approval. Photos and
  KYC copies on an edit are attached at once; the particulars wait. The
  creator's edits to their own still-pending record apply directly.
- Advances record `requestedById`; a Team Leader cannot approve one they
  raised.
- Only `hr.employee.createStaff` (Admin) adds Internal Staff or Team Leader
  records.

Everything waiting is one list, `/approvals` (`src/lib/approvals/inbox.ts`),
decided by `decideApprovalAction()`, with "Recently decided" below it (from
the audit trail — Super Admin sees what Team Leaders approved). Requests and
decisions notify; a Team Leader's decision also notifies Super Admin
(`APPROVAL_DECIDED_BY_TL`). A reason is mandatory on reject.

Every staff login has a person record (`src/lib/hr/staff-link.ts`, created
with the user; `pnpm staff:link` backfills), so Tele-callers and Team Leaders
check in / out from the top bar like a rider punches from the app.

## Conventions

- Reference permissions through `PERM.*` (typed, generated) — never string
  literals.
- Masters are configuration, not code: add a block to
  `src/lib/masters/registry.ts` and the list, form, validation, search, audit
  and permissions all follow. Lead stages, lost reasons, advance reasons,
  offer letter templates and the numbering series are all masters.
- A lead's stage is a master row with a `kind` (NEW / OPEN / ONBOARDING /
  LOST). Code reads the kind, never the name — Admin may rename a stage.
- Prisma `Decimal` and `Date` are not serialisable across the server/client
  boundary — convert with `Number(...)` / `.toISOString()` in the page, not the
  client component.
- Money is rendered with `money()` / `moneyShort()` from `src/lib/utils.ts`
  (Indian numbering, lakh/crore). Numeric cells carry the `num` class for
  tabular figures.
- Every mutating action goes through `runAction()` so permission failures come
  back as form errors rather than exceptions, and writes an audit row via
  `recordAudit()`.
- Document numbers come from `nextDocumentNumber(tx, key)` inside a
  transaction — never hand-built. `RIDER` produces the SOW's `NL001`; the
  prefix and padding are editable in the Numbering Series master.
- Every list's `where` lives in a pure `list-filters.ts` beside the module
  and is shared by the page, the export route and the mobile list, so the
  three cannot disagree.
- Derive state; don't sync it in an effect. The lint config enforces this.

## Scope — who sees whom

A Team Leader's team is the riders deployed to the companies assigned to
them (`CompanyTeamLeader` → `RiderCompany`). A tele-caller sees the riders
whose lead they own or whom they created. A rider sees only themselves.
`hr.employee.viewAll` / `payout.payout.viewAll` / `advance.advance.viewAll`
lift that to everyone. Inactive (Left) riders are visible only to viewAll
holders. The rule is `employeeScope(ctx)` in `src/lib/hr/list-filters.ts`;
use it rather than restating it.

## Payouts

`src/lib/payouts/compute.ts` is pure: it parses a company's sheet through its
`payoutColumnMap`, applies the `payout.formula` setting (each term is a sign
on a named column, never free-text arithmetic) and fills advance and bike-rent
deductions from the system when the sheet has none. `service.ts` is the
database-aware half: matching rider codes, posting, hold/release. An import is
reviewed as a draft and *posted*; only posted lines reach riders and Team
Leaders. Keep invariants with the arithmetic, not only in the action.

## Never read the clock during render

The lint config rejects `Date.now()` in a component body. Compute "now" once
during data fetching and pass it down as a prop (`nowMs`); that also keeps
server and client agreeing about what is overdue or still within a referral's
25 days.

## No `loading.tsx` above a guarded page

Pages guard with `requirePermission()`, which `redirect()`s. A `loading.tsx`
puts a Suspense boundary above the page, so the response starts streaming
before the guard runs and the redirect is delivered as a **streamed 200**
instead of a **307**. `tests/e2e/access-control.test.ts` catches it. The
loading splash lives at `src/app/(auth)/loading.tsx`, below no guard. To
stream part of a guarded page, put `<Suspense>` *inside* the page, after
`requirePermission()` has returned.

## The mobile boundary

The Android client at `mobile/` cannot call a server action, so it goes through
`/api/mobile/v1` — and that boundary **dispatches to the web's own actions**
rather than reimplementing them. The client is behind the web at the moment
(the admin panel came first); the boundary is kept honest regardless:

- **Adding or changing a server action means running `pnpm mobile:sync`.** It
  regenerates `src/lib/api/mobile-actions.ts` and `mobile-lists.ts` from the
  signatures. `tests/unit/mobile-args.test.ts` fails when they are out of step.
- **A list endpoint is that list's export route** answering `format=json`
  (`src/lib/exports/respond.ts`). A module with no export route has no list
  on the phone.
- Every endpoint needs `admin.mobile.use` on top of its own codes.
  `readSessionToken()` accepts a bearer token where there is no cookie.
- Three shapes, all rendered from what the server sends: a list and its
  filters (`src/lib/screens/registry.ts`), one record (`src/lib/records/*`,
  which decides its own actions with the same helpers the web uses), a form
  (`src/lib/forms/registry.ts`, in the web modal's own words —
  `tests/unit/form-registry.test.ts` reads those screens back).
- **Parity is a test, not a claim.** `tests/unit/mobile-parity.test.ts` fails
  for any web action the app cannot reach unless `src/lib/api/parity.ts`
  gives a reason. `pnpm parity:matrix` writes `docs/MOBILE_PARITY.md`; do not
  hand-edit it.

## Verifying a change

```bash
pnpm check                 # typecheck + lint + test — the gate before committing
pnpm build                 # before anything ships
pnpm test:e2e              # access-control over HTTP; needs `pnpm dev` running
```

## Testing conventions

- Business logic goes in a **pure module** that takes its transaction client as
  an argument (`payouts/compute.ts`, `sales/assignment.ts`, `sales/lead-edit.ts`,
  `riders/referrals.ts`, `rbac/resolve.ts`, `masters/schema.ts`). Actions stay
  thin: permission and state checks only.
- An invariant belongs **with the arithmetic**, not only in the action that
  calls it.
- Integration tests share the development database. Create disposable rows with
  a unique `tag()` suffix and clean up in `afterAll`. The seeded accounts are
  `admin@`, `tl@`, `telecaller@`, `telecaller2@` and `rider@nandini.example`,
  password `Nandini@2026`.
- Adding a permission, master, report or navigation entry? The registry tests in
  `tests/unit/permission-registry.test.ts` will fail if you forget its
  permission. That is the point — do not weaken them.
