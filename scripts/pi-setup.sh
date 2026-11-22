#!/bin/bash
# One-time setup for a Raspberry Pi 5 running Raspberry Pi OS (64-bit, with desktop).
# Do this at home on internet ONCE. After that the Pi never needs internet again.
#   git clone <repo> ~/bobcat-weightroom && cd ~/bobcat-weightroom && sudo ./scripts/pi-setup.sh
# What it does, in order:
#   1. Clock and time zone   2. Node.js 22   3. App in /opt, data in /var/lib/bobcat
#   4. USB backup stick       5. Start at boot  6. TV in full-screen kiosk mode
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo."; exit 1; }
DESKTOP_USER=${SUDO_USER:-pi}
SRC=$(cd "$(dirname "$0")/.." && pwd)

echo "== 1/6 Time zone =="
timedatectl set-timezone America/Chicago
echo "   The Pi 5 keeps time with power off ONLY with the RTC battery installed (official Raspberry Pi RTC battery, ~\$5)."

echo "== 2/6 Node.js 22 =="
if ! node -v 2>/dev/null | grep -qE '^v(2[2-9]|[3-9][0-9])'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
apt-get install -y rsync >/dev/null
node -v

echo "== 3/6 App files =="
id bobcat >/dev/null 2>&1 || useradd --system --home /var/lib/bobcat --shell /usr/sbin/nologin bobcat
mkdir -p /opt/bobcat-weightroom /var/lib/bobcat
rsync -a --delete --exclude data --exclude .git "$SRC/" /opt/bobcat-weightroom/
chown -R bobcat:bobcat /var/lib/bobcat

echo "== 4/6 USB backup stick =="
# Name the stick BOBCATBAK (on a Mac: Disk Utility > Erase > MS-DOS (FAT) > name BOBCATBAK).
mkdir -p /media/bobcat-usb
BOBCAT_UID=$(id -u bobcat); BOBCAT_GID=$(id -g bobcat)
grep -q 'LABEL=BOBCATBAK' /etc/fstab || echo "LABEL=BOBCATBAK /media/bobcat-usb auto nofail,x-systemd.automount,x-systemd.device-timeout=5,uid=$BOBCAT_UID,gid=$BOBCAT_GID,umask=002 0 0" >> /etc/fstab
systemctl daemon-reload
echo "   Backups go to /media/bobcat-usb/bobcat-backups every night. If the stick is missing, the coach page says so."

echo "== 5/6 Start at boot =="
cp /opt/bobcat-weightroom/scripts/bobcat.service /etc/systemd/system/bobcat.service
systemctl daemon-reload
systemctl enable --now bobcat
sleep 2
systemctl --no-pager --lines=5 status bobcat || true

echo "== 6/6 TV kiosk =="
raspi-config nonint do_blanking 1 || true   # never blank the TV
HOME_DIR=$(getent passwd "$DESKTOP_USER" | cut -d: -f6)
KIOSK="chromium-browser --kiosk --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble --check-for-update-interval=31536000 http://localhost:8080/tv"
command -v chromium-browser >/dev/null || KIOSK=${KIOSK/chromium-browser/chromium}
# labwc (Raspberry Pi OS since late 2024)
mkdir -p "$HOME_DIR/.config/labwc"
grep -qs 'localhost:8080/tv' "$HOME_DIR/.config/labwc/autostart" || echo "sleep 5 && $KIOSK &" >> "$HOME_DIR/.config/labwc/autostart"
# wayfire (older Bookworm images)
if [ -f "$HOME_DIR/.config/wayfire.ini" ] && ! grep -q 'localhost:8080/tv' "$HOME_DIR/.config/wayfire.ini"; then
  printf '\n[autostart]\nbobcat = sleep 5 && %s\n' "$KIOSK" >> "$HOME_DIR/.config/wayfire.ini"
fi
chown -R "$DESKTOP_USER": "$HOME_DIR/.config"

IP=$(hostname -I | awk '{print $1}')
echo
echo "Done. Reboot to test the TV: sudo reboot"
echo "Coach page: http://$IP:8080/coach   (give the Pi a fixed address on the router so this never changes)"
echo "To update later: git pull, then sudo ./scripts/pi-setup.sh again (it keeps the data)."
