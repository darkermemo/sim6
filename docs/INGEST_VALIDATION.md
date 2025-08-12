# Ingest Validation and Quarantine

This document describes the validation and quarantine behavior for the `/api/v2/ingest/{ndjson,bulk,raw}` endpoints.

## Required Fields (per row)
- `tenant_id`: string or number
- `event_timestamp` (or `ts` which is normalized to `event_timestamp`): unix seconds (number) or RFC3339 string
- `message`: string

If a row is missing required fields or is malformed, it is quarantined, not inserted into `dev.events`.

## Quarantine Table
- `dev.events_quarantine(tenant_id, received_at, source, reason, payload)`
- Aggregation view: `dev.events_quarantine_agg(hour, reason, cnt)`

## Reasons
- `missing_tenant_id`
- `invalid_tenant_id`
- `missing_timestamp`
- `invalid_timestamp`
- `missing_message`
- `invalid_json`
- `oversized_payload`

## Response Shape
The endpoints respond with:
```json
{ "accepted": <n>, "quarantined": <m>, "reasons": { "missing_message": 1, ... } }
```

## Metrics
- `siem_v2_ingest_total{tenant, outcome="accepted|quarantined"}`
- `siem_v2_ingest_validation_total{reason}`
- Optional: `siem_v2_quarantine_backlog{database}`

## Proof Script
Run:
```bash
bash scripts/ingest_quarantine_proof.sh
```
Artifacts written to `target/test-artifacts/`:
- `quarantine_ingest_response.json`
- `quarantine_counts.tsv`
- `quarantine_tail.json`
- `quarantine_metrics.txt`
