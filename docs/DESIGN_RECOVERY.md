# The design, recovered in full

## What happened

Every build in this repository up to 10 September 2026 was made against a
**truncated copy of the design**.

`DesignSync.get_file` caps a read at 256 KiB. `NN Infra Admin.dc.html` is
**728,747 bytes**, so the copy on disk stopped at exactly 262,144 bytes — mid
attribute, with no closing `</x-dc>` and, critically, **without the
`data-dc-script` block that holds every value the `{{ }}` bindings resolve to**.
Roughly two thirds of the design was never visible, and none of its data was.

The full file came back through a published artifact
(`claude.ai/code/artifact/c1f9989e…`), whose bundle carries the whole template
gzipped in its manifest. `design/design-logic.js` is the extracted logic script.

## What the truncated copy hid

| | Truncated | Actual |
| --- | --- | --- |
| Template | 261,758 chars | **726,942 chars** |
| `sc-if` conditions | ~100 | **210** |
| Data script | absent | **259,034 chars** |
| Screens | inferred as 8 | **16** |

## The design's sixteen screens

```
Overview        dashboard
Execution       projects · tasks · checklists · schedule
Procurement     indents · pos · grn · items · vendors
Sales           leads · followups · flats
Workforce       hr
Administration  kb · masters
```

`TITLES` gives each its heading — `hr` is **"Users & Attendance"**, `kb` is
**"Knowledge Base"**, `items` is **"Item Master · Stock"**.

## Two modules that are not built, and are not in the scope document either

**Workforce (`hr`) — "Users & Attendance"**, three tabs from the design's
`hrTabs`: Employees, Mark Attendance, Attendance Report — the last with a date
range and an `.xlsx` export. State: `empForm`, `empId`, `empView`, `evFrom`,
`evTo`, `rpFrom`, `rpTo`.

**Knowledge Base (`kb`)** — searchable articles with attachments. State:
`kbArticles`, `kbSearch`, `kbForm`, `kbName`, `kbDesc`, `kbFiles`, `kbView`.

Neither appears in `NN_Infra_ERP_Presentation.pdf`, which describes seven
modules. They are design additions. Building them means new Prisma models
(`Employee`, `AttendanceEntry`, `KbArticle`), migrations and permissions —
work outside the signed scope, so it is worth confirming commercially before
it is built rather than after.

## Structural differences from what is built

1. **Procurement is five top-level screens** in the design — Indents, Purchase
   Orders, Goods Receipt, Item Master, Vendors — not one tabbed screen. This
   repository has a tabbed `/material` plus nine sub-entries.
2. **Masters and Users are one screen** ("Masters & Users"). Here they are
   `/masters` plus six separate Administration entries.
3. **The design has no Reports nav entry.** Reports live inside the screen they
   belong to, as the schedule's Reports tab does.
4. Labels differ throughout: "Leads · CRM", "Item Master", "Available Flats".

## The design's own role matrix

```
Owner / Admin     all sixteen
Project Manager   all but leads, followups, flats, masters
Supervisor        dashboard, tasks, checklists, indents, items, hr, kb
Store Manager     dashboard, indents, pos, grn, items, vendors, kb, masters
Sales             dashboard, leads, followups, flats, kb
```

Worth reconciling against `prisma/role-matrix.ts`, which was written from the
scope document's matrix rather than this one.

## Rule

Do not re-fetch this file with `DesignSync.get_file` — it will silently truncate
again. The copy in `design/` is the complete one and is committed.
