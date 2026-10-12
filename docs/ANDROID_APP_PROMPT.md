# NN Infra ERP — Android app build prompt

A complete, self-contained brief for building the Android client of the NN Infra
ERP. It is written to be handed to a developer or a coding agent with no prior
knowledge of the system.

Everything here is taken from the running web application, not from memory:
19 navigation modules, 75 screens, **183 server actions** and **562 permission
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
usable API for Android**: each is a POST to an opaque id with a React-flavoured
body that changes whenever the component tree does, and a page answers in HTML.
So the app talks to a boundary of its own at **`/api/mobile/v1`**.

**What already exists** (see `src/lib/api/mobile.ts`):

| Endpoint | Method | Returns |
|---|---|---|
| `/api/mobile/v1/auth/login` | POST | `{ token, expiresAt, user }` |
| `/api/mobile/v1/auth/logout` | POST | `{ signedOut: true }` |
| `/api/mobile/v1/me` | GET | `{ user, projects, serverTime }` |
| `/api/mobile/v1/calendar?view=&on=` | GET | `{ view, grid, items, counts, tally, serverTime }` |

**What still has to be built**: one endpoint per server action listed in §8, and
one list endpoint per module in §7. The rules, which the four above already
follow — copy them rather than inventing a second convention:

- `mobileRoute([PERM...], handler)` wraps every endpoint. The codes are the same
  ones the web page passes to `requirePermission()` and the web action passes to
  `authorize()` — the same code, never a looser one. **The boundary carries no
  authority of its own**: nothing is trusted because the app drew it.
- Every endpoint additionally requires `admin.mobile.use`. `mobileRoute` adds it;
  you do not list it.
- Every response is one of exactly two shapes: `{ ok: true, data }` or
  `{ ok: false, error: "<human sentence>", code?, fieldErrors? }`. The error
  string is written for the user — show it verbatim, never a status code.
- List endpoints take the same query parameters the web reads from the URL
  (§7 per module) and return `{ rows, total, figures }`.
- `figures` is the module metric band (§6.3), computed server-side by
  `src/lib/metrics/figures.ts` so the phone and the web cannot disagree.
- Anything dated sends `serverTime`. **The phone's clock is not evidence** —
  overdue is decided against the server's instant, the same way the web passes
  `nowMs` down instead of reading the clock during render.
- The project being viewed goes in an **`X-Project`** header. A project the
  holder cannot reach is ignored, not refused — it is a view filter, never an
  access decision.

**Status codes the app must act on differently:**

| Status | Means | The app does |
|---|---|---|
| 401 | Not signed in, or the session was revoked | Sign in again |
| 403 | Signed in and not allowed | Say why; **never** retry or re-prompt |
| 422 | The body did not validate | Field errors from `fieldErrors` |
| 409 | Someone else decided it first | Re-fetch; see §9.4 |

Confusing 401 with 403 is the trap: a missing permission arriving as "your
session expired" puts the app in a loop of signing a user back in to be refused
the same way.

**Auth.** `POST /auth/login` returns a bearer token; send it as
`Authorization: Bearer <token>`. It is an ordinary session — one row behind the
JWT — so it appears in Administration → Active sessions beside the browsers,
with the `device` string you sent as its user agent, and revoking it there stops
the app on its **next request**, not whenever the token expires. There is an
integration test for exactly that (`tests/integration/mobile-auth.test.ts`).

---

## 4. Session, roles and permissions

### 4.1 Login

`POST /api/mobile/v1/auth/login` with `{ email, password, device }`. `device` is
a name an administrator will recognise in the session list — the handset model
is a good one. The response carries the token, its expiry, and under `user`: the
roles, `isSuperAdmin`, the whole resolved permission code set, the project ids
they are mapped to, `canAccessAllProjects`, `workspaceProjectId` and the
approval limits. One round trip, so the first screen can be drawn without a
second.

Cache the permission set. Re-fetch it from `GET /api/mobile/v1/me` on every cold
start and on resume — that is how a permission taken away this morning reaches a
phone that signed in last night.

**Implement exactly one check, and route every decision through it:**

```kotlin
fun has(code: String) = user.isSuperAdmin || code in user.permissions
```

`isSuperAdmin` short-circuits, and it has to, because the array alone does not
tell you what a super admin may do. It is whatever their roles and overrides
resolve to: the seeded Owner holds the `OWNER_ADMIN` role and arrives with 560
codes, while a super admin created with no role at all arrives with an **empty**
array and may still do everything. Testing membership directly is right for one
of those and catastrophically wrong for the other.

Three refusals, each said differently, and none of them a retry of the password
field:

| Response | Say |
|---|---|
| 401 `credentials` | "Email or password is incorrect." Same answer whether or not the address exists. |
| 403 `inactive` | The account is suspended. Nothing to retry. |
| 403 `admin.mobile.use` | This account may not use the app. **The web still works.** |

### 4.2 The permission codes

562 codes, shaped `module.resource.action`. By module:

| Module | Codes | Module | Codes |
|---|---|---|---|
| masters | 168 | schedule | 24 |
| material | 88 | task | 24 |
| sales | 74 | unit | 19 |
| project | 44 | hr | 17 |
| admin | 40 | checklist | 12 |
| reports | 26 | calendar | 11 |
| dashboard | 7 | kb | 7 |
| approvals | 1 | | |

One of those 40 `admin` codes exists because the phone exists:
**`admin.mobile.use`**. It is not a feature — it is the switch an administrator
throws to stop a role signing in from a device without changing anything they
may do at a desk. Every endpoint requires it on top of its own codes.

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

### 7.4 Approvals — `/approvals`
Permission `approvals.queue.view`. Everything waiting on a decision in one list,
oldest first: indents, purchase orders, vendor invoices, material returns, stock
transfers, schedule extensions, task closures, task extensions, checklist review
and approval levels.
Filter chips by kind with counts. Each row says what it is, its value, who raised
it, how long it has waited and who it waits on. Decide inline where the web does;
checklist levels link to the task instead, because a checklist is settled point
by point.

### 7.5 Projects — `/projects`
Band: projects, ongoing, completed, past target date, schedule progress, units.
Search: name, code, RERA number, city, manager.
Filters: status, type, city, manager.
Detail tabs — **Overview**, **Tasks**, **Team Mapping**, **Documents**,
**Site Progress**.
- Documents: every version visible, latest leading its chain, older versions
  beneath, each downloadable. Upload has no expiry field.
- Team mapping: a searchable people picker; mapping grants project access.

**Site Progress is also its own screen** — `/projects/progress` ·
`project.progressLog.view`. Filters: project, log date. `createProgressLog`
records a day's work against an activity, `deleteProgressLog` removes one;
somebody else's logs need `project.progressLog.viewAll`. There is no metric
band. This is a daily, on-site, one-handed screen — treat it like attendance and
**build it offline-first**.

### 7.6 Tasks — `/tasks`
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

### 7.7 Task Reports — `/tasks/reports` · permission `task.report.view`
### 7.8 Checklists — `/checklists` · permission `checklist.checklist.view`
Checklist masters with categories and checkpoints. Create, duplicate, reorder,
activate.

### 7.9 Schedule — `/schedule` · permission `schedule.activity.view`
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

### 7.10 Indents — `/material/indents` · `material.indent.view`
Band: indents, awaiting approval, approved, rejected, value raised, average days
to approve.
Search: indent no., item, project, activity. Filters: project, status, date range.
Flow: draft → submit → PM approval → store stock check → issue from stock, PO for
the shortfall. Rows show the chain as a stepper and the fulfilment split.
Without `material.indent.viewAll` a user sees only indents they raised.

### 7.11 Purchase Orders — `/material/purchase-orders` · `material.purchaseOrder.view`
Band: orders, awaiting approval, open, delivery overdue, received, value ordered.
Search: PO no., vendor, item, indent. Filters: vendor, status, date range.
Two approval levels. Revision supersedes. **Printable PO** carries the letterhead,
vendor contact and GSTIN, the site address and the project manager's contact, and
the contact lines from the Print Contacts master at its foot.
Rates are hidden without `material.purchaseOrder.viewRate`.

### 7.12 Goods Receipt — `/material/grn` · `material.grn.view`
Band: receipts, last 30 days, with rejections, rejected share.
Search: GRN no., PO, vendor, receiver. Filters: vendor, invoice, date range.
Accepted, rejected and short quantities per line; inspection; posting moves stock.
Attachments at creation and after.

### 7.13 Item Master & Stock — `/material/stock` · `material.stock.view`
Band: items, below reorder level, out of stock, stock value.
Search: item name, code, specification. Filters: unit, stock state.
Item detail: balances per store, the ledger, reorder level.
**Stock only ever moves through the posting service** — never write a balance.

### 7.14 Vendors — `/material/vendors` · `material.vendor.view`
Band: vendors, active, with orders placed, average rating, ordered to date.
Search: vendor, contact, mobile, GSTIN. Filters: status, category.
Detail: orders, on-time record, bank and payment terms.

### 7.15 Also in Material
Issues `/material/issues`, Returns `/material/returns`, Transfers
`/material/transfers`, Vendor Invoices `/material/invoices` (three-way match),
Payments `/material/payments`, Reorder `/material/reorder`. Each has the search,
filters and date range listed in its web `ListToolbar` — see the table in §7.24.

### 7.16 Leads · CRM — `/sales/leads` · `sales.lead.view`
Band: leads, new this week, in the pipeline, booked, conversion, pipeline value.
**Board and list views.** The board is one horizontal row of stages — New,
Contacted, Site Visit, Negotiation, Booked, Lost — scrolling sideways, never
wrapping. Drag between stages where the permission allows; Lost needs
`sales.lead.markLost` and a reason.
Lead detail: notes, follow-ups, site visits, cost sheets, unit holds.
Without `sales.lead.viewAll` a user sees only their own pipeline.

### 7.17 Follow-ups, Customers, Flats
- **Follow-ups** `/sales/follow-ups` — band: open, overdue, due today, contacts
  logged, followed up. Grid, list and calendar views.
- **Customers** `/sales/customers` — band: customers, bookings, booked value,
  collected, outstanding. KYC is behind `sales.customer.viewKyc`.
- **Available Flats** `/units/board` — the inventory board by block and floor,
  tinted by status. Tapping a flat opens a panel: available → Hold or Book;
  held → holder, customer, remarks, Release or Confirm. Statuses are
  `AVAILABLE`, `HELD`, `BOOKED`, `AGREEMENT`, `REGISTERED`, `BLOCKED`.
  Band: flats, available, on hold, booked or sold, sold through, unsold area.

### 7.18 Bookings & Collections — `/sales/bookings` · `sales.booking.view`
The money half of the CRM, and four screens rather than one.

- **Bookings** `/sales/bookings` — one row per sale. Filters: status, project,
  date range. Search: booking no, customer, phone, unit. `createBooking` takes a
  cost sheet and a unit and moves the unit to `BOOKED`; `advanceBooking` moves it
  along to `AGREEMENT` and `REGISTERED`; `cancelBooking` releases the unit again.
  `raiseDemand` raises a payment demand against the booking's schedule.
- **Receipts** `/sales/receipts` · `sales.receipt.view` — collections against a
  booking. Filters: mode, status, project, date range. `createReceipt` records
  one, `clearReceipt` marks a cheque or transfer realised, `bounceReceipt` undoes
  it with a reason. Printable under `sales.receipt.print`.
- **Customers** and their KYC are in §7.17; `verifyKyc` lives there.

No metric band on these two — `figures.ts` has no function for them, and the
app must not invent one. The summary row the web shows is the total booked and
the total received, and that is what the phone shows.

### 7.19 Cost sheets — `/sales/cost-sheets` · `sales.costSheet.view`
Band: quoted, booked, discount pending, expired-not-booked.

The price quoted to a customer, and the one screen where the app must not do
its own arithmetic. `src/lib/sales/cost-sheet.ts` is pure and shared by the
server action *and* the web's client preview, so what an executive sees before
saving is what gets stored. **The phone previews by calling the server**, not by
reimplementing the sheet: a rounding difference here is a different price on a
signed document.

`createCostSheet` resolves the price list by effective date — never by "the
current one". `approveDiscount` (`sales.costSheet.approveDiscount`) is a
separate step, and a sheet waiting on it cannot be booked.

### 7.20 Site visits — `/sales/site-visits` · `sales.siteVisit.view`
Band: scheduled, scheduled and past due, completed. Filters: status, visit date.

`scheduleSiteVisit`, `completeSiteVisit`, `cancelSiteVisit`. Contact details are
behind `sales.lead.viewContact` and someone else's visits behind
`sales.lead.viewAll` — a sales executive sees their own.

A scheduled visit is one of the seven sources on the calendar (§7.3), so the two
screens must agree about what is past due. Both measure against the server's
instant, not the handset's.

### 7.21 Price lists — `/units/price-lists` · `unit.priceList.view`
Rate revisions, each with an effective date. `createPriceList` adds a version;
`activatePriceList` (`unit.priceList.activate`) makes it current **from its
effective date forward** — past bookings keep the rate they were written at.

No band. It is a short list, and the only thing that matters on it is which
version is active and from when.

### 7.22 Users & Attendance — `/hr` · `hr.employee.view`
Band: on record, active, present today, absent today, not marked today, overtime.
Three tabs: **Employees**, **Mark Attendance**, **Attendance Report**.
- Employee photo and Aadhaar/PAN copies. Identity numbers are masked without
  `hr.employee.viewIdentity`; the photo is not.
- Marking attendance is the single most-used phone screen: a day, a list of
  active employees, Present / Half day / Absent, overtime hours, work done.
  **Build it offline-first** — mark on site, sync later.

### 7.23 Knowledge Base — `/kb` · `kb.article.view`
Articles with categories, attachments, publish/draft.

### 7.24 Search and filter reference

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
| Site visits | lead, customer, unit, executive | status, visit date |
| Price lists | version name, project | project, active |
| Progress logs | activity, project, logged by | project, log date |

---

## 8. Every action and its permission

**153 actions in scope**, by name. The app calls these and no others, and the
permission named is the one the server checks. (183 exist in all; 29 belong to
the Masters & Users module, and `runAction` is the wrapper they all go through
rather than an action of its own.)

Names and definitions are not quite the same count: `requestExtension` exists
twice — once for a task's deadline and once for a schedule activity's — and it
appears below under both, with a different permission each time.

Four of the 153 are listed here only to be **excluded**, because the web offers
them from a screen that is otherwise in scope and a builder copying that screen
would otherwise ship master-data creation from a phone — see §12:
`addUom` (from the item form), `addItemCategory` (from the vendor form),
`createEmploymentType` and `deleteEmploymentType` (from the employee form). The
pickers they feed stay **readable**; the "+ New…" beside them is not drawn.

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
`approveReturn` / `rejectReturn` `material.return.approve` · `deleteReturn`
→ `material.return.delete`, **or** `material.return.create` when it is the
raiser's own pending return (the service enforces the raiser rule; the action
authorizes `…view` first only to get a context) ·
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
`…delete` · `importActivities` `schedule.activity.import` ·
`previewActivityImport` `schedule.activity.import`

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
`sales.lead.import` · `previewLeadImport` `sales.lead.import` · `logFollowUp`
`sales.followUp.create` ·
`scheduleSiteVisit` `sales.siteVisit.schedule` · `completeSiteVisit`
`…complete` · `cancelSiteVisit` `…cancel` · `createCostSheet`
`sales.costSheet.create` · `approveDiscount` `…approveDiscount` · `holdUnit`
`unit.hold.create` · `releaseHold` `unit.hold.release` · `blockUnitForLead`
`unit.hold.create` · `releaseUnitForLead` `unit.hold.release` · `createBooking`
`sales.booking.create` · `advanceBooking` → `sales.booking.agreement` or
`sales.booking.register` · `cancelBooking` `…cancel` · `createCustomer`
`sales.customer.create` · `verifyKyc` `sales.customer.verifyKyc` ·
`raiseDemand` `sales.demand.raise` · `createReceipt` `sales.receipt.create` ·
`clearReceipt` / `bounceReceipt` `sales.receipt.clear`

### Units
`createUnit` `unit.unit.create` · `updateUnit` `…update` · `deleteUnit`
`…delete` · `changeUnitStatus` `…changeStatus` · `importUnits` `…import` ·
`generateUnits` `unit.unit.create` · `previewUnitImport` `unit.unit.import` ·
`createPriceList`
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
`checklist.checklist.update` · `setChecklistActive` `checklist.checklist.update` · `saveCategory` → `checklist.category.create` or
`…update` · `deleteCategory` `checklist.category.delete`

### Session, workspace and notifications
Not module actions, and not permission-guarded — they act only on the caller's
own session or their own notifications, so there is no code to check:

`login` · `logout` · `setWorkspace` (the chosen project; it can only ever narrow
to one the holder already reaches) · `markNotificationRead` ·
`markAllNotificationsRead`

### Admin (build only if the brief includes it)
Users, roles, permissions, approval limits, sessions and settings under
`admin.*`. Lower priority than the operational modules.

---

## 9. Cross-cutting behaviour

### 9.1 Notifications
In-app notification centre plus FCM push. Nine events: task assigned, accepted,
started, completed; level active; checklist failed; extension requested and
decided; status changed. A calendar task put on somebody is a tenth, and it is
the one that carries its actions inline — Accept and Decline, because the whole
point of an invitation is that it is answered quickly.

The badge count is the unread count from `/api/mobile/v1/notifications`.

**A notification is a deep link, not a copy of the record.** By the time it is
tapped the permission may be gone, or someone else may have decided it. So the
destination is always re-fetched, and the three answers it can give are all
designed for: the record, "decided by someone else while you were away" (§9.5),
or the refusal screen. Never a crash, and never a decision button on a record
that has already been decided.

### 9.2 The project switcher and your own account
Two screens that belong to no module.

- **`/workspace`** — the project chooser, offered once after signing in and
  reachable from the app bar after that. `setWorkspace` stores the choice. It is
  a **view filter, never an access decision**: it can only ever narrow to a
  project the holder already reaches, and choosing one does not grant anything.
  The app sends it as the `X-Project` header (§3.1); the server ignores a
  project the holder cannot reach rather than refusing the request.
- **`/account`** — needs no permission beyond being signed in, because a person
  may always see their own access. It shows their roles, their department and
  designation, the projects mapped to them, their approval limits, and the
  per-user ALLOW/DENY overrides sitting on top of their roles. It is the screen
  that answers "why can't I do this?", so build it early: it saves the
  explaining that otherwise lands on whoever administers the system.

### 9.3 Printing
Print routes exist for purchase orders, indents, issues, bookings, cost sheets,
demands, receipts and vendor payments. The server renders them; the app requests
a PDF and hands it to the system viewer or the share sheet. Do not re-implement
the layout.

### 9.4 Exports
Every list with an export permission offers CSV/XLSX. The export takes the same
query the screen is showing, so a download holds exactly those rows.

### 9.5 Optimistic concurrency
Several actions take `expectedUpdatedAt`. If the record changed since the app
read it, the server refuses with a sentence saying so. Send it, and on refusal
re-fetch and show what changed before retrying. This matters most for the
offline outbox: a queued approval must not overwrite a decision made meanwhile.

### 9.6 Offline
- Cache the last list page and every opened detail.
- Queue mutations in a Room outbox with their `expectedUpdatedAt`.
- Replay in order on reconnect through WorkManager.
- Show each queued item with a "pending" mark and let the user cancel it.
- Attendance marking and checklist judging must work fully offline.

### 9.7 Accessibility
TalkBack labels on every icon-only control, 48dp targets, support the system font
scale to 200% without clipping, and never carry meaning by colour alone.

---

## 10. Acceptance criteria

The build is done when, for every module in §7:

1. The list shows the same rows as the web for the same user, filter and search.
2. The metric band matches the web's figures exactly.
3. Every filter in the §7.24 table works, is removable, and survives rotation
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

And of the transport, before any module is trusted:

10. Revoking the device under Administration → Active sessions signs the app
    out on its **next request** — not when the token expires.
11. A 403 never triggers a re-authentication. Deny `admin.mobile.use` on a test
    user and confirm the app says why once and stops, rather than looping on the
    password field.
12. A permission removed while the app is backgrounded is gone from the UI after
    resume, because `/me` was re-read — not after the next cold start.
13. Nothing anywhere tests `code in permissions` directly — every call goes
    through `has()`. Verify with a super admin who holds no role: their array is
    empty and the whole application must still be there.

---

## 11. Build order

1. Auth — sign-in, the three refusals, token storage, `/me` on resume — the
   permission catalogue, workspace, navigation shell and design system. Finish
   acceptance criteria 10–13 here. Every later module rests on them, and each
   one is cheap now and expensive to retrofit.
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
