# Web → mobile parity

**Generated — do not hand-edit.** `pnpm parity:matrix` writes this file from
the registries that decide the behaviour: `src/lib/screens/registry.ts`,
`src/lib/records/registry.ts`, `src/lib/forms/registry.ts`, the generated
`src/lib/api/mobile-actions.ts` and the exemptions in
`src/lib/api/parity.ts`. `tests/unit/mobile-parity.test.ts` fails if an
action is unreachable from the app and unexplained.

Last written 2026-10-26.

## In one line

| | |
|---|---|
| Web actions on the boundary | **60** |
| Reachable from the app | **32** |
| Not reachable, with a reason | 28 |
| Web list screens | 13 |
| …with a record screen | 12 |
| …with a create form | 4 |
| …with an edit form | 3 |

## The modules

Every list the web has, against the phone. A module is ✅ when its rows open a
record **and** something can be made or changed from it — which includes the
documents raised from another record, since that is where the web raises them
too. **n/a** is a report or a queue, where a record of its own would be wrong.
The last column says where each one is raised.

| Web module | Web route | Record | Create | Edit | | Where it is raised |
|---|---|---|---|---|---|---|
| `sales/leads` | `/sales/leads` | ✅ | `create` | ✅ | ✅ | its own list |
| `sales/follow-ups` | `/sales/follow-ups` | ✅ | — | — | ✅ | the lead — “Log follow-up” |
| `hr/employees` | `/hr` | ✅ | `create` | ✅ | ✅ | its own list |
| `hr/attendance` | `/hr` | ✅ | `mark` | — | ✅ | its own list |
| `tasks` | `/tasks` | ✅ | `create` | ✅ | ✅ | its own list |
| `hr/onboarding` | `/hr/onboarding` | ✅ | — | — | ⚠️ | its own list |
| `hr/referrals` | `/hr/referrals` | ✅ | — | — | ⚠️ | its own list |
| `payouts` | `/payouts` | ✅ | — | — | ⚠️ | its own list |
| `payouts/imports` | `/payouts/imports` | ❌ | — | — | ❌ | its own list |
| `advances` | `/advances` | ✅ | — | — | ⚠️ | its own list |
| `advances/bike-rent` | `/advances/bike-rent` | ✅ | — | — | ⚠️ | its own list |
| `accounts/invoices` | `/accounts/invoices` | ✅ | — | — | ⚠️ | its own list |
| `staff/payslips` | `/staff/payslips` | ✅ | — | — | ⚠️ | its own list |

## The actions the phone cannot reach

### brief:web-only — 22

- `hr/createEmploymentType` — The employment-type master.
- `hr/deleteEmploymentType` — The employment-type master.
- `accounts/invoices/createInvoice` — Admin work on the web admin panel.
- `accounts/invoices/updateInvoice` — Admin work on the web admin panel.
- `companies/addCompanyLocation` — Admin work on the web admin panel.
- `companies/setCompanyOfferTemplates` — Admin work on the web admin panel.
- `companies/setCompanyTeamLeaders` — Admin work on the web admin panel.
- `companies/setPayoutColumnMap` — Admin work on the web admin panel.
- `companies/toggleCompanyLocation` — Admin work on the web admin panel.
- `companies/updateCompanyLocation` — Admin work on the web admin panel.
- `companies/uploadRateCard` — Admin work on the web admin panel.
- `payouts/correctPayoutLine` — Admin work on the web admin panel.
- `payouts/createPayoutImport` — Admin work on the web admin panel.
- `payouts/deletePayoutImport` — Admin work on the web admin panel.
- `payouts/postPayoutImport` — Admin work on the web admin panel.
- `payouts/previewPayoutImport` — Admin work on the web admin panel.
- `staff/payslips/payslipDraft` — Admin work on the web admin panel.
- `staff/payslips/generatePayslip` — Admin work on the web admin panel.
- `advances/createBikeRent` — Admin work on the web admin panel.
- `advances/updateBikeRent` — Admin work on the web admin panel.
- `advances/endBikeRent` — Admin work on the web admin panel.
- `advances/deleteBikeRent` — Admin work on the web admin panel.

### todo — 6

- `advances/createAdvance` — The Android client is rebuilt after the admin panel.
- `advances/decideAdvance` — The Android client is rebuilt after the admin panel.
- `advances/deleteAdvance` — The Android client is rebuilt after the admin panel.
- `payouts/holdPayoutLine` — The Android client is rebuilt after the admin panel.
- `payouts/releasePayoutLine` — The Android client is rebuilt after the admin panel.
- `hr/startOnboardingFromLead` — The Android client is rebuilt after the admin panel.

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
