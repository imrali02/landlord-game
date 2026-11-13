#!/usr/bin/env bash
# Build locally and deploy to the HaideryNet VM.
#   bash deploy/deploy.sh            (uses root@89.117.67.35)
#   DEPLOY_HOST=root@haidery.dev bash deploy/deploy.sh
# Safe to re-run: it replaces the app, restarts the service, and only edits
# nginx the first time (with a backup and `nginx -t` check).
set -euo pipefail

HOST="${DEPLOY_HOST:-root@89.117.67.35}"
cd "$(dirname "$0")/.."

echo "==> Building"
npm run build

echo "==> Packaging"
PKG="$(mktemp -d)/landlordgame.tgz"
tar czf "$PKG" dist package.json package-lock.json deploy

echo "==> Uploading to $HOST"
scp -q "$PKG" "$HOST:/tmp/landlordgame.tgz"

echo "==> Installing on server"
ssh "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
APP=/opt/landlordgame
SITE=/etc/nginx/sites-available/haidery.dev

id landlord >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin landlord

mkdir -p "$APP"
rm -rf "$APP/dist"
tar xzf /tmp/landlordgame.tgz -C "$APP"
rm -f /tmp/landlordgame.tgz
cd "$APP"
npm ci --omit=dev --no-audit --no-fund --loglevel=error
chown -R root:root "$APP"

install -m 644 "$APP/deploy/landlordgame.service" /etc/systemd/system/landlordgame.service
systemctl daemon-reload
systemctl enable --quiet landlordgame
systemctl restart landlordgame

if ! grep -q 'location \^~ /landlordgame/' "$SITE"; then
  BACKUP="$SITE.bak-$(date +%Y%m%d%H%M%S)"
  cp "$SITE" "$BACKUP"
  # Insert the proxy block just before the first "listen 443" line (the HTTPS server block).
  python3 - "$SITE" "$APP/deploy/nginx-landlordgame.conf" <<'PY'
import sys
site, snippet = sys.argv[1], sys.argv[2]
text = open(site).read()
block = "".join("    " + l if l.strip() else l for l in open(snippet).read().splitlines(True))
marker = "    listen 443 ssl;"
if marker not in text:
    sys.exit("could not find '%s' in %s" % (marker.strip(), site))
open(site, "w").write(text.replace(marker, block + "\n" + marker, 1))
PY
  if nginx -t 2>/dev/null; then
    systemctl reload nginx
    echo "nginx updated (backup: $BACKUP)"
  else
    cp "$BACKUP" "$SITE"
    nginx -t
    echo "nginx config test failed; restored backup" >&2
    exit 1
  fi
fi

sleep 1
systemctl is-active landlordgame
curl -fsS http://127.0.0.1:3100/landlordgame/healthz && echo
REMOTE

echo "==> Checking https://haidery.dev/landlordgame/"
curl -fsS -o /dev/null -w "HTTP %{http_code}\n" https://haidery.dev/landlordgame/
