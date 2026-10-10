# NN Infra ERP — Android app build prompt

A complete, self-contained brief for building the Android client of the NN Infra
ERP. It is written to be handed to a developer or a coding agent with no prior
knowledge of the system.

Everything here is taken from the running web application, not from memory:
19 navigation modules, 74 screens, **183 server actions** and **561 permission
codes**. Where this document names a permission, that is the exact string the
server checks.

---

## 1. What you are building

An Android client that does **everything the web ERP does, except managing
master data**. Same modules, same lists, same filters, same searches, same
dialogs, same actions, same permission rules.

Parity is the requirement. A feature that exists on the web and not on the phone
is a defect, unless it is named in §12 as out of scope.

### The one rule

**Nothing guarded ships without its permission checked.** Every screen, tab,
list, button, sensitive field, approval step and report has a permission code.
The server enforces it; the app must not show a control the viewer does not
hold, because a control that 403s is worse than no control.

### What the app is for

A construction and real-estate ERP: projects, their schedules and tasks;
procurement from indent to payment; sales from lead to registration; the
workforce; and the approvals that bind them. The phone is used on site — by a
supervisor marking attendance, an engineer judging a checklist, a project
manager approving an indent between meetings. Design for one hand, poor light,
and a patchy connection.

---

## 2. Non-negotiables

1. **Permission parity.** Hide what the viewer cannot do. Call the same
   permission codes listed in this document. Never invent a code.
2. **Server is the boundary.** The app's hiding is courtesy. Every mutation goes
   through the server action/endpoint, which re-checks. Handle a 403 by showing
   the server's message, not a generic error.
3. **Project scoping.** A user sees only the projects mapped to them unless they
   hold `project.project.accessAll`. The chosen workspace narrows further. Both
   are applied server-side; the app must send the workspace and never widen it.
4. **Money and quantity formatting.** Indian numbering — lakh and crore. `₹2.29 L`,
   `₹33.61 Cr`. Quantities to 3 decimals where the UOM demands it. Always
   tabular figures.
5. **Dates.** `dd MMM yyyy` for dates, `dd MMM yyyy, HH:mm` for timestamps. The
   server stores UTC; the production server's clock is UTC — render in the
   device's zone but never compute "overdue" on the device. The server sends
   `nowMs`; use it.
6. **No clock during render.** Overdue, due-today and age are computed from the
   server's instant so the phone and the web agree.
7. **Offline.** Read-heavy screens cache. Mutations queue and replay with the
   staleness guard (§9.4). Never silently drop a queued action.

---

## 3. Architecture

| Concern | Choice |
|---|---|
| Language | Kotlin |
| UI | Jetpack Compose, Material 3 with the token overrides in §5 |
| Min SDK | 26 · Target SDK current |
| Architecture | MVVM + unidirectional data flow; one ViewModel per screen |
| DI | Hilt |
| Networking | Retrofit + OkHttp + kotlinx.serialization |
| Local store | Room (cache + outbox) + DataStore (session, workspace, prefs) |
| Images/files | Coil; OkHttp for uploads and downloads |
| Navigation | Navigation-Compose, one route per screen in §7 |
| Background | WorkManager for the outbox, uploads and notification sync |

### 3.1 The server contract

The web app is Next.js 16 with React server actions. **Server actions are not a
usable API for Android.** Before the app is built, the server must expose a REST
or tRPC surface that wraps the same service layer the actions call. The rule for
whoever builds it:

- One endpoint per server action listed in §8, same name, same arguments.
- Each endpoint calls `authorize(PERM...)` with the code given in §8 — the same
  code, not a looser one.
- Each returns the same `ActionResult` shape the web uses:
  `{ ok: true, data }` or `{ ok: false, error: "<human sentence>" }`. The error
  string is written for the user; show it verbatim.
- List endpoints take the same query parameters the web reads from the URL
  (§7 per module) and return `{ rows, total, figures }`.
- `figures` is the module metric band (§6.3), computed server-side by
  `src/lib/metrics/figures.ts` so the phone and the web cannot disagree.

Auth: session cookie today. For the app, issue a bearer token on login with the
same session lifetime and revocation (`/admin/sessions` must be able to kill it).

---

## 4. Session, roles and permissions

### 4.1 Login

`POST /auth/login` with email and password. Response carries the user, their
roles, `isSuperAdmin`, the resolved permission code set, the project ids they are
mapped to, `canAccessAllProjects`, and their approval limits.

Cache the permission set. Re-fetch on resume and after any role change pushed by
a notification. **A super admin bypasses every check** — `has(code)` returns true
for them without consulting the set.

### 4.2 The permission codes

550 codes, shaped `module.resource.action`. By module:

| Module | Codes | Module | Codes |
|---|---|---|---|
| masters | 168 | schedule | 24 |
| material | 88 | task | 24 |
| sales | 74 | unit | 19 |
| project | 44 | hr | 17 |
| admin | 39 | checklist | 12 |
| reports | 26 | dashboard | 7 |
| kb | 7 | calendar | 11 |
| approvals | 1 | | |

Fetch the full list from `/permissions/catalogue` and generate a Kotlin
`Perm` object from it at build time, mirroring the web's generated
`src/lib/permissions/codes.ts`. **Never hardcode a string literal at a call
site** — the web forbids it and so does this.

### 4.3 The eight roles

`OWNER_ADMIN`, `PROJECT_MANAGER`, `PROJECT_ENGINEER`, `SUPERVISOR`,
`STORE_MANAGER`, `SALES_HEAD`, `SALES`, `ADMIN_STAFF`. Roles are data, not code:
never branch on a role name. Branch on a permission code.

### 4.4 Approval limits

A role carries a money ceiling per approval scope. The server refuses an approval
above it with a sentence naming the ceiling. Show that sentence; do not
pre-empt it with your own arithmetic.

---

## 5. Design

The visual design, tokens, components and screen layouts are the companion
canvas. Build against it; it carries the exact hex values, the type ramp, the
spacing scale and the component set.

Summary so this document stands alone:

- **Fonts** — Sora (600/700/800) for display, numbers and titles; Public Sans
  (400/500/600/700) for everything else.
- **Navy** `#191A5C` `#2F308C` · **Cyan** `#0089C9` `#0672A6` `#E3F2FC` ·
  **Page** `#F4F6FB` · **Card** `#FFFFFF` · **Line** `#E3E7F2`
- **Status** — good `#1F9D66`/`#E4F6EC`, warn `#E8A13A`/`#FDF3E7`,
  bad `#D8494A`/`#FCEDED`, plum `#6A46C8`/`#EFE9FC` (second approval level)
- **Radius** — 8 button, 9 control, 13 card, full for pills
- **Spacing** — 4dp scale; 16 screen gutter, 16 card padding, 12 between cards
- **Targets** — 48dp minimum, always
- Status is never carried by hue alone; every tint differs in lightness too.
- Body never below 14sp; captions never below 12sp; every number tabular.

### 5.1 Web pattern → Android pattern

| Web | Android |
|---|---|
| 236px sidebar, 18 modules | Navigation drawer + bottom bar (Home, Approvals, Tasks, More) |
| `ListToolbar` row | Search in the app bar + filter chip row + filter bottom sheet |
| `Modal` | Bottom sheet for input, dialog for confirm-only |
| `Drawer` (right) | Full-screen form or bottom sheet |
| `DetailScreen` | Full screen, collapsing app bar, bottom action bar |
| `SearchSelect` | Full-screen searchable picker |
| Toast | Snackbar, with Undo where the action is reversible |
| Print route | Server-rendered PDF, opened in the system viewer or shared |

---

## 6. Patterns every module repeats

Build these once.

### 6.1 List screen

Top to bottom: app bar with title, count and search/filter icons → **metric
band** → applied filter chips → rows → FAB for create (only with the create
permission).

- Rows are 72–88dp, two lines plus a status pill, ending in a chevron.
- Infinite scroll, page size 30, with the server's `total`.
- Pull to refresh.
- Empty state says which filter to clear, not just "nothing here".
- Long-press for multi-select where the web has bulk actions (Tasks only).

### 6.2 Search and filter

- **Search** opens in the app bar, debounced 300ms, searching exactly the fields
  listed per module in §7. Highlight the matched substring in the row.
- **Filters** live in a bottom sheet: one labelled group per filter, chips inside
  each, a date range where the web has one, "Clear all", and a primary button
  reading **"Show N results"** with the live count.
- Applied filters appear as removable chips under the band.
- Filter and search state is held like the web's URL parameters — one source of
  truth, shared with the export so a download holds what the screen shows.

### 6.3 Metric band

Every module opens with its figures, computed server-side. **The band reads the
whole module, not the filtered page** — a dashboard that moves as you type is not
a dashboard. Figures per module are in §7.

### 6.4 Detail screen

Collapsing app bar with the document number and status pills → summary card →
content cards → **bottom action bar holding only the actions this viewer may
take**. More than two actions go in an overflow menu. Destructive actions
confirm.

### 6.5 Attachments

Camera or file picker. **25 MB limit, enforced in the app before upload** with a
message naming the file and its size. Accepted: PDF, JPEG, PNG, WebP, Word,
Excel, DWG, plain text. Show upload progress; a failed upload stays in the
outbox and is retried.

---

## 7. The modules

Each entry gives the route, the metric band, the search fields, the filters, and
the screens. Actions and their permissions are in §8.

### 7.1 Dashboard — `/dashboard`
Band: approvals waiting on you, tasks overdue. Then one card per module the
viewer may see, each leading on its headline figure and linking into the module.
Permission: `dashboard.*`.

### 7.2 Performance — `/dashboard/performance`
Permission `dashboard.performance.view`. Sixteen module cards plus the
**performance matrix** — per person: tasks, on time, late, still overdue, average
delay, controllable and uncontrollable extensions, score. A viewer without
`task.performance.viewAll` sees only their own row.

### 7.3 Calendar — `/calendar` · `calendar.agenda.view`

One calendar across every module that carries a date. **This is the most
valuable screen on a phone** — it is the thing somebody opens on site to find
out what is on them today — so build it early and build it well.

Band: on this view, waiting on your answer, overdue, tasks due, follow-ups and
visits, approvals dated.

**What it aggregates**, each source queried only when the viewer holds its
permission and inside their project scope:

| Source | From | Shown at |
|---|---|---|
| Calendar task | the calendar's own record | its start, with its span |
| Invitation | a calendar task you have not answered | same, marked for a reply |
| Task | `task.dueAt`, not closed or completed | the due moment |
| Follow-up | `lead.nextActionAt`, lead not booked or lost | the next action |
| Site visit | `siteVisit.scheduledAt`, not yet visited | the slot |
| Approval | indent `requiredByDate`, PO `expectedDate` | that day, all-day |
| Activity | schedule activity span, not completed | every day it runs |

Only approvals with a date of their own appear. The rest of the queue has no
day to sit on — it is simply waiting — so the calendar links to Approvals
rather than piling undated rows onto today.

**Three views.** Month (six-week grid, Monday first, always 42 squares so the
height never changes), week, and a rolling 30-day agenda. Filter chips per
source with counts. A day panel beside the grid.

**The calendar task** is the one thing this module owns:

- A title, a start, an end, optionally all-day, a project and a location.
- **Assigning is an invitation.** Until somebody accepts, it is on nobody: it
  sits on their calendar marked as waiting on their answer and is counted apart
  from their real work. Accepting puts it on their calendar. Declining needs a
  reason, takes it off their calendar, and tells whoever raised it.
- **Mark as completed** — whoever raised it, or anybody who accepted it.
  Somebody who declined cannot.
- **Extend** — the finish moves later, never earlier, never without a reason.
  The first extension keeps the original end and later ones leave it alone, so
  how far it has slipped stays answerable. Show "was due to end …" and "moved N
  times".
- **Cancel** — with a reason; everyone on it is told.
- A finished task offers neither complete nor extend. A cancelled one offers
  nothing.

**Rules that are easy to get wrong**

- The day an item lands on is read from **local** date parts, never from
  `toISOString().slice(0,10)` — the UTC day puts anything after 05:30 IST on
  the wrong square.
- A span belongs on **every** day it crosses, not only its first.
- **Something done is never overdue**, whatever its date. Without that, a task
  marked done last week sits in the overdue count forever.
- Only things that wait on somebody can be overdue — a meeting that has
  finished is not late, it happened.

On Android: month as a pager (swipe between months), the day panel as a bottom
sheet, the task as a sheet with the three actions, and the agenda view as the
default on a phone — it answers "what is next" without pinching a grid.

### 7.3 Approvals — `/approvals`
Permission `approvals.queue.view`. Everything waiting on a decision in one list,
oldest first: indents, purchase orders, vendor invoices, material returns, stock
transfers, schedule extensions, task closures, task extensions, checklist review
and approval levels.
Filter chips by kind with counts. Each row says what it is, its value, who raised
it, how long it has waited and who it waits on. Decide inline where the web does;
checklist levels link to the task instead, because a checklist is settled point
by point.

### 7.4 Projects — `/projects`
Band: projects, ongoing, completed, past target date, schedule progress, units.
Search: name, code, RERA number, city, manager.
Filters: status, type, city, manager.
Detail tabs — **Overview**, **Tasks**, **Team Mapping**, **Documents**,
**Site Progress**.
- Documents: every version visible, latest leading its chain, older versions
  beneath, each downloadable. Upload has no expiry field.
- Team mapping: a searchable people picker; mapping grants project access.

### 7.5 Tasks — `/tasks`
Band: overdue, due today, due this week, waiting on you, high/med/low, your score.
Filters: All, Overdue, Today, This week, by priority, assigned to me, raised by
me, has checklist. Search by title, number, assignee.
Bulk: multi-select → reassign, delete.
**Detail** — status pills, assignee, assigner, due, priority, location; tabs for
Checklist, Review and approval, History; comments with attachments; extension and
hold requests.

#### The checklist lifecycle — read this twice
- A checklist task's points each travel **independently**.
- **Starting the task** puts every point in front of reviewer 1. *There is no
  submit step and no submit button.*
- A point passes a level → it moves to the next level. Reviewers in order, then
  approvers in order.
- A point is **denied by any level** → that point alone starts its next round and
  goes back to **reviewer 1**, then every level again. The other points do not
  move. Verdicts from earlier rounds stay visible, labelled with their round.
- A reviewer and an approver can be working at the same time on different points.
- The task's status is read off its points: under review if any point is with a
  reviewer, else under approval, else approved.
- Only when every point has passed every level does **Mark complete and close**
  appear, for the assignee.
- Judging a point is two buttons — Approve or Deny — with an optional remark and
  optional photos.

### 7.6 Task Reports — `/tasks/reports` · permission `task.report.view`
### 7.7 Checklists — `/checklists` · permission `checklist.checklist.view`
Checklist masters with categories and checkpoints. Create, duplicate, reorder,
activate.

### 7.8 Schedule — `/schedule` · permission `schedule.activity.view`
Three tabs: **Schedule**, **Extension requests**, **Reports**.
Band: activities completed, started on time, completed on time, overdue.
- Main categories hold sub-activities. Progress rolls up.
- Baseline is captured at creation and **never edited** — it is what slippage is
  measured against.
- **Extension**: requested in a dialog (days, reason, the resulting date), decided
  by the PM, then granted by Admin who also records whether the delay was
  genuine or avoidable. A grant moves the planned finish and reschedules
  dependents. The baseline does not move.
- **Admin edit**: name and planned dates, audited with both the old and new dates.
- Reports: schedule vs actual grouped by main category with sub-activities under
  each; and PM performance.

### 7.9 Indents — `/material/indents` · `material.indent.view`
Band: indents, awaiting approval, approved, rejected, value raised, average days
to approve.
Search: indent no., item, project, activity. Filters: project, status, date range.
Flow: draft → submit → PM approval → store stock check → issue from stock, PO for
the shortfall. Rows show the chain as a stepper and the fulfilment split.
Without `material.indent.viewAll` a user sees only indents they raised.

### 7.10 Purchase Orders — `/material/purchase-orders` · `material.purchaseOrder.view`
Band: orders, awaiting approval, open, delivery overdue, received, value ordered.
Search: PO no., vendor, item, indent. Filters: vendor, status, date range.
Two approval levels. Revision supersedes. **Printable PO** carries the letterhead,
vendor contact and GSTIN, the site address and the project manager's contact, and
the contact lines from the Print Contacts master at its foot.
Rates are hidden without `material.purchaseOrder.viewRate`.

### 7.11 Goods Receipt — `/material/grn` · `material.grn.view`
Band: receipts, last 30 days, with rejections, rejected share.
Search: GRN no., PO, vendor, receiver. Filters: vendor, invoice, date range.
Accepted, rejected and short quantities per line; inspection; posting moves stock.
Attachments at creation and after.

### 7.12 Item Master & Stock — `/material/stock` · `material.stock.view`
Band: items, below reorder level, out of stock, stock value.
Search: item name, code, specification. Filters: unit, stock state.
Item detail: balances per store, the ledger, reorder level.
**Stock only ever moves through the posting service** — never write a balance.

### 7.13 Vendors — `/material/vendors` · `material.vendor.view`
Band: vendors, active, with orders placed, average rating, ordered to date.
Search: vendor, contact, mobile, GSTIN. Filters: status, category.
Detail: orders, on-time record, bank and payment terms.

### 7.14 Also in Material
Issues `/material/issues`, Returns `/material/returns`, Transfers
`/material/transfers`, Vendor Invoices `/material/invoices` (three-way match),
Payments `/material/payments`, Reorder `/material/reorder`. Each has the search,
filters and date range listed in its web `ListToolbar` — see the table in §7.18.

### 7.15 Leads · CRM — `/sales/leads` · `sales.lead.view`
Band: leads, new this week, in the pipeline, booked, conversion, pipeline value.
**Board and list views.** The board is one horizontal row of stages — New,
Contacted, Site Visit, Negotiation, Booked, Lost — scrolling sideways, never
wrapping. Drag between stages where the permission allows; Lost needs
`sales.lead.markLost` and a reason.
Lead detail: notes, follow-ups, site visits, cost sheets, unit holds.
Without `sales.lead.viewAll` a user sees only their own pipeline.

### 7.16 Follow-ups, Customers, Flats
- **Follow-ups** `/sales/follow-ups` — band: open, overdue, due today, contacts
  logged, followed up. Grid, list and calendar views.
- **Customers** `/sales/customers` — band: customers, bookings, booked value,
  collected, outstanding. KYC is behind `sales.customer.viewKyc`.
- **Available Flats** `/units/board` — the inventory board by block and floor,
  tinted by status. Tapping a flat opens a panel: available → Hold or Book;
  held → holder, customer, remarks, Release or Confirm. Statuses are
  `AVAILABLE`, `HELD`, `BOOKED`, `AGREEMENT`, `REGISTERED`, `BLOCKED`.
  Band: flats, available, on hold, booked or sold, sold through, unsold area.

### 7.17 Users & Attendance — `/hr` · `hr.employee.view`
Band: on record, active, present today, absent today, not marked today, overtime.
Three tabs: **Employees**, **Mark Attendance**, **Attendance Report**.
- Employee photo and Aadhaar/PAN copies. Identity numbers are masked without
  `hr.employee.viewIdentity`; the photo is not.
- Marking attendance is the single most-used phone screen: a day, a list of
  active employees, Present / Half day / Absent, overtime hours, work done.
  **Build it offline-first** — mark on site, sync later.

### 7.18 Knowledge Base — `/kb` · `kb.article.view`
Articles with categories, attachments, publish/draft.

#### Search and filter reference

| Module | Search fields | Filters |
|---|---|---|
| Projects | name, code, RERA, city, manager | status, type, city, manager |
| Indents | indent no., item, project, activity | project, status, date range |
| Purchase Orders | PO no., vendor, item, indent | vendor, status, date range |
| Goods Receipt | GRN no., PO, vendor, receiver | vendor, invoice, date range |
| Invoices | invoice, vendor, PO | status, project, date range |
| Issues | issue, item, store, purpose | project, status, ack, date range |
| Returns | return, issue, item, raised by | status, project, date range |
| Transfers | transfer, store, item, remarks | status, from store, to store, date range |
| Payments | payment, invoice, vendor, reference | mode, project, date range |
| Stock | item name, code, specification | unit, stock state |
| Reorder | item code or name | category |
| Vendors | vendor, contact, mobile, GSTIN | status, category |
| Bookings | booking no, customer, phone, unit | status, project, date range |
| Receipts | receipt no, reference, booking, customer, unit | mode, status, project, date range |
| Cost sheets | cost sheet no, lead, unit, project | status, project |

---

## 8. Every action and its permission

177 actions. The app calls these and no others. The permission named is the one
the server checks.

### Tasks
`acceptTask` `task.task.accept` · `startTask` `task.task.start` ·
`completeTask` `task.task.complete` · `closeTask` `task.task.close` ·
`sendBackTask` `task.task.sendBack` · `reopenTask` `task.task.reopen` ·
`createTask` `task.task.create` · `updateTask` `task.task.update` ·
`deleteTasks` `task.task.delete` · `reassignTasks` `task.task.reassign` ·
`setPriority` `task.task.update` · `addComment` / `editComment`
`task.task.comment` · `deleteComment` `task.task.reopen` ·
`requestExtension` `task.task.requestExtension` · `decideExtension`
`task.task.approveExtension` · `reviewChecklistItem` →
`task.level.review` when reviewing, `task.level.approve` when approving

### Indents
`createIndent` `material.indent.create` · `updateIndent` `…update` ·
`submitIndent` `…submit` · `approveIndent` → `material.indent.approvePm` or
`material.indent.approveAdmin` by level · `rejectIndent` `…reject` ·
`cancelIndent` `…cancel` · `deleteIndent` `…delete` · `stockCheck` `…stockCheck`

### Purchase orders
`createPurchaseOrder` `material.purchaseOrder.create` · `updatePurchaseOrder`
`…update` · `approvePoPm` / `approvePoAdmin` / `revisePurchaseOrder`
`…revise` · `closePurchaseOrder` `…close` · `cancelPurchaseOrder` `…cancel` ·
`deletePurchaseOrder` `…delete`

### Goods receipt
`createGrn` `material.grn.create` · `updateGrn` `…update` · `inspectGrn`
`…inspect` · `postGrn` `…post` · `cancelGrn` `…cancel` · `deleteGrn` `…delete` ·
`addGrnAttachments` / `deleteGrnAttachment` `…update`

### Other material
`createIssue` `material.issue.create` · `acknowledgeIssue` `…acknowledge` ·
`cancelIssue` `…cancel` · `raiseReturn` `material.return.create` ·
`approveReturn` / `rejectReturn` `material.return.approve` ·
`createTransfer` `material.transfer.create` · `approveTransfer` `…approve` ·
`receiveTransfer` `…receive` · `createVendorInvoice`
`material.vendorInvoice.create` · `approveInvoice` `…approve` ·
`rematchInvoice` `…match` · `cancelInvoice` `…cancel` · `recordPayment`
`material.vendorPayment.create` · `createItem` / `updateItem`
`masters.item.create` / `…update` · `createVendor` / `updateVendor`
`masters.vendor.create` / `…update`

### Schedule
`addMainCategory` `project.workPackage.create` · `addSubActivity`
`schedule.activity.create` · `updateActivity` `schedule.activity.update` ·
`updateActivityProgress` `…updateProgress` · `startActivity` `…start` ·
`completeActivity` `…complete` · `addDependency` / `removeDependency`
`schedule.dependency.manage` · `requestExtension` `schedule.extension.request` ·
`decideExtensionPm` `schedule.extension.approve` · `decideExtensionAdmin`
`schedule.extension.approveAdmin` · `saveScheduleAsTemplate`
`schedule.template.save` · `applyTemplate` `…apply` · `deleteTemplate`
`…delete` · `importActivities` `schedule.activity.import`

### Projects
`createProject` `project.project.create` · `updateProject` `…update` ·
`mapUserToProject` `project.team.assign` · `removeUserFromProject`
`project.team.remove` · `uploadDocument` / `updateDocument`
`project.document.upload` · `deleteDocument` `project.document.delete` ·
`createProgressLog` `project.progressLog.create` · `deleteProgressLog`
`…delete`

### Sales
`createLead` `sales.lead.create` · `updateLead` `…update` · `assignLead`
`…assign` · `changeLeadStage` → `sales.lead.markLost` for Lost, else
`sales.lead.changeStage` · `addLeadNote` `sales.lead.note` · `importLeads`
`sales.lead.import` · `logFollowUp` `sales.followUp.create` ·
`scheduleSiteVisit` `sales.siteVisit.schedule` · `completeSiteVisit`
`…complete` · `cancelSiteVisit` `…cancel` · `createCostSheet`
`sales.costSheet.create` · `approveDiscount` `…approveDiscount` · `holdUnit`
`unit.hold.create` · `releaseHold` `unit.hold.release` · `createBooking`
`sales.booking.create` · `advanceBooking` → `sales.booking.agreement` or
`sales.booking.register` · `cancelBooking` `…cancel` · `createCustomer`
`sales.customer.create` · `verifyKyc` `sales.customer.verifyKyc` ·
`raiseDemand` `sales.demand.raise` · `createReceipt` `sales.receipt.create` ·
`clearReceipt` / `bounceReceipt` `sales.receipt.clear`

### Units
`createUnit` `unit.unit.create` · `updateUnit` `…update` · `deleteUnit`
`…delete` · `changeUnitStatus` `…changeStatus` · `importUnits` `…import` ·
`generateUnits` `unit.unit.create` · `createPriceList`
`unit.priceList.create` · `activatePriceList` `…activate`

### Calendar
`createCalendarTask` `calendar.event.create` (with people: also
`calendar.event.assign`) · `updateCalendarTask` `calendar.event.update` ·
`completeCalendarTask` `calendar.event.complete` · `extendCalendarTask`
`calendar.event.extend` · `cancelCalendarTask` `calendar.event.cancel` ·
`respondToCalendarTask` `calendar.event.respond`

Seeing everyone's calendar rather than only your own is
`calendar.agenda.viewAll`.

### Workforce, knowledge, checklists
`createEmployee` `hr.employee.create` · `updateEmployee` `…update` ·
`deleteEmployee` `…delete` · `setEmployeeStatus` `…update` · `markAttendance`
`hr.attendance.mark` · `createArticle` `kb.article.create` · `updateArticle`
`…update` · `deleteArticle` `…delete` · `toggleArticlePublished`
`kb.article.publish` · `saveChecklist` → `checklist.checklist.create` or
`…update` · `duplicateChecklist` `…create` · `deleteChecklist` `…delete` ·
`addCheckpoint` / `updateCheckpoint` / `deleteCheckpoint` / `moveCheckpoint`
`checklist.checklist.update` · `saveCategory` → `checklist.category.create` or
`…update` · `deleteCategory` `checklist.category.delete`

### Admin (build only if the brief includes it)
Users, roles, permissions, approval limits, sessions and settings under
`admin.*`. Lower priority than the operational modules.

---

## 9. Cross-cutting behaviour

### 9.1 Notifications
In-app notification centre plus FCM push. Nine events: task assigned, accepted,
started, completed; level active; checklist failed; extension requested and
decided; status changed. Tapping opens the record. The badge count is the unread
count from `/notifications`.

### 9.2 Printing
Print routes exist for purchase orders, indents, issues, bookings, cost sheets,
demands, receipts and vendor payments. The server renders them; the app requests
a PDF and hands it to the system viewer or the share sheet. Do not re-implement
the layout.

### 9.3 Exports
Every list with an export permission offers CSV/XLSX. The export takes the same
query the screen is showing, so a download holds exactly those rows.

### 9.4 Optimistic concurrency
Several actions take `expectedUpdatedAt`. If the record changed since the app
read it, the server refuses with a sentence saying so. Send it, and on refusal
re-fetch and show what changed before retrying. This matters most for the
offline outbox: a queued approval must not overwrite a decision made meanwhile.

### 9.5 Offline
- Cache the last list page and every opened detail.
- Queue mutations in a Room outbox with their `expectedUpdatedAt`.
- Replay in order on reconnect through WorkManager.
- Show each queued item with a "pending" mark and let the user cancel it.
- Attendance marking and checklist judging must work fully offline.

### 9.6 Accessibility
TalkBack labels on every icon-only control, 48dp targets, support the system font
scale to 200% without clipping, and never carry meaning by colour alone.

---

## 10. Acceptance criteria

The build is done when, for every module in §7:

1. The list shows the same rows as the web for the same user, filter and search.
2. The metric band matches the web's figures exactly.
3. Every filter in the §7.18 table works, is removable, and survives rotation
   and process death.
4. Search covers exactly the listed fields.
5. Every action in §8 that the viewer holds is reachable, and none that they do
   not hold is drawn.
6. A 403 from the server is shown as the server's sentence.
7. The calendar aggregates every source in §7.3 for the right viewer, and a
   calendar task can be accepted, declined, completed, extended and cancelled.
8. The checklist flow behaves exactly as described — verify by denying a
   point at approval level and watching that point alone return to reviewer 1.
9. The app works offline for attendance and checklist judging, and replays
   cleanly.

---

## 11. Build order

1. Auth, permission catalogue, workspace, navigation shell, design system.
2. Dashboard, Approvals, Notifications.
3. **Calendar** — the screen a phone is opened for.
4. Tasks and Checklists — the largest behavioural surface.
5. Indents, Purchase Orders, Goods Receipt.
6. Schedule.
7. Leads, Follow-ups, Customers, Flats.
8. Users & Attendance (offline-first).
9. Projects, Item Master, Vendors, Knowledge Base.
10. Performance, Reports, Exports, Printing.

---

## 12. Out of scope

- **The Masters module.** No creating, editing, importing or status-toggling of
  master data from the phone. Masters & Users, Reference Data and the 23 registry
  masters stay web-only.
- **But masters must still be readable.** Every picker in the app — item, vendor,
  UOM, store, project type, unit type, city, designation, document type, delay
  reason, charge head, bank, lead source, lost reason, payment term, tax rate —
  reads the master list from the server. Read yes, write no.
- Role and permission administration, unless the brief says otherwise.
