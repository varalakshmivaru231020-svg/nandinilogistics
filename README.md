# Nandini Logistics — Rider CRM, Onboarding & Payout Platform

The web admin panel and server for managing delivery riders deployed to
client companies: lead capture and tele-calling, KYC onboarding with
auto-generated Rider IDs and offer letters, company masters, weekly payout
processing from Excel imports, advances and bike rent, attendance, referrals,
vendor invoices, internal staff payslips and task management — on one
database with one permission model.

Built to Supreme One Software's SOW ref `SOS/SOW/2026/RCRM-01` (22 Oct 2026).
`docs/SCOPE_MAPPING_RIDER_CRM.md` maps every SOW item to what is built.

The Android client under `mobile/` talks to the same server through
`/api/mobile/v1`; it is being brought up after the admin panel.

---

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19, Server Actions) |
| Language | TypeScript, strict |
| Database | PostgreSQL 17 + Prisma 6 |
| Auth | Signed JWT in an httpOnly cookie (`jose`) + revocable server sessions; bearer token for the app |
| Passwords / PINs | bcrypt, cost 12 |
| Validation | Zod, shared between client and server |
| UI | Tailwind CSS 4, custom component layer, lucide icons |
| Files | Local filesystem behind `src/lib/storage.ts` (swappable for object storage) |
| PDFs / sheets | pdfkit, exceljs, papaparse |

Server Actions are the write path; every one of them re-checks permissions
server-side, so the UI can never be the security boundary.

---

## Getting started

```bash
pnpm install

cp .env.example .env          # then set DATABASE_URL and AUTH_SECRET
#   AUTH_SECRET: openssl rand -base64 32
#   optional: BOTSYNC_API_URL, BOTSYNC_API_KEY, APP_DOWNLOAD_URL (WhatsApp onboarding message)

createdb nandini_rider_crm
pnpm db:migrate               # apply migrations
pnpm db:seed                  # permissions, roles, masters, lead stages, demo users and riders

pnpm dev                      # http://localhost:3000
```

### Demo accounts

All use the password `Nandini@2026`. Each lands on a different dashboard with a
different menu — that is the permission model doing its job.

| Email | Role | Sees |
| --- | --- | --- |
| `admin@nandini.example` | Admin (web only) | Everything |
| `tl@nandini.example` | Team Leader | Leads, own team's riders and onboarding review, team payouts, advance approval, attendance, tasks |
| `telecaller@nandini.example` | Tele-caller | Own leads and follow-ups, onboarding form and Rider ID, payout status of riders onboarded |
| `telecaller2@nandini.example` | Tele-caller | A second tele-caller, so round-robin has a choice |
| `rider@nandini.example` | Rider | Own record, ID card, payout, advances, referrals; refers leads |

---

## Scripts

| Command | Does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm db:migrate` | Create and apply a migration |
| `pnpm db:seed` | Permissions, roles, masters, lead stages, users, demo riders |
| `pnpm seed:reference` | Masters, stages and employment types only — safe on a live box |
| `pnpm db:reset` | Drop, re-migrate, re-seed |
| `pnpm perms:sync` | Regenerate typed codes **and** sync the DB catalogue |
| `pnpm perms:grants` | Apply the default role matrix (`--add` to hand out codes added since) |
| `pnpm mobile:sync` | Regenerate the mobile action and list registries from the server actions |
| `pnpm parity:matrix` | Write `docs/MOBILE_PARITY.md` from the registries |
| `pnpm test` | Unit + integration tests |
| `pnpm test:unit` | Pure logic only — no database needed |
| `pnpm test:integration` | Against the real database |
| `pnpm test:e2e` | HTTP access-control tests (needs the app running) |
| `pnpm check` | typecheck + lint + test — the gate before a commit |

---

## Modules

| SOW § | Module | Where |
| --- | --- | --- |
| 3.1 | CRM — leads, configurable stages, assignment rule, follow-ups, duplicate check, escalation | `src/app/(app)/sales`, `src/lib/sales` |
| 3.2 | Rider onboarding & KYC — Draft → Submitted → Accepted / Rejected, Rider ID, ID card, offer letter PDF, WhatsApp onboarding message | `src/app/(app)/hr`, `src/lib/hr`, `src/lib/riders`, `src/lib/offer-letter.ts`, `src/lib/whatsapp.ts` |
| 3.3 | Company master — hubs with map location, Team Leader assignment, rate card, offer letter templates, payout column mapping | `src/app/(app)/companies`, masters |
| 3.4 | Payout management — per-company Excel import, rider matching, formula, auto-deductions, hold / release, post | `src/app/(app)/payouts`, `src/lib/payouts` |
| 3.5 | Advances, bike rent | `src/app/(app)/advances`, `src/lib/advances` |
| 3.5 | Referral history (25-day validity) | `src/app/(app)/hr/referrals`, `src/lib/riders/referrals.ts` |
| 3.5 | Accounts — invoices raised to client companies | `src/app/(app)/accounts`, `src/lib/accounts` |
| 3.5, 3.8 | Internal staff — attendance, payslip PDFs, monthly import | `src/app/(app)/staff`, `src/lib/staff`, attendance under `hr` |
| 3.9 | Task management — Admin assigns to Team Leaders, Open / In progress / Done | `src/app/(app)/tasks`, `src/lib/tasks` |
| 3.5 | Dashboard and reports — TL report, riders by company, lead conversion, payout summary, advance outstanding, tele-caller daily | `src/app/(app)/dashboard`, `src/lib/reports` |
| — | Masters, users, roles, permission matrix, audit, sessions, settings | `src/app/(app)/masters`, `src/app/(app)/admin` |

Out of scope by the SOW and not built: SMS/OTP delivery, iOS, eKYC/Aadhaar
verification, payroll statutory filing, push notifications (the app's
notifications are in-app until a Firebase project exists).

---

## Access control in one paragraph

A user holds roles; roles hold permissions; a user may also carry direct
`ALLOW` / `DENY` overrides, and `DENY` always wins. On top of that, data is
scoped: a Team Leader sees the riders of the companies assigned to them, a
tele-caller the riders whose lead they own, a rider only themselves — unless
the module's `viewAll` is held. Everything a user can see or do — every menu
entry, tab, button, sensitive column and approval step — is a projection of
that one resolution, computed once per request.

**Read [docs/PERMISSIONS.md](docs/PERMISSIONS.md) before adding any feature.**

---

## The rider's path

```
Lead             captured by anyone; Admin/TL must name a tele-caller, a
  ↓              tele-caller keeps their own, a rider's referral goes round-robin
Approval         a lead (or referral) a tele-caller enters waits as Pending approval
  ↓              in /approvals until a TL or Super Admin approves or rejects it
                 (reason mandatory); nothing can be followed up until then
Follow-ups       logged with stage, remarks and next date; overdue ones escalate to the TL
  ↓
Onboarding       the lead reaches the Onboarding stage → a rider record in Draft:
  ↓              KYC, bank, emergency contacts, companies, photo — Rider ID NL001
Submitted        the tele-caller submits; the TL or Admin reviews
  ↓
Accepted         rider goes active; ID card and offer letter generated;
  ↓              WhatsApp onboarding message sent; referral window (25 days) starts
Payouts          the company's weekly sheet is imported, matched by Rider ID,
                 advances and bike rent deducted, held or posted — visible to
                 the rider, the TL and the tele-caller who onboarded them
```

The sidebar lists **Riders**, **Internal Staff** (Internal Staff and Team
Leader types) and **Attendance** separately. Everyone with a person record —
riders, Team Leaders, tele-callers — checks in and out (the app's punch, or the
top bar's Check in on the web; location optional on the web). Under four hours
is a half day; a day with no check-out stays Present and is flagged.

---

## Testing

```bash
pnpm test          # unit + integration
pnpm dev &         # the E2E suite drives the running app
pnpm test:e2e      # access control over HTTP
```

| Layer | What it proves |
| --- | --- |
| `tests/unit` | Lead assignment and escalation rules, lead editing and duplicate relinking, payout arithmetic, referral validity, task lifecycle, permission resolution, the master engine, the registries against the screens they describe, mobile parity |
| `tests/integration` | The server actions themselves against a real database — only `cookies()` is stubbed: onboarding end to end, payout import → post, invoices, lead automation, numbering under concurrency, every report |
| `tests/e2e` | That the **server** enforces access, not the UI — route guards per role, button-level gating, row-level scoping, exports, the mobile boundary |

Integration tests run against the same Postgres database as development and
clean up after themselves. The E2E suite skips itself with a warning when the
app is not running.

---

## Security notes

- Passwords and app PINs are hashed with bcrypt (cost 12) and never returned
  to the client. Admin can set or reset a PIN, never read one.
- Sessions are rows in the database, so deactivating a user or resetting their
  password revokes every device on the next request rather than at token expiry.
- Sign-in failures are recorded in the audit trail; the error message never
  reveals whether an address exists.
- Every create, update, approve and delete writes an audit row with a
  field-level before/after diff; Aadhaar, PAN and bank details are masked in it.
- Server Actions re-authorise on every call — hidden UI is never the boundary.
- Uploaded files are addressed by an opaque key and served through guarded
  routes; a filename can never escape the storage root.
