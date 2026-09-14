#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

exec 9>"$ROOT/.deploy.lock"
flock 9

echo "==> $(date -Iseconds) deploy in $ROOT"

git fetch origin
git checkout main
git pull --ff-only origin main

npm ci

if [ ! -f "$ROOT/.env" ]; then
  echo "Missing $ROOT/.env — create it before deploy"
  exit 1
fi

mkdir -p "$ROOT/.data"
sudo systemctl restart torg-bot

echo "==> status"
for i in $(seq 1 15); do
  if systemctl is-active --quiet torg-bot; then
    systemctl --no-pager --full status torg-bot | sed -n '1,20p'
    echo "==> done"
    exit 0
  fi
  sleep 2
done

echo "torg-bot did not become active"
systemctl --no-pager --full status torg-bot || true
journalctl -u torg-bot -n 50 --no-pager || true
exit 1
