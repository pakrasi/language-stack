#!/bin/sh
# Rebuilds assets/mark-processed.png with headless Chrome. Needs a local server:
#   python3 -m http.server 8766 --bind 127.0.0.1
set -e
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
"$CHROME" --headless=new --virtual-time-budget=15000 --dump-dom http://127.0.0.1:8766/scripts/build-mark.html 2>/dev/null \
  | sed -n 's/.*<textarea id="out">data:image\/png;base64,\([^<]*\)<\/textarea>.*/\1/p' \
  | base64 -d > assets/mark-processed.png
ls -l assets/mark-processed.png
