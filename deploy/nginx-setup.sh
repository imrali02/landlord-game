#!/usr/bin/env bash
# One-time nginx setup, run on the VM by deploy/deploy.sh. Adds the
# /landlordgame/ proxy block to the haidery.dev site if it is missing.
set -euo pipefail
SITE=/etc/nginx/sites-available/haidery.dev
SNIPPET=/opt/landlordgame/deploy/nginx-landlordgame.conf

if grep -q 'location \^~ /landlordgame/' "$SITE"; then
  echo "nginx already configured"
  exit 0
fi

BACKUP="$SITE.bak-$(date +%Y%m%d%H%M%S)"
cp "$SITE" "$BACKUP"
# Insert the proxy block just before the first "listen 443" line (the HTTPS server block).
python3 - "$SITE" "$SNIPPET" <<'PY'
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
