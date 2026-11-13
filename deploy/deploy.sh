#!/usr/bin/env bash
# Manual deploy from your machine to the HaideryNet VM (pushes to main deploy
# automatically via .github/workflows/deploy.yml; use this for hotfixes or
# first-time setup).
#   bash deploy/deploy.sh            (uses root@89.117.67.35)
#   DEPLOY_HOST=root@haidery.dev bash deploy/deploy.sh
# Safe to re-run. nginx is only edited the first time (with a backup and an
# `nginx -t` check).
set -euo pipefail

HOST="${DEPLOY_HOST:-root@89.117.67.35}"
cd "$(dirname "$0")/.."

echo "==> Building"
npm run build

echo "==> Packaging"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "$(git rev-parse --short HEAD 2>/dev/null || echo local)$(git diff --quiet 2>/dev/null || echo '+dirty') (manual)" > RELEASE
tar czf "$TMP/landlordgame.tgz" dist package.json package-lock.json deploy RELEASE
rm -f RELEASE

echo "==> Installing receive script on $HOST"
ssh "$HOST" 'cat > /usr/local/sbin/landlordgame-receive.new && chmod 755 /usr/local/sbin/landlordgame-receive.new && mv -f /usr/local/sbin/landlordgame-receive.new /usr/local/sbin/landlordgame-receive' < deploy/receive.sh

echo "==> Deploying"
ssh "$HOST" /usr/local/sbin/landlordgame-receive < "$TMP/landlordgame.tgz"

echo "==> Checking nginx"
ssh "$HOST" 'bash -s' < deploy/nginx-setup.sh

echo "==> Checking https://haidery.dev/landlordgame/"
curl -fsS -o /dev/null -w "HTTP %{http_code}\n" https://haidery.dev/landlordgame/
