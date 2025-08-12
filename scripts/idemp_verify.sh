#!/usr/bin/env bash
set -euo pipefail
ART=${ART:-target/test-artifacts}

pass() { printf "  ✓ %s\n" "$*"; }
fail() { printf "  ✗ %s\n" "$*"; exit 1; }

# 1) Replay response must be 200 + {"replayed":true}
[ -f "$ART/idemp_ingest_second.json" ] || fail "missing idemp_ingest_second.json"
grep -q '"replayed"\s*:\s*true' "$ART/idemp_ingest_second.json" || fail "ingest replay body missing {replayed:true}"
grep -q 'HTTP:200' "$ART/idemp_ingest_second.json" || fail "ingest replay not HTTP 200"
pass "ingest replay OK (200 + {replayed:true})"

# 2) Conflict must be 409 + error indicator (supports envelope or simple string)
[ -f "$ART/idemp_ingest_conflict.json" ] || fail "missing idemp_ingest_conflict.json"
if ! grep -Eq '"code"\s*:\s*"CONFLICT_ERROR"|"idempotency_conflict"' "$ART/idemp_ingest_conflict.json"; then
  fail "conflict body missing error indicator"
fi
grep -q 'HTTP:409' "$ART/idemp_ingest_conflict.json" || fail "conflict not HTTP 409"
pass "ingest conflict OK (409 + error)"

# 3) Table should show attempts ≥2 for demo-1 / ingest:ndjson
ATTEMPTS=$(clickhouse client -q "SELECT toInt32OrZero(any(attempts)) FROM dev.idempotency_keys WHERE key='demo-1' AND route='ingest:ndjson' ORDER BY first_seen_at DESC LIMIT 1 FORMAT TabSeparated" || echo 0)
[ "${ATTEMPTS:-0}" -ge 2 ] || fail "idempotency_keys attempts=$ATTEMPTS (need ≥2)"
pass "idempotency_keys recorded attempts=$ATTEMPTS"

echo "All idempotency checks PASS."
