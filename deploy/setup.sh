#!/usr/bin/env bash
# Bootstrap a fresh Ubuntu/Debian server so Clipfetch runs at https://<DOMAIN>.
#
#   curl -fsSL https://raw.githubusercontent.com/shehankanchana12-art/Downloader/main/deploy/setup.sh | bash -s -- clipfetch.example.com
#
# Safe to re-run: it only installs what is missing and rebuilds the stack.
set -euo pipefail

DOMAIN="${1:-}"
REPO_URL="${REPO_URL:-https://github.com/shehankanchana12-art/Downloader.git}"
APP_DIR="${APP_DIR:-/opt/clipfetch}"

if [[ -z "$DOMAIN" ]]; then
  echo "usage: setup.sh <domain>" >&2
  echo "example: setup.sh clipfetch.example.com" >&2
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this as root (or with sudo)." >&2
  exit 1
fi

echo "==> Installing Docker engine if needed"
if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y --no-install-recommends ca-certificates curl git
  curl -fsSL https://get.docker.com | sh
else
  command -v git >/dev/null 2>&1 || { apt-get update && apt-get install -y --no-install-recommends git; }
fi

echo "==> Fetching the app into $APP_DIR"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch --depth 1 origin main
  git -C "$APP_DIR" reset --hard origin/main
else
  mkdir -p "$APP_DIR"
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
fi

echo "==> Writing $APP_DIR/deploy/.env"
printf 'DOMAIN=%s\n' "$DOMAIN" > "$APP_DIR/deploy/.env"

echo "==> Opening ports 80 and 443"
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
fi

echo "==> Building and starting (first build takes a few minutes)"
docker compose -f "$APP_DIR/deploy/docker-compose.prod.yml" up -d --build

IP="$(curl -fsS https://api.ipify.org || echo '<server-ip>')"
cat <<EOF

Done. Once $DOMAIN resolves to $IP (DNS A record) and port 443 is reachable,
open:

  https://$DOMAIN

Caddy issues the certificate on the first HTTPS request. Check progress with:

  docker compose -f $APP_DIR/deploy/docker-compose.prod.yml logs -f caddy
  docker compose -f $APP_DIR/deploy/docker-compose.prod.yml ps

Re-deploy after new commits by re-running this script.
EOF
