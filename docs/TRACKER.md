# SIEM Implementation Tracker

## Milestones

### Core Platform (PR-01 to PR-09)
- ✅ **PR-01 Storage/TTL** - Retention policies, compression, automatic cleanup
  - DoD: `storage:PASS` gate shows TTL enforcement
- ✅ **PR-02 Quarantine** - Invalid event isolation with reasons
  - DoD: `quarantine:PASS` gate with reason taxonomy
- ✅ **PR-03 Idempotency** - Exactly-once delivery guarantees
  - DoD: `idempotency:PASS` gate prevents duplicates
- ✅ **PR-04 Watermark/120s** - Rule scheduling with safety lag
  - DoD: `watermark:PASS` gate shows correct advance logic
- ✅ **PR-05 Redis/EPS** - Distributed locks and rate limiting
  - DoD: `redis:PASS` gate when REDIS_URL set
- ✅ **PR-06 Failure-mode/DR** - Circuit breakers, backups, chaos tests
  - DoD: `drill:PASS` gate survives outages
- ⏳ **PR-07 Search Safety** - Tenant isolation, time bounds, query limits
  - DoD: `search_safety:PASS` gate enforces all guards
- ✅ **PR-08 Parsers+Intel** - Normalization and threat enrichment
  - DoD: `parsers:PASS` gate shows normalized fields
- ✅ **PR-09 Free-text/Index** - Token search with highlighting
  - DoD: `fts:PASS` gate uses indexes

### Agent & Collector Platform (PR-12)
- ✅ **PR-12A Windows Agent Packaging & Hardening** - MSI/EXE, service, spool, proofs B1–B7
  - DoD: `agent_install_proof.ps1` hardening score ≥80%
  - DoD: `agent_offline_spool_proof.ps1` 0 loss, flush <180s, CPU <30%, RAM <250MB
  - DoD: `agent_perf_proof.ps1` 2000 EPS sustained, P95 <300ms
- ✅ **PR-12B Edge Collector Appliance** - syslog/HTTP listeners, filter/enrich/zstd, disk buffer, HA option
  - DoD: `collector_spool_proof.sh` 100k syslog no-loss
  - DoD: `collector_perf_proof.sh` 5k EPS on 2vCPU/4GB, CPU <70%, IO wait <10%
- ✅ **PR-12C Ledger & Gap Detection** - per-source seq + MV + zero-gap gate
  - DoD: `ledger_gap_proof.sh` zero gaps after WAN cut/restore
- ✅ **PR-12D Protocol Packs** - F5/PAN/Fortinet/Cisco/Zeek syslog → normalized fields
  - DoD: `protocol_packs_smoke.sh` 3 key fields normalized per pack
- ✅ **PR-12E Resilience** - disconnect, clock skew, disk-full chaos
  - DoD: `agent_resilience_test.sh` no crash, no loss, metrics clear

### Streaming Platform (PR-13)
- ✅ **PR-13A Kafka Stress & Rebalance** - DLQ, backpressure, lag control
  - DoD: `kafka_stress_proof.sh` zero gaps, <5% malformed quarantined, lag recovers
- ✅ **PR-13B Sizing & SLO Proofs** - agent/collector/Kafka performance envelopes  
  - DoD: `sizing_report.sh` all SLOs met, comprehensive sizing guidance

## Regression Gates

Current status after full implementation:

```
storage:PASS
quarantine:PASS
idempotency:PASS
watermark:PASS
redis:PASS            # when REDIS_URL set
drill:PASS            # PR-06
search_safety:PASS    # PR-07
parsers:PASS          # PR-08
fts:PASS              # PR-09
agents:PASS           # Basic agent functionality
ledger:PASS           # Zero-gap accounting
agents_install:PASS   # Windows hardening (if Windows)
agents_offline:PASS   # Windows offline resilience (if Windows)
agents_perf:PASS      # Windows performance (if Windows)
collector_spool:PASS  # Collector resilience
collector_perf:PASS   # Collector performance
kafka_stress:PASS     # Kafka stress test (when KAFKA_BROKERS set)
sizing:PASS           # Performance sizing validation
```

## Key Scripts

### Regression Testing
- `scripts/full_ms_regression.sh` - Single full regression run
- `scripts/full_ms_regression_loop.sh` - Run N times to ensure no flakes
- `scripts/flake_recheck.sh <gate>` - Re-run specific failed gate

### Agent & Collector Proofs
- **Basic Functionality**
  - `scripts/agents_enroll_proof.sh` - Test agent enrollment
  - `scripts/agents_heartbeat_proof.sh` - Test agent heartbeat
  - `scripts/agents_ingest_smoke.sh` - Test agent ingest
- **Production-Grade Windows**
  - `scripts/win/agent_install_proof.ps1` - Installation hardening verification
  - `scripts/win/agent_offline_spool_proof.ps1` - 10k events @ 200 EPS with WAN cut
  - `scripts/win/agent_perf_proof.ps1` - Sustained 2k EPS + burst validation
- **Production-Grade Collector**
  - `scripts/collector_spool_proof.sh` - 100k syslog with WAN cut
  - `scripts/collector_perf_proof.sh` - 5k EPS sustained performance
  - `scripts/protocol_packs_smoke.sh` - Protocol normalization test
- **Resilience & Accounting**
  - `scripts/ledger_gap_proof.sh` - Zero-gap sequence validation
  - `scripts/agent_resilience_test.sh` - Chaos scenarios
  - `scripts/collector_wizard.sh` - First-boot configuration

### Kafka Proofs
- `scripts/kafka_bootstrap.sh` - Start local Kafka
- `scripts/kafka_ingest_producer.sh` - Generate test events  
- `scripts/kafka_consume_proof.sh` - Verify consumption
- `scripts/kafka_stress_proof.sh` - 200k events with CH failures and rebalances

### Performance & Sizing
- `scripts/sizing_report.sh` - Comprehensive sizing report with SLO validation

## Configurations

### Agent Configs
- `config/agents/vector-windows-sysmon.toml` - Windows Sysmon
- `config/agents/vector-linux-journald.toml` - Linux journald
- `config/agents/vector-macos-files.toml` - macOS logs
- `config/agents/winlogbeat-sysmon.yml` - Winlogbeat option
- `config/agents/nxlog-sysmon.conf` - NXLog option
- `config/agents/windows-agent.toml` - Full Windows agent
- `config/agents/install-windows-agent.ps1` - Windows installer

### Collector Configs
- `config/collectors/edge-collector.toml` - Edge collector with syslog/HTTP

## Environment Variables

### Required
- `CLICKHOUSE_URL` - ClickHouse connection (default: http://localhost:8123)
- `EVENTS_TABLE` - Events table name (default: dev.events)

### Optional
- `REDIS_URL` - Redis for distributed features
- `KAFKA_BROKERS` - Kafka for streaming ingest
- `KAFKA_TOPIC` - Topic name (default: siem.events.v1)
- `KAFKA_GROUP_ID` - Consumer group (default: siem-v2)
- `SIEM_BASE_URL` - Base URL for agents/collectors
- `SIEM_DEBUG_SQL` - Enable SQL query logging

## Quick Start

```bash
# Apply all migrations
bash database_migrations/apply-migrations.sh

# Build and start API
bash scripts/restart_api.sh

# Run full regression until it's 100% green
bash scripts/full_ms_regression_loop.sh 10

# If any gate fails, check for flakes
bash scripts/flake_recheck.sh <failed_gate>

# Windows agent test (on Windows)
powershell -ExecutionPolicy Bypass -File scripts\agent_win_offline_proof.ps1

# Collector test
bash scripts/collector_spool_proof.sh
```

## Production Checklist

- [ ] All gates show PASS in regression
- [ ] Windows agent survives 30min disconnect
- [ ] Collector handles 5k EPS sustained
- [ ] Protocol packs normalize key fields
- [ ] Kafka consumer maintains stable lag
- [ ] Redis locks prevent duplicate rule runs
- [ ] Circuit breaker opens on CH outage
- [ ] Search enforces tenant isolation
- [ ] Free-text uses token index
- [ ] Metrics expose all key indicators
