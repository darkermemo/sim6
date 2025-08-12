#!/usr/bin/env bash
set -euo pipefail
ART=target/test-artifacts
GATE="${1:?gate name missing (e.g., watermark)}"
bash scripts/full_ms_regression.sh || true
if grep -q "^${GATE}:FAIL" "$ART/full_ms_summary.txt"; then
  echo "[recheck] gate=$GATE failed; re-running gate-only proof"
  case "$GATE" in
    storage) bash scripts/storage_policies_proof.sh ;;
    quarantine) bash scripts/ingest_quarantine_proof.sh ;;
    idempotency) bash scripts/idempotency_proof.sh ;;
    watermark) bash scripts/rules_watermark_proof.sh ;;
    redis) bash scripts/redis_lock_proof.sh && bash scripts/redis_rate_proof.sh ;;
    drill) bash scripts/chaos_ch_down.sh && bash scripts/backup_restore.sh ;;
    search_safety) bash scripts/search_safety_proof.sh ;;
    parsers) bash scripts/parsers_normalize_proof.sh && bash scripts/intel_enrich_proof.sh ;;
    fts) bash scripts/search_fts_proof.sh ;;
    agents) bash scripts/agents_enroll_proof.sh && bash scripts/agents_heartbeat_proof.sh && bash scripts/agents_ingest_smoke.sh ;;
    ledger) bash scripts/ledger_gap_proof.sh ;;
    agents_install) powershell -ExecutionPolicy Bypass -File scripts/win/agent_install_proof.ps1 ;;
    agents_offline) powershell -ExecutionPolicy Bypass -File scripts/win/agent_offline_spool_proof.ps1 ;;
    agents_perf) powershell -ExecutionPolicy Bypass -File scripts/win/agent_perf_proof.ps1 ;;
    collector_spool) bash scripts/collector_spool_proof.sh ;;
    collector_perf) bash scripts/collector_perf_proof.sh ;;
    kafka) bash scripts/kafka_bootstrap.sh && bash scripts/kafka_ingest_producer.sh && bash scripts/kafka_consume_proof.sh ;;
    kafka_stress) bash scripts/kafka_stress_proof.sh ;;
    sizing) bash scripts/sizing_report.sh ;;
    *) echo "Unknown gate $GATE"; exit 2 ;;
  esac
  echo "[recheck] gate re-run complete; check artifacts"
fi
