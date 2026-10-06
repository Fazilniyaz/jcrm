#!/usr/bin/env bash
#
# Redeploy both services after a code change.
#
#   ~/jcrm/deploy/update.sh
#
# Safe to re-run. It pulls, reinstalls, rebuilds and reloads — in that order,
# because reloading before the build would briefly serve the old build from a
# process that has already been told it is new.

set -euo pipefail

API_DIR="${API_DIR:-$HOME/jcrmbe}"
APP_DIR="${APP_DIR:-$HOME/jcrm}"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

say "API: pulling"
cd "$API_DIR"
git pull --ff-only

say "API: installing and building"
# `npm ci` not `npm install`: it installs exactly the lockfile and fails if the
# two disagree, so a deploy can never silently pick up a different version.
npm ci
# `build` runs `prisma generate` before tsc, so the client always matches the
# schema that was just pulled.
npm run build

say "App: pulling"
cd "$APP_DIR"
git pull --ff-only

say "App: installing and building"
npm ci
# NEXT_PUBLIC_* are inlined at build time, so .env.production must exist BEFORE
# this runs. See the runbook.
npm run build

say "Reloading both"
# `reload` not `restart`: PM2 starts the replacement before retiring the old
# process, so there is no window where nginx has nothing to proxy to.
pm2 reload jadvix-api
pm2 reload jadvix-app

say "Status"
pm2 status

cat <<'NOTE'

If you changed prisma/schema.prisma, the database does not know yet:

    cd ~/jcrmbe && npx prisma db push

MongoDB has no migration files, so this is the only thing that creates new
collections and indexes.
NOTE
