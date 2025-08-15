# 🔬 SIEM Hard-Gate Proof Framework

## Overview
Binary pass/fail testing framework with zero wiggle room. Every requirement has an objective threshold - either PASS or FAIL.

## 🎯 Golden Rules

- **Reproducible**: Anyone can run on clean machine, get same result
- **Scripted**: Proofs are commands/scripts, no screenshots 
- **Binary**: Each requirement has objective threshold - PASS or FAIL
- **Artifacted**: Every proof stores machine output in versioned folder

## 🚀 Quick Start

```bash
# Check dependencies
make check-deps

# Run all proofs locally
make proofs

# Run in CI mode (strict)
make proofs-ci

# Run individual stages for debugging
make stage-env
make stage-api  
make stage-ui
```

## 📁 Proof Pack Structure

```
proofs/YYYYMMDD-HHMMZ-{git-sha}/
├── manifest.json           # Run metadata & thresholds
├── matrix.csv             # Requirement → artifact mapping
├── ci-report.md           # Human-readable summary
├── sys/                   # Environment & versions
├── ingest/               # Kafka/Redis/Agents
├── ch/                   # ClickHouse schema/perf
├── health/               # Health monitoring & SSE  
├── detections/           # DSL compiler & rules
├── sims/                 # Attack scenarios
├── ui/                   # Frontend tests
└── security/             # RBAC & tenancy
```

## 🛡️ Proof Stages (9 Gates)

### 1. Environment Probe
- **Requirements**: API/ClickHouse/UI reachable, versions captured
- **Artifacts**: `sys/env.json`, `sys/versions.json`, `sys/connectivity.json`
- **Pass Criteria**: All services respond within 5s

### 2. Ingest Pipeline  
- **Requirements**: Kafka lag <500, DLQ reprocess works, agent heartbeats <60s, parser success ≥97%
- **Artifacts**: `ingest/kafka-topics.json`, `ingest/consumer-lag.json`, `ingest/dlq-metrics.json`
- **Pass Criteria**: All thresholds met

### 3. ClickHouse
- **Requirements**: Schema unchanged, MVs running, projections exist, TTL active, P95 <1200ms
- **Artifacts**: `ch/tables.sql`, `ch/mv_status.json`, `ch/projections.txt`, `ch/perf_p95_ms.json`
- **Pass Criteria**: Performance SLOs met, no schema breaking changes

### 4. API Contract
- **Requirements**: All endpoints 200, SSE produces ≥30 events/30s, proxy-only routing
- **Artifacts**: `health/summary.json`, `health/stream.ndjson`, `ui/route-audit.json`
- **Pass Criteria**: Contract compliance, no direct backend calls from UI

### 5. Detections
- **Requirements**: DSL compiler 100% golden coverage, preview returns results, dedup works
- **Artifacts**: `detections/compiler-golden/diff.txt`, `detections/run-previews.json`  
- **Pass Criteria**: All DSL logic families compile to correct SQL

### 6. Attack Simulations
- **Requirements**: Generator produces fixtures, rules match within 60s, non-destructive
- **Artifacts**: `sims/runs/run-001/generator-log.json`, `sims/runs/run-001/detections.json`
- **Pass Criteria**: All logic families tested, detections fire

### 7. UI Functional
- **Requirements**: Search loads 100 events, Filter Builder works, Saved Filters CRUD, 0 console errors
- **Artifacts**: `ui/cypress-report.json`, `ui/lighthouse-report.json`, `ui/route-audit.json`
- **Pass Criteria**: All Cypress specs green, proxy-only routing

### 8. Security & Tenancy  
- **Requirements**: RBAC denies viewer access to admin routes, tenant isolation (0 cross-tenant results)
- **Artifacts**: `security/rbac-deny.json`, `security/tenancy-isolation.json`, `security/audit-log.ndjson`
- **Pass Criteria**: 403 denials, zero data leaks

### 9. Health & Autofix
- **Requirements**: Health summary complete, SSE ≤2s interval, diagnose finds issues, autofix plans exist
- **Artifacts**: `health/autofix_dryrun.json`, `health/diagnose_clickhouse.json`
- **Pass Criteria**: Monitoring works, auto-remediation ready

## 📊 Evidence Matrix

Requirements map to artifacts via `matrix.csv`:

| ID  | Requirement | Artifact | Check | Threshold |
|-----|-------------|----------|-------|-----------|
| A1  | Kafka lag <500 | `ingest/consumer-lag.json` | `all(lag<500)` | 500 |
| B5  | Execute P95<1200ms | `ch/perf_p95_ms.json` | `json.p95.execute<1200` | 1200 |
| F1  | Search loads 100 | `ui/cypress-report.json` | `hasSpec('load_100') && pass` | 1 |

## 🎯 Acceptance Thresholds

```json
{
  "parser_success_pct": 97,
  "execute_p95_ms": 1200,
  "aggs_p95_ms": 1500,  
  "kafka_lag_max": 500,
  "sse_interval_max_s": 2,
  "console_errors": 0
}
```

## 🚨 Brutal Exit Criteria

- **Any stage fails** → entire proof pack is FAIL
- **No partial accept** → 100% pass required
- **No hand testing** → must be captured via scripted artifact
- **No mocks in CI** → real services only

## 🔧 Development Workflow

### Local Development
```bash
# Quick API test
make stage-api

# UI development
make stage-ui

# Performance testing  
make stage-ch
```

### CI Integration
- **GitHub Actions**: `.github/workflows/proof-gate.yml`
- **Triggers**: Push to main/develop, PRs
- **Artifacts**: Uploaded as `siem-proof-pack-{sha}`
- **Blocking**: CI fails if any stage fails

### Debugging Failures
```bash
# Run proofs locally
make proofs

# Check specific proof directory
ls proofs/$(ls -1t proofs/ | head -1)/

# Read failure details
cat proofs/$(ls -1t proofs/ | head -1)/ci-report.md
```

## 📚 Related Documentation

- [DSL Specification](../docs/dsl-spec.md)
- [API Reference](../docs/api-spec.md)
- [Architecture](../docs/architecture.md) 
- [Runbook](../docs/runbook.md)

## 💡 Pro Tips

- **Run proofs frequently** during development
- **Use `make stage-*`** for faster iteration
- **Check artifacts** when debugging failures
- **Keep proof scripts simple** - complexity hides real issues
- **Update thresholds** as system matures, but commit to them

---

**The proof framework leaves no room for interpretation - it's PASS or FAIL, nothing in between.** 🎯
