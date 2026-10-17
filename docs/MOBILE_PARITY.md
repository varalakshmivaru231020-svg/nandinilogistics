# Web → mobile parity

**Generated — do not hand-edit.** `pnpm parity:matrix` writes this file from
the registries that decide the behaviour: `src/lib/screens/registry.ts`,
`src/lib/records/registry.ts`, `src/lib/forms/registry.ts`, the generated
`src/lib/api/mobile-actions.ts` and the exemptions in
`src/lib/api/parity.ts`. `tests/unit/mobile-parity.test.ts` fails if an
action is unreachable from the app and unexplained.

Last written 2026-10-17.

## In one line

| | |
|---|---|
| Web actions on the boundary | **154** |
| Reachable from the app | **134** |
| Not reachable, with a reason | 20 |
| Web list screens | 30 |
| …with a record screen | 28 |
| …with a create form | 17 |
| …with an edit form | 11 |

## The modules

Every list the web has, against the phone. A module is ✅ when its rows open a
record **and** something can be made or changed from it — which includes the
documents raised from another record, since that is where the web raises them
too. **n/a** is a report or a queue, where a record of its own would be wrong.
The last column says where each one is raised.

| Web module | Web route | Record | Create | Edit | | Where it is raised |
|---|---|---|---|---|---|---|
| `projects/projects` | `/projects` | ✅ | `uploadDocument`, `editDocument`, `create` | ✅ | ✅ | its own list |
| `projects/progress` | `/projects/progress` | ✅ | `create` | — | ✅ | its own list |
| `material/indents` | `/material/indents` | ✅ | `create` | ✅ | ✅ | its own list |
| `material/purchase-orders` | `/material/purchase-orders` | ✅ | — | ✅ | ✅ | the indent — “Raise purchase order” |
| `material/grn` | `/material/grn` | ✅ | `create`, `attach` | ✅ | ✅ | the purchase order — “Receive goods” |
| `material/stock` | `/material/stock` | ✅ | `create` | — | ✅ | the item master, which is web-only |
| `material/vendors` | `/material/vendors` | ✅ | `create` | ✅ | ✅ | its own list |
| `material/issues` | `/material/issues` | ✅ | — | — | ✅ | the indent — “Issue from stock” |
| `material/returns` | `/material/returns` | ✅ | — | — | ✅ | the issue slip — “Raise return” |
| `material/transfers` | `/material/transfers` | ✅ | `create` | — | ✅ | its own list |
| `material/invoices` | `/material/invoices` | ✅ | — | — | ✅ | the purchase order — “Record vendor invoice” |
| `material/payments` | `/material/payments` | ✅ | — | — | ✅ | the invoice — “Record payment” |
| `material/reorder` | `/material/reorder` | ✅ | — | — | n/a | a report over the item master; a row opens the item |
| `sales/leads` | `/sales/leads` | ✅ | `create` | ✅ | ✅ | its own list |
| `sales/follow-ups` | `/sales/follow-ups` | ✅ | — | — | ✅ | the lead — “Log follow-up” |
| `sales/site-visits` | `/sales/site-visits` | ✅ | — | — | ✅ | the lead — “Schedule a site visit” |
| `sales/customers` | `/sales/customers` | ✅ | `create` | — | ✅ | its own list |
| `sales/bookings` | `/sales/bookings` | ✅ | — | — | ✅ | the cost sheet — “Confirm booking” |
| `sales/receipts` | `/sales/receipts` | ✅ | — | — | ✅ | the booking's milestone — “Collect” |
| `sales/cost-sheets` | `/sales/cost-sheets` | ✅ | — | — | ✅ | the flat — “Generate a cost sheet” |
| `units` | `/units/board` | ✅ | `create`, `generate` | ✅ | ✅ | its own list |
| `units/price-lists` | `/units/price-lists` | ✅ | `create` | — | ✅ | its own list |
| `hr/employees` | `/hr` | ✅ | `create` | ✅ | ✅ | its own list |
| `hr/attendance` | `/hr` | ✅ | `mark` | — | ✅ | its own list |
| `tasks` | `/tasks` | ✅ | `create` | ✅ | ✅ | its own list |
| `tasks/reports` | `/tasks/reports` | ❌ | — | — | n/a | a report over tasks — there is nothing behind a row |
| `checklists` | `/checklists` | ✅ | `create` | — | ✅ | its own list |
| `schedule/activities` | `/schedule` | ✅ | `addCategory`, `addActivity` | ✅ | ✅ | its own list |
| `kb` | `/kb` | ✅ | `create` | ✅ | ✅ | its own list |
| `approvals` | `/approvals` | ❌ | — | — | n/a | a queue — each row opens the document it is about |

## The actions the phone cannot reach

### brief:web-only — 7

- `material/stock/updateItem` — The item master.
- `material/stock/addUom` — The UOM master.
- `material/vendors/addItemCategory` — The item-category master.
- `hr/createEmploymentType` — The employment-type master.
- `hr/deleteEmploymentType` — The employment-type master.
- `checklists/saveCategory` — The checklist-category master.
- `checklists/deleteCategory` — The checklist-category master.

### no-file-transfer — 6

- `sales/leads/importLeads` — A portal export is a .csv or .xlsx — picked, mapped and previewed at a desk.
- `sales/leads/previewLeadImport` — The dry run of that import, whose mapping screen is the desk's.
- `units/importUnits` — A unit sheet, mapped column by column before it is accepted.
- `units/previewUnitImport` — The dry run of that import.
- `schedule/importActivities` — A programme sheet, with its own mapping and dependency screen.
- `schedule/previewActivityImport` — The dry run of that import.

### no-web-ui — 6

- `material/grn/inspectGrn` — No web screen calls it; a receipt is inspected as it is created.
- `schedule/addDependency` — No web screen links two activities; links come in with the import.
- `schedule/removeDependency` — The same — the phone draws the links read-only.
- `schedule/applyTemplate` — No web screen applies a schedule template.
- `schedule/saveScheduleAsTemplate` — No web screen saves one.
- `schedule/deleteTemplate` — No web screen deletes one.

### equivalent — 1

- `workspace/setWorkspace` — The app sends the chosen project as the `x-project` header instead of a cookie; the chooser is in its shell.

## Every screen's states

| State | Where it comes from |
|---|---|
| Loading | a spinner on the list, the record, the form and the notifications |
| Empty | the list's own `emptyMessage` from the server, in the web's words |
| Error | the server's sentence verbatim, with its code — "Refused by …" — and a retry, except on a refusal, which no retry can fix |
| Success | the action's `done` line, as a snackbar, naming what happened |
| Refresh | pull-to-refresh on the notifications, a Reload control on the bar elsewhere |
| Nothing chosen | a module needing a project says `project-required` and the screen offers the chooser |

## What is deliberately not mirrored

- **Sorting.** The web has none: its `DataTable` renders the order the query
  returns and no column is sortable. There is nothing to mirror.
- **Bulk selection.** Three task actions are bulk controls on the web's list,
  which takes the selected rows. The phone offers each for the task in front of
  it; selecting several rows would be a design addition, and the artboards have
  no selection state.
- **Exports.** Reading a list on the phone deliberately does not require the
  `.export` permission and does not produce a file; a CSV on a handset is not
  a thing anybody asked for. The permission still gates the web's own menu.
- **Printing.** `/print/*` is a browser view. Nothing on the phone opens one.

## Where the web itself is asymmetric

Found while auditing, and worth a decision rather than a silent choice:

- `updateTaskAction` and `updateCalendarTaskAction` exist and are enforced
  by rules the lifecycle models — the Assigner may correct a task until work
  starts — and **no web screen calls either**. The phone offers both.
- Five schedule actions have no web screen at all: applying, saving and
  deleting a template, and adding or removing a dependency. The phone draws an
  activity's links read-only and offers none of the five.
- The web's PO form carries other charges, a line discount, a specification and
  a line's GST and draws none of them. The phone carries all four hidden so an
  edit cannot clear them.
