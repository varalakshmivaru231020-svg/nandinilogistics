# Pending Modules — Task & Checklist Management

Two of the seven modules in the scope document are **held pending client
verification** and are deliberately not built:

- **Module 02 — Task Management**
- **Module 03 — Checklist Management**

## What exists today

| Layer | Status |
| --- | --- |
| Permission codes | ✅ Registered (21 codes, group "Pending client verification") |
| Role matrix | ✅ Assignable — Owner / Admin holds them today |
| Database tables | ❌ Not modelled |
| Server actions | ❌ Not written |
| Screens | ❌ Not built |
| Navigation entries | ❌ Not shown |

The permissions are registered ahead of the build on purpose. It means roles can
be configured now, and the day the modules are verified the access matrix is
already correct — nobody has to revisit every role.

They appear in the role permission matrix under a dashed card marked
**Pending verification**, so an administrator granting them knows the screens do
not exist yet.

## The registered codes

```
task.task.view / create / update / delete / export
task.task.assign / submit / approve / reopen

checklist.checklist.view / create / update / delete / export
checklist.checklist.execute / verify
checklist.category.view / create / update / delete / export
```

## What the scope document specifies

**Task Management** — tasks raised against a project, block, floor, unit or work
package; status flow `Open → In Progress → Submitted → Approved / Reopened` where
only the reviewer closes a task; mandatory photo evidence on completion; overdue
tasks escalating automatically to PM and Owner after a configured number of days;
offline capture on the mobile app with sync.

**Checklist Management** — structured as `Category → Checklist → Checkpoints`;
response types of Yes/No, Pass/Fail, numeric with tolerance, remark, mandatory
photo; mapped to a project stage, unit type or task so it appears when the work
reaches that point; a failed check raises a snag as a task automatically and the
checklist cannot close until it is cleared; unit-wise handover history retained
with score, photos and sign-off.

## To build them

1. Add the models to `prisma/schema.prisma` (`Task`, `TaskComment`,
   `TaskAttachment`, `ChecklistCategory`, `ChecklistTemplate`, `Checkpoint`,
   `ChecklistInstance`, `CheckpointResponse`).
2. `pnpm db:migrate`
3. Build the screens under `src/app/(app)/tasks/` and
   `src/app/(app)/checklists/`, guarding with the codes already registered.
4. Remove `pending: true` from those two entries in `MODULES`
   (`src/lib/permissions/registry.ts`).
5. Add the navigation entries in `src/lib/navigation.ts`.
6. Extend the role grants in `prisma/seed.ts`.

No permission work is needed — it is already done.
