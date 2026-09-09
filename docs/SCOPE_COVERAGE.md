# Scope coverage — the presentation, claim by claim

Checked on 9 September 2026 against
`NN_Infra_ERP_Presentation.pdf` (Supreme One Software, 30 August 2026).

Every claim the document makes is listed below with what backs it in the code.
The point of the table is the **Not built** rows — a claim the client will
expect on a walkthrough that the platform does not currently honour.

Method: route smoke (`tests/e2e/route-smoke.test.ts` — every page, every
seeded role, 200 or a `/forbidden` redirect, no 500s), the access-control e2e
suite, and a read of the model and action behind each claim.

## Module 01 — Project Management

| Claim | Status | Where |
| --- | --- | --- |
| Project master: name, code, location, type, RERA, land area, towers, floors, units, target dates | ✅ | `Project` model — every field present |
| Work breakdown Project → Phase → Work Package | ✅ | `ProjectPhase`, `WorkPackage` |
| Team mapping, access follows the mapping | ✅ | `UserProject`; `projectScopeFilter()` in `rbac/` |
| Document repository with version history and role-based access | ✅ | `ProjectDocument.version` / `supersedesId`; `lib/storage.ts` |
| Daily site progress log, geo-tagged and date-stamped | ✅ | `SiteProgressLog.latitude/longitude/photoUrls/logDate` |

## Module 02 — Task Management · Module 03 — Checklist Management

**Held pending client verification at the client's instruction.** Permissions
registered and assignable; screens are inert previews. See
`docs/PENDING_MODULES.md`. Not counted as gaps.

## Module 04 — Project Schedule

| Claim | Status | Where |
| --- | --- | --- |
| Baseline retained, so slippage is measurable | ✅ | `baselineStart/End` frozen; `schedule.baseline.set`; extension approval moves `plannedEnd` only |
| Variance with a captured delay reason | ✅ | `delayReasonId`, `delayNotes`; `scheduleVariance` report |
| Milestones | ✅ | `isMilestone` |
| **Finish-to-start links shift downstream dates automatically when a predecessor slips** | ❌ **Not built** | `ScheduleDependency` model and `schedule.dependency.manage` exist; **no code reads or writes either** |
| **Critical path highlighted** | ⚠️ **Manual** | `isCriticalPath` is a toggle (`setCriticalPathAction`), not computed from the dependency graph |
| **Reusable schedule templates** | ❌ **Not built** | `schedule.template.apply` / `.save` registered; no implementation |

## Module 05 — Material Purchase

| Claim | Status | Where |
| --- | --- | --- |
| Eight-step chain: indent → PM → Admin → store → PO → GRN → invoice → issue | ✅ | `material/*` actions; chain rendered in `procurement-screen.tsx` |
| Value-based routing — second level skipped below the limit | ✅ | `indents/actions.ts`, `ctx.approvalLimitFor()`; configurable at `/admin/approval-limits` |
| Stock checked first; only the shortfall becomes a PO | ✅ | `IndentItem.issueFromStockQty` / `toPurchaseQty` |
| Three-way match, mismatch blocked not quietly paid | ✅ | `threeWayMatch()` in `lib/inventory.ts`; `tests/unit/three-way-match.test.ts` |
| GRN inspection: accepted / rejected / short, challan photo; only accepted enters the ledger | ✅ | `GrnItem.acceptedQty/rejectedQty/shortQty`, `Grn.challanPhotoUrl`; `lib/material/grn-posting.ts` |
| Live stock, weighted-average valuation, reorder alerts | ✅ | `postStockMovement()`; `Item.reorderLevel`; `/material/reorder` |
| Issue, return, transfer — approved and logged | ✅ | `StockLedger` kinds `ISSUE_OUT`, `RETURN_IN`, `TRANSFER_OUT/IN`, `SCRAP` |
| Consumption vs indent vs budget | ✅ | `consumptionVsIndent` report |

## Module 06 — Lead Management & Sales CRM

| Claim | Status | Where |
| --- | --- | --- |
| Capture from every source, with duplicate detection | ✅ | `LeadSource` master; phone match sets `duplicateOfId` |
| Pipeline stages with a mandatory reason on Lost | ✅ | `changeLeadStageAction` refuses `LOST` without `lostReasonId` |
| Follow-ups with next-action dates | ✅ | `LeadFollowUp`, `nextActionAt`, `/sales/follow-ups` |
| Cost sheet → booking → KYC → milestone demands → receipts | ✅ | `CostSheet`, `Booking.kycDocuments`, `PaymentDemand`, `Receipt` |
| **Assigned the moment it lands — round-robin, project-wise or manual** | ⚠️ **Manual only** | `assignLeadAction` is manual; no rotation or project rule |
| **Response time is measured, not assumed** | ❌ **Not built** | `Lead.firstResponseMins` is declared and **never written or read** |
| **Overdue follow-ups escalate to the sales head** | ❌ **Not built** | The sentence appears as UI hint text; nothing notifies or reassigns |

## Module 07 — Available Flats

| Claim | Status | Where |
| --- | --- | --- |
| Block-and-floor grid, colour-coded | ✅ | `/units/board` |
| Holds that expire and release themselves unless extended | ✅ | `expireStaleHolds()` swept before every board read; `UnitHold.extensionCount` |
| Price lists with versions and effective dates; a past booking keeps its rate | ✅ | `PriceList.effectiveFrom/To`; `generateCostSheetFor()` resolves by date |
| Cost sheet: base, floor rise, PLC, parking, amenities, GST, registration | ✅ | `lib/sales/cost-sheet.ts` (pure, shared by action and preview) |
| Booked units carry customer, cost sheet, payment schedule, collections | ✅ | `Booking` → `CostSheet`, `PaymentDemand`, `Receipt` |

## Reporting

| Claim | Status | Where |
| --- | --- | --- |
| A dashboard per role, built around that role's decisions | ✅ | One permission-adaptive dashboard: every section gated on `ctx.has(...)`, so each role's composition differs |
| Thirteen reports across the five audiences | ✅ | `lib/reports/index.ts` |
| **All reports filter by project and date range** | ❌ **Not built** | `runReport(key, ctx)` takes no filter arguments; project scoping is by permission only, and there is no date filter |
| **Export to Excel and PDF** | ⚠️ **CSV only** | `report-view.tsx` builds a CSV blob. Excel opens it; there is no PDF |

## Under the hood

| Claim | Status | Where |
| --- | --- | --- |
| Role-based authorisation on every endpoint | ✅ | `authorize()` in every action; 74 access-control e2e assertions |
| Full audit trail on create, edit, approve, delete | ✅ | 103 `recordAudit()` calls across 21 files; 78 actions wrapped in `runAction()` |
| Configurable approval limits | ✅ | `ApprovalLimit`, `/admin/approval-limits` |
| Document numbering per project | ✅ | `nextDocumentNumber()` resolves a project series, falling back to the global one |
| Hashed credentials, encrypted transport | ✅ | bcrypt cost 12; TLS terminated at nginx |
| **PostgreSQL with daily automated backup** | ❌ **Not built** | No backup job on the server |
| Mobile app, offline capture and sync | ⏳ **Later** | Flutter, after the web platform — the client's sequencing |

## Summary

Seven claims are not built and two are partial. None of them are in the
procurement or sales chains, which are the money paths and are complete. They
cluster in three places:

1. **Schedule** — dependencies do not cascade, the critical path is hand-flagged
   and there are no templates.
2. **Lead assignment and chasing** — no auto-assignment, no measured response
   time, no escalation.
3. **Reports** — no project or date filter, and no PDF.

Plus one operational item: no database backup.
