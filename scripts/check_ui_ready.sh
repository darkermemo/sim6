#!/usr/bin/env bash
set -euo pipefail

echo "Waiting for UI to be ready..."
for i in {1..30}; do
    if curl -fsS http://127.0.0.1:5173/ui/app/ >/dev/null 2>&1; then
        echo "UI ready!"
        exit 0
    fi
    echo -n "."
    sleep 1
done
echo
echo "UI failed to start after 30 seconds"
exit 1
