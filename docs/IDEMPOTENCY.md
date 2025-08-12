# Idempotency Keys (Ingest and Run-Now)

## Header
- `Idempotency-Key: <opaque>` (optional). Missing/empty → no idempotency applied.
- Body hash: BLAKE3 over raw bytes; first 8 bytes little-endian as u64.
- Payload cap: 5 MiB; larger → HTTP 413 with `{ "error": "payload_too_large", "limit_bytes": 5242880 }`.

## Routes Covered
- `POST /api/v2/ingest/ndjson|bulk|raw` (hash over entire request body)
- `POST /api/v2/rules/:id/run-now` (hash over JSON body)

## Behavior
- First request (miss): proceed and write; record in `dev.idempotency_keys` with attempts=1.
- Replay (same key+route+hash): do not write; return 200 with:
  - Ingest: `{ "replayed": true, "accepted": 0, "quarantined": 0 }`
  - Run-now: `{ "replayed": true, "alerts_written": 0 }`
  - attempts increments.
- Conflict (same key+route, different hash): 409 with `{ "error": "idempotency_conflict" }` (no write, no row change).

## Metrics
- `siem_v2_idempotency_total{route,outcome="miss|replay|conflict"}`

## Proof
```bash
bash scripts/idempotency_proof.sh
```
Artifacts:
- `idemp_ingest_first.json`, `idemp_ingest_second.json`, `idemp_ingest_conflict.json`
- `idemp_run_first.json`, `idemp_run_second.json`
- `idemp_recent.json`, `idemp_metrics.txt`
