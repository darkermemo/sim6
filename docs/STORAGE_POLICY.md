# Storage Policy and TTL (siem_policy)

This document describes the ClickHouse storage policy used by SIEM v2 and how TTL moves old data to the `cold` volume.

## Volumes and Policy

- Volumes (created by migration V300):
  - `vol_hot` (local)
  - `vol_warm` (local)
  - `vol_cold` (local by default; S3 if configured)
- Storage policy: `siem_policy` with volumes order `('vol_hot','vol_warm','vol_cold')`.

## Tables

- `dev.events`: `storage_policy='siem_policy'` and TTL moves old parts to `cold`:
  - `ALTER TABLE dev.events MODIFY TTL event_dt + toIntervalDay(retention_days) TO VOLUME 'cold'`
- `dev.alerts`: `storage_policy='siem_policy'` and a conservative TTL:
  - `ALTER TABLE dev.alerts MODIFY TTL created_at + INTERVAL 365 DAY TO VOLUME 'cold'`

## Optional S3

If all of the following env vars are set, you can configure `vol_cold` to use S3:
- `CH_S3_ENDPOINT`
- `CH_S3_BUCKET`
- `CH_S3_ACCESS_KEY`
- `CH_S3_SECRET_KEY`

The migration can be extended to create a `TYPE = s3` volume with these settings. CI does not require S3; the default is all-local volumes.

## Proof Script

Run the storage policy proof to validate behavior and capture artifacts:

```bash
bash scripts/storage_policies_proof.sh
```

Artifacts are written to `target/test-artifacts/`:
- `ch_version.txt`
- `ch_storage_policies.txt`
- `ch_volumes.txt`
- `ch_tables_settings.txt`
- `ttl_probe_before.tsv`
- `ttl_probe_parts_before.tsv`
- `ttl_probe_after.tsv`
- `ttl_probe_parts_after.tsv`
- `verify_notes.txt`

The script creates a TTL probe table that moves parts to `cold` after 30 seconds, then captures before/after snapshots.

## CI Notes

- CI runs without S3 and expects local volumes.
- The TTL proof is timing-sensitive; if flakes occur, re-run locally or increase the wait time.
