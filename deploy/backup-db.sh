#!/bin/bash
# Daily database backup for nninfra.zapeat.in.
#
# Installed on the server beside deploy.sh, outside the checkout:
#   scp deploy/backup-db.sh    root@host:/var/www/nninfra/backup-db.sh
#   scp deploy/nninfra-backup.cron root@host:/etc/cron.d/nninfra-backup
#
# Run by cron as root every night. Safe to run by hand at any time:
#   sudo /var/www/nninfra/backup-db.sh
#
# Each run writes one compressed custom-format dump, proves it can be read back,
# and only then removes dumps older than the retention window — so a failing
# backup never deletes the last good one.
#
# Restore (into an empty database):
#   pg_restore --clean --if-exists --no-owner --dbname="<url>" /var/backups/nninfra/<file>.dump
set -euo pipefail

APP=/var/www/nninfra/app
DEST=${NNINFRA_BACKUP_DIR:-/var/backups/nninfra}
KEEP_DAYS=${NNINFRA_BACKUP_KEEP_DAYS:-14}

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

# DATABASE_URL from the app's environment file, without sourcing the whole file
# into this shell.
URL=$(grep -E '^DATABASE_URL=' "$APP/.env" | tail -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//')
if [ -z "$URL" ]; then
  log "!!! DATABASE_URL not found in $APP/.env — no backup taken"
  exit 1
fi

# Prisma adds ?schema=public, which libpq refuses as an unknown URI parameter.
# Every other query parameter (sslmode and the like) is kept.
URL=$(printf '%s' "$URL" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')

umask 077
mkdir -p "$DEST"
chmod 700 "$DEST"

STAMP=$(date '+%Y%m%d-%H%M%S')
FILE="$DEST/nninfra-$STAMP.dump"
PARTIAL="$FILE.partial"

log "==> Dumping to $FILE"
# Written under a .partial name and renamed only once complete, so a run killed
# half-way never leaves something that looks like a usable backup.
if ! pg_dump --format=custom --compress=9 --no-owner --dbname="$URL" --file="$PARTIAL"; then
  rm -f "$PARTIAL"
  log "!!! pg_dump failed — previous backups left untouched"
  exit 1
fi

# A dump that pg_restore cannot list is not a backup.
if ! pg_restore --list "$PARTIAL" > /dev/null; then
  rm -f "$PARTIAL"
  log "!!! Dump is unreadable — previous backups left untouched"
  exit 1
fi

TABLES=$(pg_restore --list "$PARTIAL" | grep -c ' TABLE DATA ' || true)
mv "$PARTIAL" "$FILE"
log "    $(du -h "$FILE" | cut -f1), $TABLES tables with data"

# Retention runs only after a verified dump exists, and never removes the
# newest file whatever its age.
NEWEST=$(ls -1t "$DEST"/nninfra-*.dump | head -1)
find "$DEST" -maxdepth 1 -name 'nninfra-*.dump' -type f -mtime "+$KEEP_DAYS" ! -path "$NEWEST" -print -delete \
  | sed 's/^/    removed /'
find "$DEST" -maxdepth 1 -name 'nninfra-*.dump.partial' -type f -mmin +180 -delete

log "==> Done. $(ls -1 "$DEST"/nninfra-*.dump | wc -l | tr -d ' ') backups kept in $DEST"
