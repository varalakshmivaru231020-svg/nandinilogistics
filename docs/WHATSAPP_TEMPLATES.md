# WhatsApp message templates — for submission to Meta

Nine templates covering the eight phase-1 events. Booking and receipt need one
each: a template's words are fixed at approval, so two different messages cannot
share one.

**None of this is wired up yet.** The app has no WhatsApp, SMS or email
transport — notifications are in-app only, and only tasks write them. These are
the words to get approved first, because approval is the long pole; the code
behind it is the easy half.

Submit from `docs/whatsapp-templates.json`, either by pasting each one into Meta
Business Manager → WhatsApp Manager → Message templates, or by posting the file
(see the end). `node scripts/check-whatsapp-templates.mjs` checks all nine
against the rules that actually get a submission rejected — run it after any
edit, before you submit.

| | |
|---|---|
| Category | **UTILITY** for all nine: each is an account update, or follows from something the person did. Not marketing — one selling word gets a template recategorised, which costs more, needs opt-in, and can be throttled. |
| Language | `en`. A Kannada or Hindi version is a separate submission under the same name: one template per name per language. |
| Versioning | `_v1` in every name. An approved template can be edited, but the edit goes back for review; for a real change of wording submit `_v2` and move the code over. Never leave two live. |


## The nine


### `approval_pending_v1`

**Fires when:** Any approval entering the queue — indent, PO, invoice, return, transfer  
**In the code:** `src/lib/approvals/service.ts` (its ten kinds)  
**Goes to:** The approver, each level in its turn

**Body**

```
Hello {{1}}, an approval is waiting on you in NN Infra.

Document: {{2}}
For: {{3}}
Project: {{4}}
Raised by: {{5}}

It stays pending until you approve or reject it.
```

**Footer:** `NN Infra ERP`

**Button:** URL · “Open” → `https://nninfra.zapeat.in/{{1}}`  
**Example URL (required):** `https://nninfra.zapeat.in/material/indents/cmuv4jaa20029pptx`

**Sample values** — paste exactly these. A submission with a missing or placeholder sample is rejected.

| # | Sample | Comes from |
|---|---|---|
| {{1}} | Vikas Verma | approver's name |
| {{2}} | Indent IND/NNS/2026-27/0004 | `kind` + `reference` |
| {{3}} | Adjustable Steel Prop - 58 Numbers | what it is for |
| {{4}} | NN Skyline | project |
| {{5}} | Narayan Nagaraj | raised by |


### `task_overdue_v1`

**Fires when:** A task past its due date, once a day while it stays that way  
**In the code:** `alertsDue()` in `src/lib/tasks/overdue-sweep.ts`, kind `OVERDUE`  
**Goes to:** The assignee, and the assigner on the daily repeat

**Body**

```
Hello {{1}}, a task given to you is overdue.

Task: {{2}}
Title: {{3}}
Was due: {{4}}
Overdue by: {{5}}

Please update it, or ask for more time on it.
```

**Footer:** `NN Infra ERP`

**Button:** URL · “Open task” → `https://nninfra.zapeat.in/{{1}}`  
**Example URL (required):** `https://nninfra.zapeat.in/tasks/cmusd9imz0001ppo2`

**Sample values** — paste exactly these. A submission with a missing or placeholder sample is rejected.

| # | Sample | Comes from |
|---|---|---|
| {{1}} | Anil Deshpande | assignee |
| {{2}} | T-9001 | `taskNo` |
| {{3}} | Slab shuttering check | `title` |
| {{4}} | 08 Oct 2026 | `dueAt` |
| {{5}} | 3 days | days overdue |


### `checklist_point_denied_v1`

**Fires when:** A checklist point denied at review or approval  
**In the code:** `tell(tx, "CHECKLIST_FAILED", …)` in `tasks/actions.ts`  
**Goes to:** The assignee and reviewer 1, who it goes back to

**Body**

```
Hello {{1}}, a checklist point has been denied.

Task: {{2}}
Point: {{3}}
Denied by: {{4}}
Remark: {{5}}

That point alone goes back for rework. The others do not move.
```

**Footer:** `NN Infra ERP`

**Button:** URL · “Open task” → `https://nninfra.zapeat.in/{{1}}`  
**Example URL (required):** `https://nninfra.zapeat.in/tasks/cmusd9imz0001ppo2`

**Sample values** — paste exactly these. A submission with a missing or placeholder sample is rejected.

| # | Sample | Comes from |
|---|---|---|
| {{1}} | Ravi Shankar | assignee |
| {{2}} | T-9001 Slab shuttering check | task |
| {{3}} | Cover blocks placed at 1 m centres | the point |
| {{4}} | Anil Deshpande (Reviewer L1) | who denied it, and at which level |
| {{5}} | Blocks missing on the east face | remark |


### `followup_overdue_v1`

**Fires when:** A lead follow-up lapsed past the grace period  
**In the code:** `isEscalationDue()` in `src/lib/sales/assignment.ts` (24 h by default)  
**Goes to:** The Sales Head — it is already an escalation

**Body**

```
Hello {{1}}, a lead follow-up has not been done and has been escalated to you.

Lead: {{2}}
Owner: {{3}}
Stage: {{4}}
Was due: {{5}}

Please take it up with the owner.
```

**Footer:** `NN Infra ERP`

**Button:** URL · “Open lead” → `https://nninfra.zapeat.in/{{1}}`  
**Example URL (required):** `https://nninfra.zapeat.in/sales/leads/cmuv4jaa20029`

**Sample values** — paste exactly these. A submission with a missing or placeholder sample is rejected.

| # | Sample | Comes from |
|---|---|---|
| {{1}} | Meera Krishnan | sales head |
| {{2}} | Vikram Shetty | lead |
| {{3}} | Priya Nair | owner |
| {{4}} | Negotiation | stage |
| {{5}} | 09 Oct 2026 11:00 | when it was due |


### `receipt_bounced_v1`

**Fires when:** A receipt moved to BOUNCED  
**In the code:** `src/lib/sales/receipt-clearance.ts`  
**Goes to:** Accounts and the Sales Head

**Body**

```
Hello {{1}}, a receipt has bounced and is no longer counted as collected.

Receipt: {{2}}
Amount: {{3}}
Customer: {{4}}
Mode: {{5}}

Please take it up with the customer.
```

**Footer:** `NN Infra ERP`

**Button:** URL · “Open receipt” → `https://nninfra.zapeat.in/{{1}}`  
**Example URL (required):** `https://nninfra.zapeat.in/sales/receipts/cmuv4jaa20029`

**Sample values** — paste exactly these. A submission with a missing or placeholder sample is rejected.

| # | Sample | Comes from |
|---|---|---|
| {{1}} | Meera Krishnan | accounts |
| {{2}} | RCP/NNS/2026-27/0042 | receipt no |
| {{3}} | Rs 5,00,000 | amount |
| {{4}} | Vikram Shetty | customer |
| {{5}} | Cheque 004471 | mode and instrument |


### `unit_hold_expiring_v1`

**Fires when:** A hold within a few hours of lapsing  
**In the code:** `UnitHold.expiresAt` — needs a sweep, and there is none yet  
**Goes to:** Whoever placed the hold

**Body**

```
Hello {{1}}, a flat you are holding is about to be released.

Flat: {{2}}
Project: {{3}}
Held for: {{4}}
Hold ends: {{5}}

Confirm the booking or extend the hold before then.
```

**Footer:** `NN Infra ERP`

**Button:** URL · “Open flat” → `https://nninfra.zapeat.in/{{1}}`  
**Example URL (required):** `https://nninfra.zapeat.in/units/board?unit=cmuv4jaa20029`

**Sample values** — paste exactly these. A submission with a missing or placeholder sample is rejected.

| # | Sample | Comes from |
|---|---|---|
| {{1}} | Priya Nair | executive |
| {{2}} | A-0101 | flat |
| {{3}} | NN Skyline | project |
| {{4}} | Vikram Shetty | held for |
| {{5}} | 27 Oct 2026 18:00 | when it ends |


### `purchase_order_issued_v1`

**Fires when:** A purchase order approved and issued  
**In the code:** `material/purchase-orders` — on the status reaching APPROVED  
**Goes to:** The vendor (external — needs opt-in)

**Body**

```
Dear {{1}}, a purchase order has been issued to you by NN Infra.

Order: {{2}}
Dated: {{3}}
Value: {{4}}
Delivery expected by: {{5}}
Deliver to: {{6}}

Please acknowledge this order.
```

**Footer:** `NN Infra`

**Button:** Quick reply · “Acknowledge” — their reply opens a 24-hour window, inside which you may write to them freely.

**Sample values** — paste exactly these. A submission with a missing or placeholder sample is rejected.

| # | Sample | Comes from |
|---|---|---|
| {{1}} | Shree Cement | vendor |
| {{2}} | PO/NNS/2026-27/0012 | PO no |
| {{3}} | 19 Oct 2026 | date |
| {{4}} | Rs 4,85,000 | value |
| {{5}} | 24 Oct 2026 | expected date |
| {{6}} | NN Skyline main store, Bengaluru | delivery address |


### `payment_receipt_v1`

**Fires when:** A receipt recorded and cleared  
**In the code:** `sales/receipts` — on CLEARED  
**Goes to:** The customer (external — needs opt-in)

**Body**

```
Dear {{1}}, we have received your payment. Thank you.

Amount: {{2}}
Receipt: {{3}}
Dated: {{4}}
Towards: {{5}}
Balance due: {{6}}

This is an acknowledgement from NN Infra.
```

**Footer:** `NN Infra`

**Sample values** — paste exactly these. A submission with a missing or placeholder sample is rejected.

| # | Sample | Comes from |
|---|---|---|
| {{1}} | Vikram Shetty | customer |
| {{2}} | Rs 5,00,000 | amount |
| {{3}} | RCP/NNS/2026-27/0042 | receipt no |
| {{4}} | 19 Oct 2026 | date |
| {{5}} | Flat A-0101, NN Skyline | what it is against |
| {{6}} | Rs 45,00,000 | balance |


### `booking_confirmed_v1`

**Fires when:** A booking confirmed against a flat  
**In the code:** `sales/bookings`  
**Goes to:** The customer (external — needs opt-in)

**Body**

```
Dear {{1}}, your booking is confirmed. Thank you for choosing NN Infra.

Flat: {{2}}
Project: {{3}}
Booking: {{4}} dated {{5}}
Agreement value: {{6}}

Your sales executive {{7}} will take you through the next steps.
```

**Footer:** `NN Infra`

**Sample values** — paste exactly these. A submission with a missing or placeholder sample is rejected.

| # | Sample | Comes from |
|---|---|---|
| {{1}} | Vikram Shetty | customer |
| {{2}} | A-0101, 3 BHK, 1,450 sq.ft | flat |
| {{3}} | NN Skyline | project |
| {{4}} | BKG/NNS/2026-27/0007 | booking no |
| {{5}} | 19 Oct 2026 | date |
| {{6}} | Rs 1,35,00,000 | agreement value |
| {{7}} | Priya Nair | executive |


## The rules these were written to

Each one is a real rejection reason, and the checker tests for it:

- **A body may not begin or end with a variable**, and two variables may not sit
  next to each other. This is the commonest rejection of the lot.
- **Every variable needs a sample**, and the numbering must run 1..n with no
  gaps. A sample that reads as placeholder text is rejected.
- **A footer carries no variable** and stops at 60 characters; a body stops at
  1024; button text at 25.
- **A URL button with a variable needs an example URL.** The variable is a
  suffix on a fixed base — `https://nninfra.zapeat.in/` plus what the code
  passes.
- **No URL shorteners**, and the domain should be one you control.

## Two things the code must handle before it sends

1. **No parameter may be empty.** The API rejects a blank value — and a denied
   checklist point is allowed to carry no remark at all, which the web says
   under the box. Send `No remark given`, not an empty string. The same goes for
   an address, a zero balance, anything optional.
2. **No newline or tab inside a parameter**, and no run of more than four
   spaces. That is a rejection at send time rather than at approval, so it only
   shows up in production. Collapse the whitespace in whatever the record holds.

## Submitting

Paste each into WhatsApp Manager, or post the file with a system-user token
carrying `whatsapp_business_management`:

```bash
export WABA_ID=<WhatsApp Business Account id>
export TOKEN=<system user token>
python3 scripts/submit-whatsapp-templates.py
```

Approval for a utility template usually returns within minutes to a few hours.
A rejection comes back as a status on the template with a reason; fix the words,
bump to `_v2`, resubmit.

## Still to decide

- **Provider** — Meta Cloud API direct, or an Indian BSP (Gupshup, Interakt,
  AiSensy). Direct is cheaper per message; a BSP gets you live sooner and
  chases approvals for you.
- **Opt-in for the three external templates.** A vendor or customer must have
  agreed before a business-initiated message, and you should record where and
  when they did.
- **Quiet hours, and a per-person preference** — or the number is muted within
  a week.
- **An outbox with retries and an audit row.** A message that failed silently is
  worse than no message at all.
