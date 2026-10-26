# The Permission Model

> **The rule of this codebase:** nothing guarded is added to the platform
> without a permission being registered first. A page, a tab, a list, a button,
> a sensitive column, an approval step, a report — each gets a code, and that
> code is what gets assigned to roles and to individual users.

## Where permissions live

| Layer | File | Role |
| --- | --- | --- |
| Source of truth | `src/lib/permissions/registry.ts` | Every permission, hand-authored |
| Typed codes | `src/lib/permissions/codes.ts` | **Generated** — never edit |
| Database catalogue | `permissions` table | Projection of the registry |
| Assignment | `role_permissions`, `user_permissions` | What a role / user actually holds |

The database is a *projection*. If the two disagree, the registry wins and
`pnpm perms:sync` reconciles them. The Permission Catalogue screen
(`/admin/permissions`) shows a warning when the counts differ.

## Anatomy of a code

Always three parts: `module.resource.action`

```
masters.company.create        → the "New company" button on the company master
hr.employee.acceptOnboarding  → the Accept step on a rider's onboarding form
sales.lead.viewContact        → whether phone numbers are shown or masked
sales.lead.tabFollowUps       → the Follow-ups tab on a lead
```

## The six kinds

`kind` classifies what the permission guards, and drives grouping in the matrix UI.

| Kind | Guards | Effect when missing |
| --- | --- | --- |
| `PAGE` | A routable screen | Menu entry hidden **and** route redirects to `/forbidden` |
| `TAB` | A tab inside a detail screen | Tab is not rendered |
| `BUTTON` | A visible control | Control is not rendered; the action still re-checks |
| `ACTION` | A non-visual capability | Capability refused server-side |
| `FIELD` | A sensitive column or value | Value is masked (`••••`) or the column is dropped |
| `REPORT` | A report and its export | Report not listed |

## How a permission is resolved

`src/lib/rbac/context.ts`, memoised per request with React `cache`:

1. A super admin short-circuits to "everything".
2. Union of permissions from every **ACTIVE** role the user holds.
3. Plus per-user `ALLOW` overrides.
4. Minus per-user `DENY` overrides.

**DENY always wins.** It is applied last and is absolute — this is how you take
one capability away from someone who otherwise needs the whole role.

On top of permissions sits **scope**: a Team Leader sees the riders of the
companies assigned to them, a tele-caller the riders whose lead they own, a
rider only themselves — unless they hold the module's `viewAll`. The rule is
`employeeScope(ctx)` in `src/lib/hr/list-filters.ts`.

## Enforcing it — three places, every time

```tsx
// 1. The page (server) — redirects to /forbidden when missing
const ctx = await requirePermission(PERM.masters.company.view);

// 2. The control (client) — a courtesy, never the boundary
<Can I={PERM.masters.company.create}>
  <Button>New company</Button>
</Can>

// 3. The server action — the actual security boundary
export async function createCompanyAction(formData: FormData) {
  return runAction(async () => {
    const ctx = await authorize(PERM.masters.company.create);
    ...
  });
}
```

Hiding a button is a courtesy to the user. `authorize()` in the action is what
actually stops anything. **Never rely on step 2 alone.**

For sensitive values use `<Sensitive>` or a column's `visible` flag:

```tsx
<Sensitive I={PERM.sales.lead.viewContact}>{lead.phone}</Sensitive>
```

## Adding a feature — the checklist

1. **Register the permissions** in `src/lib/permissions/registry.ts`. Include a
   `PAGE` for the screen and a `BUTTON` for every control that changes data. Add
   a `FIELD` for anything commercially sensitive.
2. **Regenerate and sync**: `pnpm perms:sync`
3. **Guard the page** with `requirePermission(...)`.
4. **Guard each control** with `<Can I={...}>`.
5. **Guard each server action** with `authorize(...)`.
6. **Add to the default matrix** in `prisma/role-matrix.ts` for the roles that
   should get it by default, then `pnpm perms:grants`.
7. **Add the nav entry** in `src/lib/navigation.ts` with its `permission`.

Skipping step 1 is the only way to get this wrong. The `crud()` helper in the
registry generates the standard `view / create / update / delete / export /
toggleStatus` set so a new resource is one config block.

## Wildcards in the default matrix

The seed's grant rules accept `*` as a whole segment or as a partial:

```ts
"masters.*.view"          // every master's view permission
"sales.lead.*"            // every lead action
"sales.lead.tab*"         // tabTimeline, tabFollowUps, tabNotes…
"*"                       // everything (Admin)
```

`deny` is applied after `grant`, so a role can be given a broad grant and then
have specific capabilities carved out — which is how Admin holds everything
except `admin.mobile.use` (web only, by the SOW) and the two lead duties.

## Current catalogue

`src/lib/permissions/codes.ts` states the count in its header. Browse them at
`/admin/permissions`, or run:

```bash
pnpm perms:sync   # prints created / updated / unchanged counts
```

Codes that disappear from the registry are **reported, never auto-deleted** —
deleting one would silently strip access from a live role.
