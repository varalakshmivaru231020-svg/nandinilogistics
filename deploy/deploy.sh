#!/bin/bash
# Redeploys nninfra.zapeat.in from GitHub main.
#   sudo /var/www/nninfra/deploy.sh
#
# The canonical copy is deploy/deploy.sh in the repository. The server runs it
# from /var/www/nninfra/ — outside the checkout, so that `git reset --hard`
# cannot rewrite the script while bash is still reading it. After changing it
# here, install it with:
#   scp deploy/deploy.sh root@host:/var/www/nninfra/deploy.sh
set -euo pipefail

APP=/var/www/nninfra/app
cd "$APP"

echo "==> Fetching main"
sudo -u nninfra HOME=/var/www/nninfra git fetch --quiet origin main
BEFORE=$(git rev-parse --short HEAD)
sudo -u nninfra HOME=/var/www/nninfra git reset --hard --quiet origin/main
AFTER=$(git rev-parse --short HEAD)
echo "    $BEFORE -> $AFTER"

echo "==> Installing"
sudo -u nninfra HOME=/var/www/nninfra pnpm install --frozen-lockfile --silent
sudo -u nninfra HOME=/var/www/nninfra npx prisma generate >/dev/null

echo "==> Migrating"
sudo -u nninfra HOME=/var/www/nninfra npx prisma migrate deploy

echo "==> Syncing the permission catalogue"
sudo -u nninfra HOME=/var/www/nninfra pnpm perms:sync | tail -4

# The catalogue alone is not enough: a permission exists but no role holds it
# until the grants are recomputed. Without this, anything added since the last
# full seed is unreachable in production.
echo "==> Recomputing role grants"
sudo -u nninfra HOME=/var/www/nninfra pnpm perms:grants | tail -9

# Reference data Workforce and the Knowledge Base need to be usable. Idempotent,
# and it never touches users or passwords the way the full seed would.
echo "==> Seeding reference data"
sudo -u nninfra HOME=/var/www/nninfra pnpm seed:reference | tail -3

echo "==> Building"
sudo -u nninfra HOME=/var/www/nninfra NODE_OPTIONS="--max-old-space-size=3072" pnpm build >/dev/null

echo "==> Restarting"
pm2 restart nninfra --update-env >/dev/null
sleep 5

for i in 1 2 3 4 5 6; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1:3021/login || echo 000)
  if [ "$code" = "200" ]; then echo "==> Healthy (HTTP $code)"; exit 0; fi
  sleep 4
done

echo "!!! App did not come back healthy. Rolling back to $BEFORE"
sudo -u nninfra HOME=/var/www/nninfra git reset --hard --quiet "$BEFORE"
sudo -u nninfra HOME=/var/www/nninfra pnpm install --frozen-lockfile --silent
sudo -u nninfra HOME=/var/www/nninfra NODE_OPTIONS="--max-old-space-size=3072" pnpm build >/dev/null
pm2 restart nninfra --update-env >/dev/null
echo "    rolled back"
exit 1
