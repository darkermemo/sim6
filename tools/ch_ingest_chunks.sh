#!/usr/bin/env bash
set -euo pipefail

FILE_PATH="${1:-}"
CH_URL="${2:-http://127.0.0.1:8123}"
TABLE="${3:-dev.events}"
CHUNK_LINES="${4:-5000}"

if [[ -z "${FILE_PATH}" || ! -f "${FILE_PATH}" ]]; then
  echo "Usage: $0 /path/to/jsonl [CH_URL] [TABLE] [CHUNK_LINES]" >&2
  exit 1
fi

WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"' EXIT

split -l "${CHUNK_LINES}" -a 5 -d "${FILE_PATH}" "${WORKDIR}/chunk_"

echo "Uploading chunks to ${CH_URL} into ${TABLE} ..."
COUNT=0
TOTAL=$(ls -1 "${WORKDIR}" | wc -l | tr -d ' ')
for f in "${WORKDIR}"/chunk_*; do
  ((COUNT=COUNT+1))
  RESP=$(mktemp)
  STATUS=$(curl -sS -o "${RESP}" -w "%{http_code}" "${CH_URL}/?query=INSERT%20INTO%20${TABLE}%20FORMAT%20JSONEachRow&input_format_skip_unknown_fields=1&max_insert_block_size=100000" --data-binary @"${f}")
  
  echo "[${COUNT}/${TOTAL}] status=${STATUS} file=$(basename "${f}")"
  if [[ "${STATUS}" != "200" ]]; then
    echo "--- ClickHouse error body ---" >&2
    cat "${RESP}" >&2 || true
    echo "-----------------------------" >&2
    exit 1
  fi
  rm -f "${RESP}"
done

echo "Done. Uploaded ${COUNT} chunks."
