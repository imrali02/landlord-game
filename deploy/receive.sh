#!/usr/bin/env bash
# Installs a Landlord release tarball read from stdin. Lives on the VM at
# /usr/local/sbin/landlordgame-receive.
#
# The GitHub Actions deploy key is pinned to this script in root's
# authorized_keys (`restrict,command="..."`), so that key can deploy the game
# and do nothing else. deploy/deploy.sh pipes into it the same way.
#
# On a failed health check the previous release is restored.
set -euo pipefail

APP=/opt/landlordgame
SELF=/usr/local/sbin/landlordgame-receive
MAX_BYTES=$((200 * 1024 * 1024))
HEALTH=http://127.0.0.1:3100/landlordgame/healthz

exec 9>/run/landlordgame-deploy.lock
flock -w 300 9 || { echo "another deploy is running" >&2; exit 1; }

STAGE="$(mktemp -d /opt/landlordgame-stage.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT

echo "==> Receiving release"
head -c "$MAX_BYTES" | tar xzf - -C "$STAGE" --no-same-owner
for f in dist/server.mjs dist/client/index.html package.json package-lock.json deploy/landlordgame.service; do
  [[ -f "$STAGE/$f" ]] || { echo "release is missing $f" >&2; exit 1; }
done

echo "==> Installing dependencies"
(cd "$STAGE" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
chown -R root:root "$STAGE"
chmod 755 "$STAGE"

id landlord >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin landlord

echo "==> Switching to new release"
rm -rf "$APP.prev"
[[ -d "$APP" ]] && mv "$APP" "$APP.prev"
mv "$STAGE" "$APP"
install -m 644 "$APP/deploy/landlordgame.service" /etc/systemd/system/landlordgame.service
systemctl daemon-reload
systemctl enable --quiet landlordgame
systemctl restart landlordgame

healthy=false
for _ in $(seq 1 20); do
  if curl -fsS "$HEALTH" >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 0.5
done

if ! $healthy; then
  echo "!! New release failed its health check; rolling back" >&2
  journalctl -u landlordgame --no-pager -n 30 >&2 || true
  if [[ -d "$APP.prev" ]]; then
    rm -rf "$APP"
    mv "$APP.prev" "$APP"
    install -m 644 "$APP/deploy/landlordgame.service" /etc/systemd/system/landlordgame.service
    systemctl daemon-reload
    systemctl restart landlordgame
  fi
  exit 1
fi

# Keep this script in sync with the release (rename is atomic, so the running copy is unaffected).
if [[ -f "$APP/deploy/receive.sh" ]]; then
  install -m 755 "$APP/deploy/receive.sh" "$SELF.new" && mv -f "$SELF.new" "$SELF"
fi

echo "==> Deployed $(cat "$APP/RELEASE" 2>/dev/null || echo 'release') — service healthy"
