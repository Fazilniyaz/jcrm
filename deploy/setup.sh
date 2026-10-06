#!/usr/bin/env bash
#
# First-time provisioning for a fresh Ubuntu 22.04/24.04 EC2 instance.
#
#   curl -fsSL .../setup.sh | bash          # or just run it after cloning
#
# Installs Node 20, nginx and PM2, clones nothing and configures nothing that
# needs a secret — the runbook walks you through the .env files afterwards,
# because this script should never be the place a password is typed.
#
# Safe to re-run.

set -euo pipefail

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

say "System packages"
sudo apt-get update -y
sudo apt-get install -y curl git nginx ufw

say "Node.js 20"
# The distro's nodejs is far too old; NodeSource is the vendor-supported route.
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v
npm -v

say "PM2"
sudo npm install -g pm2

say "Firewall"
# The app and API bind to loopback, so only 80 and 22 ever need to be open.
# This is belt and braces with the EC2 security group, not a replacement: the
# security group is the one that actually faces the internet.
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx HTTP'
sudo ufw --force enable
sudo ufw status

say "Done"
cat <<'NOTE'

Next, per the runbook:

  1. git clone both repos into $HOME
  2. write ~/jcrmbe/.env and ~/jcrm/.env.production
  3. cd ~/jcrmbe && npm ci && npm run build && npx prisma db push
  4. cd ~/jcrm   && npm ci && npm run build
  5. sudo cp ~/jcrm/deploy/jadvix-proxy-params /etc/nginx/jadvix-proxy-params
     sudo cp ~/jcrm/deploy/nginx.conf /etc/nginx/sites-available/jadvix
     sudo ln -sf /etc/nginx/sites-available/jadvix /etc/nginx/sites-enabled/jadvix
     sudo rm -f /etc/nginx/sites-enabled/default
     sudo nginx -t && sudo systemctl reload nginx
  6. pm2 start ~/jcrm/deploy/ecosystem.config.js && pm2 save
     pm2 startup       # run the command it prints, then `pm2 save` again

NOTE
