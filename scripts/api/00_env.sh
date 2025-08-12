#!/usr/bin/env bash
set -Eeuo pipefail

# ---- Common env & helpers ----
BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://127.0.0.1:8123}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ART_DIR="$ROOT/siem_unified_pipeline/target/test-artifacts"
mkdir -p "$ART_DIR"

note(){ printf '[api] %s\n' "$*"; }
fail(){ echo "❌ $*" >&2; exit 1; }

need_bin(){ command -v "$1" >/dev/null 2>&1 || fail "Missing required binary: $1"; }
need_bin curl
need_bin jq

save(){ # save <file> <json-string-or-raw>
  local f="$1"; shift
  printf '%s\n' "$*" > "$f"
}

api(){ # api <path> [json body or empty]
  local path="$1"; shift || true
  local data="${1:-}"
  if [[ -n "$data" ]]; then
    curl -fsS -H 'content-type: application/json' -X POST "$BASE_URL$path" --data-binary "$data"
  else
    curl -fsS -H 'accept: application/json' "$BASE_URL$path"
  fi
}

api_put(){ # api_put <path> <json body>
  local path="$1"; shift
  local data="$1"
  curl -fsS -H 'content-type: application/json' -X PUT "$BASE_URL$path" --data-binary "$data"
}


