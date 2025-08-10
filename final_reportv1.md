# SIEM System Final Report v1

**Generated:** 2025-08-09 20:20:40 UTC  
**Run ID:** 20250809-202040Z  
**Report Version:** 1.0  

## Table of Contents

1. [Run Information](#run-information)
2. [Git Metadata](#git-metadata)
3. [Artifacts Index](#artifacts-index)
4. [ClickHouse Schema Snapshot](#clickhouse-schema-snapshot)
5. [API Smoke Tests](#api-smoke-tests)
6. [Key Artifacts](#key-artifacts)
7. [SSE Test Summaries](#sse-test-summaries)
8. [Lint Status](#lint-status)
9. [Schema Parity](#schema-parity)
10. [Parsing Harness](#parsing-harness)
11. [Status Reports](#status-reports)
12. [Integration Reports](#integration-reports)

## Run Information

| Property | Value |
|----------|-------|
| Timestamp | 2025-08-09 20:20:40 UTC |
| Run ID | 20250809-202040Z |
| Hostname | Yassers-MacBook-Pro.local |
| User | yasseralmohammed |
| Working Directory | /Users/yasseralmohammed/sim6 |
| Shell | /bin/zsh |

### Git Metadata

| Property | Value |
|----------|-------|
| Branch | phase/a9-a10-incidents-investigator |
| Commit | 55ef2c5645ee3d4b76c88c1f6d02e4b815c76209 |
| Short Commit | 55ef2c5 |
| Tag | none |
| Dirty State | dirty |
| Last Commit Date | Fri Aug 8 18:46:20 2025 +0300 |
| Author | Yasser Al Mohammed <your-email@example.com> |

## Artifacts Index

### Test Artifacts Directory: target/test-artifacts

| File | Size (bytes) | SHA256 |
|------|--------------|--------|
| detect_gcp-audit.json | 103 | 3382b4399d7ce9d722995ce2e91be44a600807190a730b05d82a1ef1c3d9bc4c |
| detect_okta-system-log.json | 97 | c5cba4a26306a9db2f5e83d67af4a22e707b8e4d7d9c64f652d31e532d2d698f |
| detect_zeek-http.json | 81 | 613ddefd9e49dc91b3a0748d18162ce220b6bece0711462d1b71a70543dbf7f3 |
| final_reportv1.md | 6451 | 173554b35257113990e7bfd60342c8aa674fb66261561ac460f02aaeb7680d3d |
| health.json | 41 | a4453492d2b7a41d5ae4255894f9de7322f6490dee58316fa4fa3206c82d3081 |
| normalize_gcp-audit.json | 855 | 442171aea488ed64c8b893dc94c9902c8b3410e084d5101f757b54cf8749acf8 |
| normalize_okta-system-log.json | 807 | fe8bce177f7eb8890d42c228b99d4d0f1c1da68280d077ff9026c5bd3c724159 |
| normalize_zeek-http.json | 603 | 22b4b41c99bea52949e1270ed2947c2c198f41b1b0050d431ad262f3aaa0cdcb |
| parse_gate.err | 29 | 189253b4be87914e53bb3d1a58a7a7edfeaecb76020f70e563a857dc7909743e |
| parse_gate.json | 49 | b9f53cf0abbee229c2aeb1fbf50bc8d5ccd2ce49f7921f915a4ad7c7d423dd21 |
| parse_gate.ok | 30 | 9fc447b54bc22aa9ef92fea2ce38f0895a669ebb315bcf877b460491b827bb61 |
| parse_validate_cov_bad.txt | 3 | 420002158111bff8adb3347d84029e480f45e60e1869b454b6adac3345f9f7d4 |
| parse_validate_rows.txt | 180 | aad873f77d8449af737149bf52eb7c0d830347456b412596ee89a61d9477606d |
| parse_validate_summary.txt | 32 | fa98152a873570cbd95ddafc8d18dfe81315aa7b59bbcd00bc8fb505df082611 |
| parse_validate.txt | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| rule_ids.txt | 222 | c2bae9605d450163669970b1803105581f1110542fb659eca6f5a0057012081a |

### Reports Directory: reports

| File | Size (bytes) | SHA256 |
|------|--------------|--------|
| MISSING | MISSING | Directory reports does not exist |

### ClickHouse Schema Snapshot

#### Table Structure

```sql
-- ERROR: Could not describe dev.events table
```
**Status:** ERROR - Could not connect to ClickHouse or table does not exist

### API Smoke Tests

| Endpoint | Status | Response Time | Notes |
|----------|--------|---------------|-------|
| /dev | 200 | 10ms | ✅ OK |
| /dev/ | 404 | 9ms | ⚠️ HTTP 404 |
| /dev/events | 404 | 9ms | ⚠️ HTTP 404 |
| /dev/rules | 200 | 9ms | ✅ OK |
| /dev/metrics/live | 404 | 9ms | ⚠️ HTTP 404 |
| /dev/health | 404 | 9ms | ⚠️ HTTP 404 |
| /dev/metrics/eps | 404 | 9ms | ⚠️ HTTP 404 |
| /api/v1/health | 404 | 8ms | ⚠️ HTTP 404 |
| /api/v1/metrics?format=prometheus | 404 | 8ms | ⚠️ HTTP 404 |

## Key Artifacts

#### EPS Metrics

**Status:** MISSING - Expected at `target/test-artifacts/eps.json`

#### Health Check Results

**File:** `target/test-artifacts/health.json`

```
{"status":"ok","cidr_fn":"cidr_fallback"}```

#### E2E Health Metrics

**Status:** MISSING - Expected at `target/test-artifacts/e2e-health-metrics.json`

#### Search Sample Results

**Status:** MISSING - Expected at `target/test-artifacts/search_sample.json`

#### ClickHouse EPS Query

**Status:** MISSING - Expected at `target/test-artifacts/ch_eps_query.json`

## SSE Test Summaries

#### SSE Test Results

**Status:** MISSING - Expected at `target/test-artifacts/e2e-sse.json`

## Lint Status

### Rustfmt Check

```
Diff in /Users/yasseralmohammed/sim6/siem_tools/src/bin/gen.rs:1:
 fn main() {
     eprintln!("gen binary is deprecated; use `siem gen` instead");
[31m-} 
(B[m[32m+}
(B[m[32m+
(B[mDiff in /Users/yasseralmohammed/sim6/siem_tools/src/bin/kgen.rs:48:
 /// Generate a test event with the specified parameters
 fn generate_event(event_id: &str, tenant_id: &str, sequence: usize) -> Value {
     let now: DateTime<Utc> = Utc::now();
[31m-    
(B[m[32m+
(B[m     json!({
         "event_id": event_id,
         "tenant_id": tenant_id,
Diff in /Users/yasseralmohammed/sim6/siem_tools/src/bin/kgen.rs:95:
         .set("retry.backoff.ms", "100")
         .create()
         .context("Failed to create Kafka producer")?;
[31m-    
✅ Code formatting is correct
```

### Clippy Check

```
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.10s
✅ No clippy warnings
```

## Schema Parity

#### Expected ClickHouse Schema

**Status:** MISSING - Expected at `ch_schema_expected.json`

#### Actual ClickHouse Schema

**Status:** MISSING - Expected at `ch_schema_actual.json`

#### Schema Differences

**Status:** MISSING - Expected at `ch_schema_diff.json`

## Parsing Harness

#### Parse Metrics Summary

**Status:** MISSING - Expected at `parse_metrics_summary.tsv`

#### Parse Failure Samples

**Status:** MISSING - Expected at `parse_fail_samples.json`

## Status Reports

#### Current Status

**Status:** MISSING - Expected at `status.md`

## Integration Reports

#### Integration Status

**Status:** MISSING - Expected at `reports/integration_status.md`

#### Integration Findings

**Status:** MISSING - Expected at `reports/integration_findings.json`

#### Audit Completion Summary

**Status:** MISSING - Expected at `reports/audit_completion_summary.md`

## Changes Since Last Run

### Quick Indicators Comparison

Previous run indicators found - comparison would go here

---

**Report Generation Completed:** 2025-08-09 20:20:41 UTC  
**Total Artifacts Processed:** 16  
**Report Generator Version:** 1.0  
