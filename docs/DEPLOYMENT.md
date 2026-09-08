# Deployment

Live at **https://nninfra.zapeat.in**

## Where it runs

| | |
| --- | --- |
| Host | `168.231.103.114` (Ubuntu 24.04 LTS, shared — ~98 other vhosts) |
| App directory | `/var/www/nninfra/app` (a git checkout of `main`) |
| Port | `3021` on loopback only, behind nginx |
| Process manager | pm2, process name `nninfra` |
| Database | PostgreSQL 16, database `nn_infra_erp`, role `nninfra` |
| Uploads | `/var/www/nninfra/storage` |
| Logs | `/var/log/nninfra/` (app) and `nginx-{access,error}.log` beside them |
| TLS | The pre-existing `*.zapeat.in` wildcard certificate |

This box already hosts many sites. Two consequences worth remembering:

- **Port 3000 was taken**, so this app runs on 3021. Check with
  `ss -tlnH | awk '{print $4}'` before assuming a port is free.
- The vhost uses an **exact** `server_name nninfra.zapeat.in`, which takes
  precedence over the `*.zapeat.in` wildcard vhost that proxies everything else
  to `:3002`. Do not weaken that to a wildcard.

## Redeploying

```bash
ssh root@168.231.103.114
sudo /var/www/nninfra/deploy.sh
```

That fetches `main`, installs, migrates, syncs the permission catalogue,
rebuilds, restarts pm2 and health-checks. **If the app does not come back
healthy it rolls back to the previous commit automatically.**

## Configuration

Secrets live in `/var/www/nninfra/.env.production` (mode `600`, owned by
`nninfra`), symlinked to `app/.env` so Next.js and the Prisma CLI both find it.
It is deliberately outside the git tree — `.env` is gitignored and has never
been committed.

`AUTH_SECRET` and the database password were generated on the server with
`openssl rand` and have never left it.

## First-run checklist for a fresh environment

```bash
sudo -u postgres createdb -O nninfra nn_infra_erp
npx prisma migrate deploy        # schema
pnpm db:seed                     # permissions, roles, masters, users
pnpm db:demo                     # optional: demo transactions
pnpm build && pm2 start /var/www/nninfra/ecosystem.config.js
```

## Verifying a deployment

```bash
curl -o /dev/null -w '%{http_code}\n' https://nninfra.zapeat.in/login   # expect 200
pm2 logs nninfra --lines 50
cd /var/www/nninfra/app && E2E_BASE_URL=http://127.0.0.1:3021 pnpm test:e2e
```

The E2E suite runs against the deployed instance and asserts the access-control
model end to end — 62 tests covering route guards per role, button-level gating,
row-level scoping and immediate session revocation.

## Known hardening still to do

1. **Demo accounts are live.** Six seeded users share the password
   `Nninfra@2026`. Change them, or delete the five non-owner accounts, before
   real users are on the system.
2. **pm2 runs as root**, matching the four apps already on this box. Running the
   process as the `nninfra` user (which exists and owns the files) would be
   better, but diverges from the host's convention — worth doing deliberately
   rather than as a side effect of a deploy.
3. **No automated database backup** is configured for `nn_infra_erp`.
   The scope document commits to a daily backup; add one before go-live.
4. **The `*.zapeat.in` certificate expires 17 Sep 2026.** It is shared with the
   other subdomains, so renewal is presumably already handled — confirm.

## Neighbouring site note

`udupi.zapeat.in` was returning 502 before this deployment and still is: its
backend on port 3008 is not running. Unrelated to this app, but worth someone
looking at.
