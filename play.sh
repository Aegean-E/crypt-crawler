#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

PYTHON_BIN=""
if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
else
    echo "Error: Python 3 not found in PATH." >&2
    exit 1
fi

echo "============================================================"
echo " Starting Crypt-Crawler Web Server and Opening Browser...  "
echo "============================================================"
exec "$PYTHON_BIN" run.py --open
