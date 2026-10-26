# Rider CRM scope mapping — the existing ERP against the SOW

Checked on 26 October 2026 against
`Supreme_One_SOW_Nandini_Logistics_Rider_CRM.pdf` (Supreme One Software,
22 October 2026, ref SOS/SOW/2026/RCRM-01).

The codebase is **NN Infra ERP** — a construction and real-estate ERP with a
property-sales CRM. The SOW asks for a **rider CRM, onboarding and payout
platform** for a delivery-logistics company. The two share a platform (auth,
RBAC, masters engine, audit, exports, mobile boundary, tasks, attendance) but
almost none of the business modules. This file is the audit the brief asked
for: every SOW item mapped to what exists, categorised **Keep / Modify /
Remove / Build New**, with the assumptions and gaps that need a decision
before implementation starts.

Method: read of `prisma/schema.prisma` (92 models, 38 migrations),
`src/lib/permissions/registry.ts`, `src/lib/navigation.ts`,
`src/lib/masters/registry.ts`, the screen/record/form registries behind
`/api/mobile/v1`, the Flutter client under `mobile/`, and every
`src/app/(app)/*` route group.

---

## 1. Summary

| Category | Count | What it means |
| --- | --- | --- |
| **Keep** | 9 platform pieces | Reused as-is: auth/sessions, RBAC + permission registry, masters engine, audit, exports, mobile boundary + Flutter shell, notifications, settings, storage |
| **Modify** | 7 modules | Leads/CRM, Companies, Users & roles, Employees → Riders, Attendance, Tasks, Dashboard/Reports |
| **Remove** | 11 modules | Projects, Schedule, Checklists, Material/Procurement (whole chain), Units & price lists, Bookings/Cost sheets/Receipts/Demands, Site visits, Customers, Calendar, Knowledge Base, Approval limits |
| **Build New** | 9 modules | Rider onboarding & KYC, Rider ID + ID card, Offer letters, Payout import & computation, Advances, Bike rent, Referrals, Vendor invoices (logistics), Internal staff payslips, WhatsApp integration, PIN/OTP login, GPS punch |

Rough size: of ~44,000 lines under `src/app/(app)` and `src/lib`, about
**26,000 lines belong to modules that go** (material 15.3k, sales-booking
chain ~5k, units 3.9k, schedule 3.6k, projects 2.5k, calendar 1.9k,
checklists 0.9k, kb 0.7k). What stays and gets modified is roughly 10,000
lines; the new modules are comparable in size to what is removed.

---

## 2. Platform — Keep

| Piece | Where | Note |
| --- | --- | --- |
| Session auth (JWT cookie + revocable server session, bearer for mobile) | `src/lib/auth/` | Keep. Login identity changes (see Modify §3.3) but the session machinery does not |
| RBAC: roles, permissions, user overrides, `requirePermission` / `authorize` / `<Can>` | `src/lib/rbac/`, `src/lib/permissions/` | Keep. SOW §2 "roles & permissions maintained by Admin from Masters" is exactly this |
| Permission registry + `pnpm perms:sync` codegen | `src/lib/permissions/registry.ts` | Keep the mechanism; the contents change module by module |
| Masters engine (config-driven list/form/validation/audit/export) | `src/lib/masters/` | Keep. New masters (lead stages, advance reasons, offer-letter templates, Rider ID prefix) are blocks in this registry, not new screens |
| Audit log + `runAction()` + `recordAudit()` | `src/lib/audit.ts` | Keep |
| Export routes (`format=xlsx` / `json`) + report framework | `src/lib/exports/`, `src/lib/reports/` | Keep framework; replace the 13 report definitions |
| Mobile boundary (`/api/mobile/v1` screen / record / form / do) + Flutter shell | `src/lib/screens`, `records`, `forms`, `mobile/` | Keep. The app renders what the server sends, so new modules appear by registering them server-side. Login screen changes (PIN) |
| Notifications (in-app) | `Notification` model, `/notifications` | Keep; extend with new kinds. **Push is not built** (see gaps) |
| Document storage + upload rules | `src/lib/storage.ts` | Keep for KYC photos, rate cards, offer letters, task attachments |
| App settings + numbering series | `src/lib/settings.ts`, `src/lib/numbering.ts` | Keep; add Rider ID series and payout-formula setting |
| Administration: users, roles, permission matrix, sessions, audit viewer | `src/app/(app)/admin/*` | Keep (approval-limits page removed, see §4) |

---

## 3. Modify — exists but differs from the SOW

### 3.1 Lead management (SOW §3.1) — `sales/leads`, `sales/follow-ups`

| SOW requirement | Exists today | Change |
| --- | --- | --- |
| Configurable stages (add / rename / reorder / disable from Masters) | `LeadState` is a fixed Prisma enum (NEW … BOOKED, LOST) | **Replace enum with a `LeadStage` master** (name, order, active, `kind` = NEW / ONBOARDING / LOST so the system knows which stage triggers onboarding and which is terminal). Migrate existing rows |
| Lead fields: name, mobile, company (multi), location | Name, phone, source, project, budget, unit type, custom fields (`LeadFormField`) | Drop project / budget / unit type / source-as-mandatory; add `location`, many-to-many `LeadCompany`. Keep the custom-field engine |
| Admin / TL / Tele-caller / Rider can all create | Any user with `sales.lead.create` | Keep; add Rider role grant and the rider-app "Create lead" form (name, mobile, location only) |
| Admin / TL create → assignment mandatory | Assignment mode is a setting (MANUAL / ROUND_ROBIN / PROJECT) | Keep `pickAssignee()`; enforce "assignee required" in the Admin/TL form, round-robin for rider-created leads. Remove PROJECT mode |
| Round-robin to tele-callers | `usersHolding(PERM.sales.lead.receiveAssignment)` | Keep as-is — the Tele-caller role gets `receiveAssignment` |
| Duplicate check on mobile | Built (`duplicateOfId`, phone index) | Keep |
| Follow-up log: date, stage, remarks, next date | `LeadFollowUp` (channel, notes, outcome, nextActionAt) | Add `stageId` snapshot on the follow-up; keep the rest |
| Tele-caller dashboard: today / overdue / by stage | Sales dashboard + follow-ups screen with Due filter | Re-label and re-scope to tele-caller; the data is there |
| Re-assignment by Admin / TL | `assignLeadAction` + assign modal | Keep; grant to TL |
| Filters: stage, company, location, tele-caller, date; Excel export | Stage, owner, source, project filters; export route exists | Swap project/source filters for company/location |
| Click-to-call from the app | `tel:` handling in the Flutter row renderer | Keep |
| Daily tele-caller summary (calls, stage moves, onboardings) | `leadPerformance` report | Rewrite as a tele-caller daily summary report |

Remove from the lead module: unit holds (`blockUnitForLeadAction`,
`releaseUnitForLeadAction`), site visits, cost sheets, bookings tabs, budget
and unit-type fields, project filter, escalation-by-project.

### 3.2 Company master (SOW §3.3) — `masters/companies`

| SOW requirement | Exists today | Change |
| --- | --- | --- |
| Name, status | `Company` (code, name, legalName, GSTIN, PAN, CIN, address, logo) | Keep core; drop CIN/website/logo or leave optional |
| Multiple hubs / locations per company with Google Maps location | Single address line | **Add `CompanyLocation`** (name, address, lat/lng, maps URL) |
| Rate card photo | — | Add `rateCardKey` upload, visible to Admin and assigned TLs |
| Assign TL(s) | — | Add `CompanyTeamLeader` join |
| Offer letter template mapping (internal / vendor) | — | Add two FK fields to the new `OfferLetterTemplate` master |
| Payout Excel column mapping | — | Add `payoutColumnMap` JSON on the company (see §5.4) |
| Seed: Peeko, Slikk, Purple, First Club, Internal Staff | Seed has NNID / NN Skyline | Replace seed |

### 3.3 Users, roles and login (SOW §2, §3.5, §3.6 item 2)

| SOW requirement | Exists today | Change |
| --- | --- | --- |
| Four roles: Admin, Tele-caller, Team Leader, Rider | Eight construction roles in `prisma/role-matrix.ts` | **Replace the role matrix** with ADMIN, TELE_CALLER, TEAM_LEADER, RIDER. Keep `isSuperAdmin` owner account |
| Admin web-only; others web + Android | `admin.mobile.use` gate already exists | Grant `admin.mobile.use` to TL / Tele-caller / Rider only |
| Rider login = mobile + 4-digit PIN; forgot PIN via OTP | Email + bcrypt password, web and mobile | **Add `phone` as login identity and `pinHash`** on `User`; PIN login path on web + `/api/mobile/v1/auth/login`. OTP needs an SMS/WhatsApp sender — see gaps |
| TL management: create/edit, Active/Left, company assignment | `/admin/users` with ACTIVE / INACTIVE / SUSPENDED | Keep users screen; add `leftOn` date, company assignment for TL role. Relabel INACTIVE as "Left" for riders/TLs |
| Tele-caller management (User 1, 2, 3) | Same users screen | Keep |
| Inactive riders/TLs hidden from TL and Rider views | `status` filter exists; no row-scoping by role | Add a row-level scope: non-admin queries exclude INACTIVE |

### 3.4 Riders / Biker management (SOW §3.2 record, §3.5 Biker Management) — `hr`

| SOW requirement | Exists today | Change |
| --- | --- | --- |
| Rider record with KYC | `Employee` (code, name, mobile, altContact, Aadhaar, PAN, address, photo, employment type, designation) + `EmployeeDocument` (Aadhaar, PAN slots) | **Extend `Employee` into the Rider record** rather than a new model: add two emergency mobiles, bank details (account no, holder, IFSC, bank), passbook photo slot, PF number, DL slot, Aadhaar front/back slots, insurance number, `userId` link (riders log in), `onboardingStatus`, `joiningDate`, `leftOn` |
| Rider ID auto `NL001` with configurable prefix | `employeeCode` is hand-entered; `NumberingSeries` master exists | Add a `RIDER` numbering series; prefix is already editable in the Numbering Series master |
| Multiple companies per rider | — | Add `RiderCompany` join |
| Full profile with PIN visible to Admin | — | Admin "reset PIN" rather than showing the PIN (hash is one-way). **Assumption** flagged in §6 |
| Active / Left | ACTIVE / INACTIVE | Relabel; add `leftOn` |
| Rider self-profile and "request edit, approved by Admin" | — | Build (small): `ProfileEditRequest` with approve/reject |

### 3.5 Attendance (SOW §3.6 item 7, §3.7 items 2 & 4, §3.8 Internal Staff)

| SOW requirement | Exists today | Change |
| --- | --- | --- |
| Punch in / out with timestamp + GPS | `AttendanceEntry` is one row per day with PRESENT / ABSENT / HALF_DAY marked by a manager | **Add `punchInAt`, `punchOutAt`, lat/lng pairs** to `AttendanceEntry`; rider "Punch in / Punch out" record action. Keep daily status for internal staff (Admin marks manually — this is the existing sheet) |
| TL marks/corrects on behalf of a rider with remarks | `markAttendanceAction` + notes | Keep; scope TL to own team |
| Monthly report, team day/month view | Attendance report + export exist | Keep; add team scope |
| TL self punch | — | Same punch action, TL is also an `Employee` |

### 3.6 Task management (SOW §3.9) — `tasks`

| SOW requirement | Exists today | Change |
| --- | --- | --- |
| Admin assigns to one or more TLs: title, description, priority, due date, attachment | `Task` has all of these plus kind (STANDALONE / CHECKLIST), levels, extensions, rework rounds, 10-state lifecycle | **Simplify**: hide checklist tasks, review/approval levels, extensions and the performance screen. Collapse statuses to Open / In Progress / Done. Allow multi-assignee (today one `assigneeId`) — either one task per TL at create, or a `TaskAssignee` join |
| TL updates status with remarks | Comments + status actions | Keep |
| Admin dashboard: open / overdue / completed per TL | `tasks/reports` + `overdue-sweep` | Trim to the three counts |
| Push on assignment and due date | In-app notification on assign exists; due-date sweep exists | Keep in-app; push is a gap (§6) |

### 3.7 Dashboard and reports (SOW §3.5 Dashboard, Reports; §3.7 TL report)

| SOW requirement | Exists today | Change |
| --- | --- | --- |
| Admin dashboard: leads by stage, active riders by company, pending onboarding, pending advances, payout status | Five role dashboards (owner, PM, supervisor, store, sales) | Replace with Admin / TL / Tele-caller / Rider dashboards built on the same tile components |
| Reports: TL report, rider by company, lead conversion, payout summary, advance outstanding; Excel export | 13 construction/sales reports on a generic report framework | Delete the 13; define the 5 (plus tele-caller daily summary) in `src/lib/reports/index.ts` |

---

## 4. Remove — not in the SOW

Each of these is a complete module with its own tables, permissions, screens,
mobile registry entries, export routes, print layouts and tests. Removing a
module means all of those together, plus a migration that drops its tables.

| Module | Tables | Routes / code | Blocks anything in scope? |
| --- | --- | --- | --- |
| Projects (phases, work packages, blocks, documents, progress log, amenities) | `Project`, `ProjectPhase`, `WorkPackage`, `Block`, `ProjectAmenity`, `ProjectDocument`, `SiteProgressLog`, `UserProject` | `/projects/*`, `/workspace`, `src/lib/projects` | **Yes, widely referenced**: `Lead.projectId`, `Task.projectId`, `AttendanceEntry.projectId`, `Store.projectId`, `UserProject` scoping in `rbac/`, lead assignment PROJECT mode. Each FK must be dropped first |
| Schedule (activities, templates, extensions, dependencies) | `ScheduleActivity`, `ScheduleTemplate`, `ScheduleExtension`, `ScheduleDependency`, `DelayReason` | `/schedule/*`, `src/lib/schedule` | No |
| Checklists library and checklist tasks | `ChecklistCategory`, `Checklist`, `ChecklistCheckpoint`, `ChecklistRun`, `TaskChecklist*`, `TaskLevel*` | `/checklists/*`, parts of `/tasks` | Coupled to tasks (§3.6) |
| Material / procurement (indents, POs, GRN, issues, returns, transfers, stock, vendor invoices, vendor payments, reorder) | `Indent*`, `PurchaseOrder*`, `Grn*`, `MaterialIssue*`, `MaterialReturn*`, `StockTransfer*`, `StockBalance`, `StockLedger`, `VendorInvoice*`, `VendorPayment`, `Item`, `ItemCategory`, `Uom`, `TaxRate`, `Store`, `PaymentTerm`, `VendorCategory` | `/material/*`, `src/lib/material`, `src/lib/inventory.ts`, print layouts | No. **Note**: SOW §3.5 "Accounts — Vendor Invoices" is a different thing (invoices *raised to* client companies), so the existing vendor-invoice module is not reusable beyond its status-tracking shape |
| Vendors master | `Vendor` | `/material/vendors` | No |
| Units, blocks, price lists, availability board, holds | `Unit`, `UnitHold`, `UnitType`, `PriceList`, `PriceListItem`, `Amenity`, `ChargeHead` | `/units/*`, `src/lib/units` | `Lead.unitTypeId`, `Lead.holds` |
| Sales booking chain | `Customer`, `CostSheet*`, `Booking`, `PaymentDemand`, `Receipt`, `Bank` | `/sales/customers`, `cost-sheets`, `bookings`, `receipts`, print layouts | `Lead.bookings`, `Lead.costSheets` |
| Site visits | `SiteVisit` | `/sales/site-visits` | `Lead.siteVisits` |
| Calendar | `CalendarEvent`, `CalendarAttendee` | `/calendar`, mobile calendar module | No |
| Knowledge base | `KbArticle`, `KbAttachment` | `/kb` | No |
| Approvals queue + approval limits | `ApprovalLimit`, `IndentApproval` | `/approvals`, `/admin/approval-limits` | Advance approval (SOW) is a simpler single-step TL/Admin decision; the existing multi-level limit engine is not needed. **Could be kept** if the client later wants amount-based routing — recommended remove |
| Construction masters | project-types, unit-types, amenities, document-types (scope), delay-reasons, uoms, item-categories, items, tax-rates, vendors, payment-terms, stores, charge-heads, print-contacts, banks, lost-reasons | `src/lib/masters/registry.ts` blocks | Lost-reasons could be kept as "Lost" stage reason — recommended keep |
| Lead import from portal CSV/XLSX | `src/lib/sales/lead-import.ts` | Not in SOW; **out of scope list says no data migration** | Recommended remove (or keep as Admin-only convenience, flagged) |

Also removed: `/dashboard/performance`, the five role dashboards, 13 reports,
8 print layouts under `src/app/print`, the mobile `board` and `calendar`
modules, and the parity exemptions that refer to the above.

---

## 5. Build New — required by the SOW and absent

| # | Module | SOW § | Notes on reuse |
| --- | --- | --- | --- |
| 5.1 | **Rider onboarding workflow** — Draft → Submitted → Accepted / Rejected with reason, resubmit; initiated by tele-caller / TL / Admin / rider self sign-up; acceptance activates the rider, assigns Rider ID, generates ID card, triggers WhatsApp | §3.2 | New `onboardingStatus` + `OnboardingEvent` on the rider record. Form built from the existing form registry so web and app share it; KYC uploads through `storage.ts`. Rider self sign-up is an **unauthenticated** endpoint — new for this codebase |
| 5.2 | **Digital ID card** (name, mobile, photo, Rider ID, client company, insurance no., emergency no., main company), shareable image | §3.6 item 3 | New render; can reuse print-layout approach (HTML → image) |
| 5.3 | **Offer letter templates master + PDF generation** per company, internal vs vendor variants, merge fields, attach to profile, download / print / WhatsApp | §3.2 | New master block + `pdfkit` (already a dependency, used by report export) |
| 5.4 | **Payout management** — per-company Excel import with configurable column map, period tagging, Rider-ID matching with unmatched-row correction, formula `Total − Advance − Bike Rental − TDS` (editable in Masters), auto-pull of advances and bike rent for the period, Paid / Hold with reason, post, history, period summary; role-scoped read views | §3.4, §3.5 | New `PayoutImport`, `PayoutLine`. **Reuse** `src/lib/import/parse.ts` + `columns.ts` (the lead import's XLSX/CSV parser and column mapper) and the preview-then-commit pattern of `previewLeadImportAction` / `importLeadsAction`. Formula goes in `settings.ts` |
| 5.5 | **Advances** — rider request (amount, priority, reason from master, remarks), TL/Admin approve/reject with remarks, recovery schedule, auto-deduct in payout | §3.5, §3.6 item 6, §3.7 item 3 | New `Advance`, `AdvanceRecovery`; `AdvanceReason` master block |
| 5.6 | **Bike rent** — assign bike, weekly rent, start/end, auto-deduct | §3.5 | New `BikeRent` |
| 5.7 | **Referrals** — rider referral ID, who referred whom, joining date, 25-day validity, eligibility; share button; referral list in app | §3.5, §3.6 item 4 | New `referralCode` on rider + `referredById`; validity is derived (joining + 25 days), not stored |
| 5.8 | **Accounts — vendor invoices** (invoices expected from client companies): status Raised / Sent / Partially Paid / Paid / Overdue, payments with date + reference | §3.5 | New `ClientInvoice`, `ClientInvoicePayment`. Shape mirrors the existing `VendorInvoice` + `VendorPayment` and can be adapted from them before they are deleted |
| 5.9 | **Internal staff** — master (designation, joining date, monthly salary), manual attendance, manual payslip PDF (gross, advance, deductions, net), monthly Excel payout import | §3.8 | Internal staff = `Employee` with employment type "Internal Staff" and `monthlySalary`; payslip is a new PDF; monthly import is a payout import variant (5.4) |
| 5.10 | **WhatsApp Business API** (BotSync) — onboarding message on acceptance with app link; offer letter send | §3.10 | New `src/lib/whatsapp.ts` driver; needs BotSync credentials and approved template name |
| 5.11 | **PIN + OTP login** | §3.6 item 2 | See §3.3. OTP delivery channel is a gap (§6) |
| 5.12 | **GPS punch in/out** | §3.6 item 7 | See §3.5; the app already sends location for site-progress logs, so the client plumbing exists |
| 5.13 | **Rider / TL / Tele-caller dashboards** | §3.6–3.8 | Re-use dashboard tiles |

---

## 6. Assumptions and scope gaps — decisions needed before coding

1. **Delete, don't hide.** The brief says remove out-of-scope modules. I will
   delete code, permissions, registry entries and tables, with one migration
   per removed module. Existing construction data in the development database
   will be lost; the SOW excludes data migration, so nothing is carried over.
   *If the client wants the construction ERP preserved as a separate product,
   this must be a fork instead — please confirm.*
2. **Rider is the `Employee` model extended, not a new model.** Attendance,
   documents, photo and status already hang off `Employee`. A rider who logs in
   gets a linked `User` row; internal staff and TLs are also `Employee` rows so
   one attendance and payslip path serves all three.
3. **"Full biker profile with PIN" visible to Admin.** PINs will be stored
   hashed, as passwords are. Admin will get *reset PIN* and *set PIN*, not
   *view PIN*. Showing a stored credential in plain text is a security defect
   I will not build without an explicit written instruction.
4. **Forgot-PIN via OTP has no delivery channel in scope.** SMS is explicitly
   out of scope. Options: (a) OTP over WhatsApp through the same BotSync
   template path, (b) Admin/TL-assisted reset only. I will build (b) and leave
   (a) as a one-function hook, unless told otherwise.
5. **Push notifications** (§3.6 item 10, §3.9) are not built; the app has
   in-app notifications only. Firebase Cloud Messaging is not a dependency.
   This is a Build New item that needs a Firebase project from the client;
   I will keep in-app notifications and flag push as pending client setup.
6. **Lead stages become data.** The fixed `LeadState` enum becomes a
   `LeadStage` master. Two stages are special — the one that triggers
   onboarding and the terminal "Lost" — so each stage carries a `kind` so the
   system still knows which is which when Admin renames them.
7. **Payout formula "editable in Masters".** I will store the formula as a
   setting with named terms (`totalPayout`, `advance`, `bikeRental`, `tds`) and
   a sign per term, not as free-text arithmetic — safe to evaluate, still
   editable. Confirm this meets the intent.
8. **"Internal Staff" is a company for payout purposes**, as the SOW says. It
   will be seeded as a company with a monthly cycle and the staff column map.
9. **Multi-assignee tasks.** The SOW assigns one task to "one or more TLs". I
   will add a `TaskAssignee` join so one task can have several TLs, each
   updating their own status.
10. **Approval engine removed.** The existing amount-limit approval chain
    (`ApprovalLimit`, `approvals` queue) is replaced by a single approve/reject
    on advances and onboarding, which is what the SOW describes.
11. **Mobile app parity rule stays.** Every new server action is reachable
    from the app via the record/form registries; `pnpm mobile:sync` and the
    parity test remain the gate. Admin-only screens (masters, payout import,
    company creation, vendor invoices, internal staff) are listed in
    `parity.ts` as `brief:web-only`, matching "Admin is web-only".
12. **Google Maps per hub** will store a lat/lng and a maps link; map rendering
    stays within the free tier (static link, no embedded JS map).
13. **eKYC / Aadhaar verification** is out of scope; Aadhaar gets a 12-digit
    format check only, PAN a format check.

---

## 7. Proposed order of work

1. Confirm §6, especially item 1.
2. **Remove** (one commit per module, tests green after each): material →
   units/sales chain → projects/schedule/checklists → calendar/kb/approvals →
   masters and reports clean-up. Regenerate permissions and mobile registries.
3. **Modify** roles, login (phone + PIN), company master, lead stages and
   lead fields, rider record, attendance punch, task simplification.
4. **Build** onboarding → Rider ID / ID card / offer letter → payouts →
   advances and bike rent → referrals → client invoices → internal staff
   payslips → WhatsApp → dashboards and reports.
5. Re-seed (four roles, five companies, lead stages, advance reasons), update
   `README.md`, `CLAUDE.md`, `docs/PERMISSIONS.md`, `docs/MOBILE_PARITY.md`.
6. `pnpm check`, `pnpm build`, `pnpm test:e2e`, handset walkthrough.
