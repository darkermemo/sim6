#!/usr/bin/env bash
set -euo pipefail

# Free a TCP port by gracefully terminating any process listening on it,
# then force-killing if necessary.
# Usage: ./scripts/free_port.sh [PORT]

PORT="${1:-5174}"

echo "[free_port] Checking for listeners on TCP port ${PORT}..."
PIDS="$(lsof -n -i TCP:${PORT} -sTCP:LISTEN -t || true)"

if [ -z "${PIDS}" ]; then
  echo "[free_port] No process is listening on port ${PORT}."
  exit 0
fi

echo "[free_port] Found PID(s) on port ${PORT}:"
echo "${PIDS}"

for PID in ${PIDS}; do
  if ps -p "${PID}" >/dev/null 2>&1; then
    echo "[free_port] Sending SIGTERM to PID ${PID}..."
    kill "${PID}" || true
  fi
done

for i in 1 2 3 4 5; do
  sleep 1
  REMAINING="$(lsof -n -i TCP:${PORT} -sTCP:LISTEN -t || true)"
  if [ -z "${REMAINING}" ]; then
    echo "[free_port] Port ${PORT} is now free."
    exit 0
  fi
done

REMAINING="$(lsof -n -i TCP:${PORT} -sTCP:LISTEN -t || true)"
if [ -n "${REMAINING}" ]; then
  echo "[free_port] Forcing termination on remaining PID(s): ${REMAINING}"
  for PID in ${REMAINING}; do
    kill -9 "${PID}" || true
  done
  echo "[free_port] Port ${PORT} force-cleared."
fi

exit 0


