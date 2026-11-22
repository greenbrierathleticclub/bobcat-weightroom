#!/bin/bash
# Proof of concept on a Mac. Double-click won't work; run it from Terminal:
#   cd bobcat-weightroom && ./scripts/start-mac.sh
# First run loads 70 fake kids so every screen has something on it.
set -e
cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "Node isn't installed. Get the LTS installer (version 22 or newer) from https://nodejs.org and run this again."
  exit 1
fi
MAJOR=$(node -p 'process.versions.node.split(".")[0]')
MINOR=$(node -p 'process.versions.node.split(".")[1]')
if [ "$MAJOR" -lt 22 ] || { [ "$MAJOR" -eq 22 ] && [ "$MINOR" -lt 13 ]; }; then
  echo "Node $(node -v) is too old. Install 22.13 or newer from https://nodejs.org."
  exit 1
fi

if [ ! -f data/bobcat.db ]; then
  echo "First run: loading fake demo kids..."
  npm run --silent seed
fi

echo "Tip: tablets and phones on the same Wi-Fi can open the addresses below."
npm start
