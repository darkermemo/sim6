# SIEM System Final Report v1

**Generated:** 2025-08-10 17:55:36 UTC  
**Run ID:** 20250810-175536Z  
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
| Timestamp | 2025-08-10 17:55:36 UTC |
| Run ID | 20250810-175536Z |
| Hostname | Yassers-MacBook-Pro.local |
| User | yasseralmohammed |
| Working Directory | /Users/yasseralmohammed/sim6 |
| Shell | /bin/zsh |

### Git Metadata

| Property | Value |
|----------|-------|
| Branch | feat/soak-runner |
| Commit | b4eb788f22b33b7f474b20035ba7c5a7c8cb6509 |
| Short Commit | b4eb788 |
| Tag | none |
| Dirty State | dirty |
| Last Commit Date | Sun Aug 10 14:05:09 2025 +0300 |
| Author | Yasser Al Mohammed <your-email@example.com> |

## Artifacts Index

### Test Artifacts Directory: target/test-artifacts

| File | Size (bytes) | SHA256 |
|------|--------------|--------|
| alerts_30m.txt | 2 | 06e9d52c1720fca412803e3b07c4b228ff113e303f4c7ab94665319d832bbfb7 |
| detect_gcp-audit.json | 103 | 3382b4399d7ce9d722995ce2e91be44a600807190a730b05d82a1ef1c3d9bc4c |
| detect_okta-system-log.json | 97 | c5cba4a26306a9db2f5e83d67af4a22e707b8e4d7d9c64f652d31e532d2d698f |
| detect_zeek-http.json | 81 | 613ddefd9e49dc91b3a0748d18162ce220b6bece0711462d1b71a70543dbf7f3 |
| final_reportv1.md | 33529 | adf2506bf815af9d6595e3a00ac6e16aa2f6c6fbb2b543d7cab7549dd02f5dac |
| ga_health.json | 75 | abe3a41128debdb4a4dab9bf3aa2170f9d55eba709e0733678e7d898f461b6f9 |
| health.json | 41 | 23d635d92f848b27f09c2a10a5d911de40b756b1dfd13325404dd4262139a7b0 |
| limits_put_open.json | 11 | 4062edaf750fb8074e7e83e0c9028c94e32468a8b6f1614774328ef045150f93 |
| limits_put_strict.json | 11 | 4062edaf750fb8074e7e83e0c9028c94e32468a8b6f1614774328ef045150f93 |
| limits_quota_out.txt | 708 | 58c1c4834d5a36093597d72abd8e91c2028257029f421c526d40b3d2810867c3 |
| metrics_key.txt | 143322 | 3fd7da1e6e6ceb1030494e9b33eab8cb7f8ac03a01fb82fd20079b31fd1b3c4f |
| normalize_gcp-audit.json | 855 | 706c1620e77f2353ea82f2a36d39531106c76b54dc752be2342cd13c005ba17d |
| normalize_okta-system-log.json | 807 | d4d5b8322207d440669e1a0baf7461d2aeab818c90d60a0a2e7a582bbb6522b8 |
| normalize_zeek-http.json | 603 | 474f4b086a449f217b89c91b0c9fb4501e0e6ab8beb2eabedf6e7929f326bfc1 |
| parse_gate.err | 29 | 189253b4be87914e53bb3d1a58a7a7edfeaecb76020f70e563a857dc7909743e |
| parse_gate.json | 49 | b9f53cf0abbee229c2aeb1fbf50bc8d5ccd2ce49f7921f915a4ad7c7d423dd21 |
| parse_gate.ok | 30 | 9fc447b54bc22aa9ef92fea2ce38f0895a669ebb315bcf877b460491b827bb61 |
| parse_validate_cov_bad.txt | 3 | 420002158111bff8adb3347d84029e480f45e60e1869b454b6adac3345f9f7d4 |
| parse_validate_rows.txt | 180 | aad873f77d8449af737149bf52eb7c0d830347456b412596ee89a61d9477606d |
| parse_validate_summary.txt | 32 | fa98152a873570cbd95ddafc8d18dfe81315aa7b59bbcd00bc8fb505df082611 |
| parse_validate.txt | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| q1.b | 27 | e3038378d05404ed2d9398a67b451ab06b2d465dbd9f78060404921e289cec0f |
| q1.h | 251 | 502fc9ccb2aa76cfb053315217dd1e12d3bd15cfc062f6aa0d88510d00753b26 |
| q2.b | 116 | 4d90985686b739e8f8c60e302143d5f5d5864310072ab6bd4aa34b4d4ddea1e2 |
| q2.h | 283 | a04d1de5739c57ab848229f83e30fff6a9d95db4de42719c604e089cdd0eb7ee |
| retention_check.json | 201 | 50a670832c6fbfbd2549e671b23bb745012dd4df70fb41489a3c75ddf6091100 |
| rule_compiled_create.json | 64 | 9ef1c195eb2c2ec44f9c949992b9a0cce1aa585205149a52272c9214a53e01a0 |
| rule_ids.txt | 222 | 0369fa3914312cb341fe0257494dc925c3471b418e7115fdc6d06b6db428eb37 |
| rule_sched_create.json | 64 | a9a815d4a2b2e1fb6060893ad6307be5b2e15c48764bca8edb5d72d817a2cfef |
| rule_sched_run1.json | 65 | 9b0d2364b52dda2520a124a32d7b5431d0e90cf5d33ce7a9e34ca154164eb305 |
| rule_sched_run2.json | 65 | 9b0d2364b52dda2520a124a32d7b5431d0e90cf5d33ce7a9e34ca154164eb305 |
| rules_total.txt | 4 | 1fc917c7ad66487470e466c0ad40ddd45b9f7730a4b43e1b2542627f0596bbdc |
| scheduler_idempotency.txt | 274 | c45836489ad053f84afc03fe702d41286ff7dfcd6565d4fe8aef650e72d883fe |
| env.txt | 53 | 6c70ddd761bbee7972dc679ce21367921ef904434202c2a3105a3a2337719685 |
| ev_last_hour.20250810-104113Z.txt | 83 | f87189e30eb1914d9ce54ce525b2c7a26126c8fc0e5401058df6b7e0d11b1307 |
| ing.codes.txt | 1288 | faab3aacb265a5ff118b4e531431d0155bf725939ab2ff82690c124bd9732332 |
| ing.last.json | 27 | 6718f92f5a86c1d7b60cf48d463c524709259fd31845a175dd6c707bb1a8b18b |
| limits_put.json | 11 | 4062edaf750fb8074e7e83e0c9028c94e32468a8b6f1614774328ef045150f93 |
| metrics.20250810-104113Z.txt | 296293 | 7becf7430b1e82a4ff362bf2f07c8fc5e385792de10116a3dbe2ef3fade63794 |
| rule_err.20250810-104113Z.txt | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| tenant_limits.json | 75 | e0448f37e92c835e4898ada1164671e2524af231aded1a280ff57794cb9155be |
| tenants_create.json | 81 | fa30f67b4ca0f1831ef0d56b24c26d3582416b99f3aeeefe045d63b833773627 |

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
| /dev/events | 404 | 10ms | ⚠️ HTTP 404 |
| /dev/rules | 200 | 10ms | ✅ OK |
| /dev/metrics/live | 404 | 10ms | ⚠️ HTTP 404 |
| /dev/health | 404 | 9ms | ⚠️ HTTP 404 |
| /dev/metrics/eps | 404 | 9ms | ⚠️ HTTP 404 |
| /api/v1/health | 404 | 9ms | ⚠️ HTTP 404 |
| /api/v1/metrics?format=prometheus | 404 | 10ms | ⚠️ HTTP 404 |

## Key Artifacts

#### EPS Metrics

**Status:** MISSING - Expected at `target/test-artifacts/eps.json`

#### Health Check Results

**File:** `target/test-artifacts/health.json`

```
{"status":"ok","cidr_fn":"IPv4CIDRMatch"}```

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
    Checking siem_tools v0.1.0 (/Users/yasseralmohammed/sim6/siem_tools)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.76s
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

## GA Snapshot

**Health:**
```json
{"status":"ok","cidr_fn":"IPv4CIDRMatch","ingest_path":"api","redis":"ok"}
```

**Counts (CH, 30m):**
```txt
alerts(last 30m): 0
rules(total):     0
```

**Metrics (key):**
```txt
siem_v2_ingest_total{outcome="ok",tenant="default"} 1
siem_v2_rate_limit_total{tenant="default"} 1
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="default"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_1"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_10"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_11"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_12"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_13"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_14"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_15"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_16"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_17"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_18"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_19"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_2"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_20"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_3"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_4"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_5"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_6"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_7"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_8"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_9"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_dev"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1059574219",run_id="-",tenant="tenant_smoke"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="default"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_1"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_10"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_11"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_12"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_13"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_14"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_15"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_16"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_17"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_18"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_19"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_2"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_20"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_3"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_4"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_5"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_6"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_7"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_8"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_9"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_dev"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1183192923",run_id="-",tenant="tenant_smoke"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="default"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_1"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_10"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_11"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_12"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_13"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_14"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_15"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_16"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_17"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_18"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_19"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_2"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_20"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_3"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_4"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_5"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_6"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_7"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_8"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_9"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_dev"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1308390557",run_id="-",tenant="tenant_smoke"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="default"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_1"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_10"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_11"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_12"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_13"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_14"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_15"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_16"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_17"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_18"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_19"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_2"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_20"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_3"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_4"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_5"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_6"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_7"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_8"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_9"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_dev"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1344372957",run_id="-",tenant="tenant_smoke"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="default"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_1"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_10"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_11"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_12"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_13"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_14"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_15"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_16"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_17"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_18"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_19"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_2"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_20"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_3"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_4"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_5"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_6"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_7"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_8"} 56
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_9"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_dev"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1436978061",run_id="-",tenant="tenant_smoke"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="default"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_1"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_10"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_11"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_12"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_13"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_14"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_15"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_16"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_17"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_18"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_19"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_2"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_20"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_3"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_4"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_5"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_6"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_7"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_8"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_9"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_dev"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1468054665",run_id="-",tenant="tenant_smoke"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="default"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_1"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_10"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_11"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_12"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_13"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_14"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_15"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_16"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_17"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_18"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_19"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_2"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_20"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_3"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_4"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_5"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_6"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_7"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_8"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_9"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_dev"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1486814338",run_id="-",tenant="tenant_smoke"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="default"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_1"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_10"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_11"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_12"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_13"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_14"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_15"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_16"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_17"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_18"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_19"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_2"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_20"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_3"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_4"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_5"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_6"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_7"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_8"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_9"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_dev"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1487263806",run_id="-",tenant="tenant_smoke"} 72
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1528951274",run_id="-",tenant="default"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1528951274",run_id="-",tenant="tenant_1"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1528951274",run_id="-",tenant="tenant_10"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1528951274",run_id="-",tenant="tenant_11"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1528951274",run_id="-",tenant="tenant_12"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1528951274",run_id="-",tenant="tenant_13"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1528951274",run_id="-",tenant="tenant_14"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1528951274",run_id="-",tenant="tenant_15"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1528951274",run_id="-",tenant="tenant_16"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1528951274",run_id="-",tenant="tenant_17"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1528951274",run_id="-",tenant="tenant_18"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1528951274",run_id="-",tenant="tenant_19"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1528951274",run_id="-",tenant="tenant_2"} 60
siem_v2_rules_run_total{error_reason="clickhouse",outcome="error",rule="1528951274",run_id="-",tenant="tenant_20"} 60
```
---

**Report Generation Completed:** 2025-08-10 17:55:38 UTC  
**Total Artifacts Processed:** 42  
**Report Generator Version:** 1.0  
