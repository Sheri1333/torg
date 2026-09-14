#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/torg"
REPO="https://github.com/Sheri1333/torg.git"
BOT_TOKEN="8993813194:AAGpvPlStt7anqS3ElcN1QI6O36L0tTDJmE"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash deploy/setup-vps.sh"
  exit 1
fi

APP_USER="${SUDO_USER:-ubuntu}"

export DEBIAN_FRONTEND=noninteractive

echo "==> packages"
apt-get update -y
apt-get install -y ca-certificates curl gnupg git ufw

if [ ! -f /swapfile ]; then
  echo "==> 2G swap"
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if ! command -v node >/dev/null 2>&1; then
  echo "==> Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

if [ ! -d "$APP_DIR/.git" ]; then
  echo "==> clone repo"
  mkdir -p /var/www
  git clone "$REPO" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "==> writing $ENV_FILE"
  cat > "$ENV_FILE" <<EOF
BOT_TOKEN=$BOT_TOKEN
EOF
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

cat > /etc/sudoers.d/torg <<EOF
$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart torg-bot, /usr/bin/systemctl status torg-bot, /usr/bin/journalctl
EOF
chmod 440 /etc/sudoers.d/torg

cp "$APP_DIR/deploy/torg-bot.service" /etc/systemd/system/torg-bot.service
systemctl daemon-reload
systemctl enable torg-bot

echo "==> first deploy"
sudo -u "$APP_USER" -H bash "$APP_DIR/deploy/deploy.sh"
systemctl enable --now torg-bot

ufw allow OpenSSH
ufw --force enable

echo "==> ready: systemctl status torg-bot"
