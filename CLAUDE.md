# NN Infra ERP — working notes

Construction & real-estate ERP + Sales CRM. Next.js 16 App Router, PostgreSQL,
Prisma 6, Tailwind 4. See `README.md` for setup and `docs/PERMISSIONS.md` for
the access-control model.

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

## Conventions

- Reference permissions through `PERM.*` (typed, generated) — never string
  literals.
- Masters are configuration, not code: add a block to
  `src/lib/masters/registry.ts` and the list, form, validation, search, audit
  and permissions all follow. Run `pnpm verify:masters` after touching it.
- Prisma `Decimal` and `Date` are not serialisable across the server/client
  boundary — convert with `Number(...)` / `.toISOString()` in the page, not the
  client component.
- Money is rendered with `money()` / `moneyShort()` from `src/lib/utils.ts`
  (Indian numbering, lakh/crore). Numeric cells carry the `num` class for
  tabular figures.
- Every mutating action goes through `runAction()` so permission failures come
  back as form errors rather than exceptions, and writes an audit row via
  `recordAudit()`.
- Document numbers come from `nextDocumentNumber()` inside a transaction —
  never hand-built.
- Derive state; don't sync it in an effect. The lint config enforces this.

## Stock and money

Anything that changes stock goes through `postStockMovement()` in
`src/lib/inventory.ts` — never write `StockBalance` or `StockLedger` directly.
It owns weighted-average valuation and refuses to drive a balance negative.

The GRN → stock → PO-status step lives in `src/lib/material/grn-posting.ts`,
extracted from the action so it can be tested without a request context. Keep
new posting logic in that shape: the action does permission and state checks,
the service does the arithmetic.

## Sales pricing

`src/lib/sales/cost-sheet.ts` is pure and shared by the server action *and* the
client preview, so what an executive sees before saving is what gets stored.
Keep it Prisma-free. `generateCostSheetFor()` in `sales/service.ts` is the
database-aware wrapper that resolves the price list by effective date.

Never read the clock during render — the lint config rejects `Date.now()` in a
component body. Compute "now" once during data fetching and pass it down as a
prop (see `nowMs` in the booking, board and site-visit screens); that also keeps
server and client agreeing about what is overdue.

## No `loading.tsx` above a guarded page

Pages guard with `requirePermission()`, which `redirect()`s. A `loading.tsx`
puts a Suspense boundary above the page, so the response starts streaming
before the guard runs and the redirect is delivered as a **streamed 200**
instead of a **307**. Every route guard silently stops being an HTTP redirect.

`tests/e2e/access-control.test.ts` catches it — 34 tests fail the moment a
`loading.tsx` lands in `src/app/(app)/`. The design's loading splash therefore
lives at `src/app/(auth)/loading.tsx`, which sits below no guard.

To stream part of a guarded page, put `<Suspense>` *inside* the page, after
`requirePermission()` has already returned.

## The mobile boundary

The Android client at `mobile/` cannot call a server action, so it goes through
`/api/mobile/v1` — and that boundary **dispatches to the web's own actions**
rather than reimplementing them. Two consequences for any change here:

- **Adding or changing a server action means running `pnpm mobile:sync`.** It
  regenerates `src/lib/api/mobile-actions.ts` and `mobile-lists.ts` from the
  signatures. `tests/unit/mobile-args.test.ts` fails when they are out of step.
- **A list endpoint is that list's export route** answering `format=json`
  (`src/lib/exports/respond.ts`). So a module with no export route has no list
  on the phone. Writing a second query for mobile is how the two screens start
  disagreeing.

Every endpoint needs `admin.mobile.use` on top of its own codes — the one
permission that exists because the phone exists. `readSessionToken()` accepts a
bearer token where there is no cookie, which is what lets the actions work
unchanged; a cookie still wins.

## Verifying a change

```bash
pnpm check                 # typecheck + lint + test — the gate before committing
pnpm build                 # before anything ships
pnpm test:e2e              # access-control over HTTP; needs `pnpm dev` running
```

## Testing conventions

- Business logic goes in a **pure module** that takes its transaction client as
  an argument (`inventory.ts`, `sales/cost-sheet.ts`, `rbac/resolve.ts`,
  `masters/schema.ts`). Actions stay thin: permission and state checks only.
  This is what makes the logic testable without faking a request.
- An invariant belongs **with the arithmetic**, not only in the action that
  calls it — a guard in the action alone is bypassable by any other caller.
- Integration tests share the development database. Create disposable rows with
  a unique `tag()` suffix and clean up in `afterAll`.
- Adding a permission, master, report or navigation entry? The registry tests in
  `tests/unit/permission-registry.test.ts` will fail if you forget its
  permission. That is the point — do not weaken them.
