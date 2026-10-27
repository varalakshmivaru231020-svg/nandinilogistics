# WhatsApp message template — for submission to Meta

One template, for the one message this platform sends: a client's confirmation
that their site visit is booked.

Submit it from `docs/whatsapp-templates.json` — paste it into Meta Business
Manager → WhatsApp Manager → Message templates, or post the file with
`python3 scripts/submit-whatsapp-templates.py`. `pnpm whatsapp:templates`
checks it against the rules that actually get a submission rejected; run that
after any edit.

| | |
|---|---|
| Name | `site_visit_scheduled_v1` |
| Category | **UTILITY** — it follows from something the client arranged. Not marketing: one selling word and Meta recategorises it, which costs more, needs opt-in and can be throttled. |
| Language | `en`. A Kannada or Hindi version is a separate submission under the same name. |
| Goes to | The client, on the number held against the lead. |
| Fires when | A site visit is scheduled — `scheduleSiteVisitAction`. |

## The body

```
Dear {{1}}, your site visit is confirmed.

Project: {{2}}
Address: {{3}}
When: {{4}}
You will be met by: {{5}}
Their number: {{6}}

Reply to this message if you need a different time.
```

**Footer:** `NN Infra`  
**Buttons:** none. A client has no login, so there is nowhere to send them.

The last line invites a reply on purpose: a reply opens a 24-hour window in
which the sales executive can write to them freely, without another template.


## Sample values

Paste exactly these. A submission with a missing or placeholder sample is rejected.

| # | Sample | Comes from |
|---|---|---|
| {{1}} | Vikram Shetty | the lead's name |
| {{2}} | NN Skyline | the project |
| {{3}} | Sarjapur Road, Bengaluru | its address |
| {{4}} | 28 Oct 2026 11:00 | the visit's date and time |
| {{5}} | Priya Nair | who scheduled it |
| {{6}} | +91 98765 43210 | their own number |

## The rules it was written to

- A body may not begin or end with a variable, and two may not sit next to each
  other. This is the commonest rejection of the lot.
- Every variable needs a sample, numbered 1..n with no gaps.
- A footer carries no variable and stops at 60 characters; a body stops at 1024.

## Two things the sending code handles

1. **No parameter may be empty** — Meta rejects a blank. A project with no
   address on it sends `—`, not "". `tidy()` does this for every variable.
2. **No newline or tab inside a parameter**, and no run of more than four
   spaces: that is a rejection at send time rather than at approval, so it
   would only show up in production.

## Still to settle

- **Opt-in.** A business-initiated message needs the client to have agreed
  beforehand. Where that is recorded against a lead is not decided.
- **Provider** — Meta Cloud API direct, or an Indian BSP. Either works: the
  connection on Masters & Users → WhatsApp is a url and a version.
