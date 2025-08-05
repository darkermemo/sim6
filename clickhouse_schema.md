# 🗄️ ClickHouse Schema & Optimization Documentation

**Document:** ClickHouse Database Schema & Performance Optimization  
**Version:** 4.0 (Advanced Intelligence)  
**Date:** January 21, 2025  
**Status:** ✅ **PRODUCTION OPTIMIZED**

---

## 🎯 Schema Overview

### 📊 **Enhanced Event Schema**
The ClickHouse schema has been optimized to support all advanced parser features including ML intelligence and threat intelligence enrichment.

```sql
CREATE TABLE siem_events (
    -- Core Event Fields
    event_id String,
    tenant_id String,
    event_timestamp DateTime64(3),
    source_ip IPv4,
    destination_ip Nullable(IPv4),
    source_port Nullable(UInt16),
    destination_port Nullable(UInt16),
    protocol Nullable(String),
    event_type String,
    severity String,
    
    -- Extended Metadata
    source Nullable(String),
    message Nullable(String),
    device_vendor Nullable(String),
    device_product Nullable(String),
    user_name Nullable(String),
    
    -- ML Intelligence Fields
    ml_confidence_score Float32,
    ml_adjustment_reason String,
    ml_base_confidence String,
    parser_used String,
    parsing_confidence String,
    
    -- Threat Intelligence Fields
    threat_detected Bool,
    threat_score Float32,
    threat_risk_level String,
    threat_summary String,
    threat_category Nullable(String),
    threat_source_ip Nullable(String),
    
    -- Performance & Metadata
    processing_timestamp DateTime64(3) DEFAULT now64(),
    raw_data String,
    custom_fields Map(String, String),
    
    -- Indexing & Partitioning
    date_partition Date MATERIALIZED toDate(event_timestamp)
) ENGINE = MergeTree()
PARTITION BY date_partition
ORDER BY (tenant_id, event_timestamp, source_ip)
SETTINGS index_granularity = 8192;
```

---

## 🚀 Performance Optimizations

### 📈 **Indexing Strategy**

#### 1. **Primary Index**
```sql
ORDER BY (tenant_id, event_timestamp, source_ip)
```
- **Multi-tenant Support:** Efficient tenant isolation
- **Temporal Queries:** Optimized time-range searches
- **Source IP Lookups:** Fast security investigation queries

#### 2. **Secondary Indexes**
```sql
-- Threat Intelligence Index
ALTER TABLE siem_events ADD INDEX threat_idx threat_detected TYPE set(100) GRANULARITY 1;

-- ML Confidence Index  
ALTER TABLE siem_events ADD INDEX ml_confidence_idx ml_confidence_score TYPE minmax GRANULARITY 1;

-- Event Type Index
ALTER TABLE siem_events ADD INDEX event_type_idx event_type TYPE bloom_filter GRANULARITY 1;

-- Device Vendor Index
ALTER TABLE siem_events ADD INDEX vendor_idx device_vendor TYPE bloom_filter GRANULARITY 1;
```

#### 3. **Specialized Indexes for Security**
```sql
-- High-Risk Events Index
ALTER TABLE siem_events ADD INDEX high_risk_idx (threat_score > 7.0) TYPE set(10) GRANULARITY 1;

-- Malicious IP Index
ALTER TABLE siem_events ADD INDEX malicious_ip_idx threat_source_ip TYPE bloom_filter GRANULARITY 1;

-- Critical Severity Index  
ALTER TABLE siem_events ADD INDEX critical_idx (severity = 'critical') TYPE set(10) GRANULARITY 1;
```

### 🔧 **Partitioning Strategy**
```sql
PARTITION BY date_partition
```
- **Daily Partitions:** Efficient data lifecycle management
- **Query Performance:** Partition pruning for time-range queries
- **Data Retention:** Easy old data cleanup
- **Backup/Restore:** Granular data management

### 💾 **Compression & Storage**
```sql
-- Compression Settings
ALTER TABLE siem_events MODIFY SETTING compress_block_size = 65536;
ALTER TABLE siem_events MODIFY SETTING min_compress_block_size = 65536;
ALTER TABLE siem_events MODIFY SETTING max_compress_block_size = 1048576;

-- Column Compression
ALTER TABLE siem_events MODIFY COLUMN raw_data CODEC(ZSTD(3));
ALTER TABLE siem_events MODIFY COLUMN message CODEC(LZ4);
ALTER TABLE siem_events MODIFY COLUMN custom_fields CODEC(ZSTD(1));
```

---

## 📊 Advanced Analytics Support

### 🔍 **Materialized Views for Real-Time Analytics**

#### 1. **Threat Summary View**
```sql
CREATE MATERIALIZED VIEW threat_summary_mv
TO threat_summary_table
AS SELECT
    date_partition,
    tenant_id,
    threat_risk_level,
    threat_category,
    count() as event_count,
    avg(threat_score) as avg_threat_score,
    uniq(source_ip) as unique_source_ips
FROM siem_events
WHERE threat_detected = true
GROUP BY date_partition, tenant_id, threat_risk_level, threat_category;
```

#### 2. **ML Performance Metrics View**
```sql
CREATE MATERIALIZED VIEW ml_metrics_mv
TO ml_metrics_table  
AS SELECT
    date_partition,
    parser_used,
    parsing_confidence,
    count() as total_events,
    avg(ml_confidence_score) as avg_ml_score,
    countIf(ml_adjustment_reason LIKE '%upgrade%') as confidence_upgrades,
    countIf(ml_adjustment_reason LIKE '%downgrade%') as confidence_downgrades
FROM siem_events
GROUP BY date_partition, parser_used, parsing_confidence;
```

#### 3. **Security Metrics Dashboard View**
```sql
CREATE MATERIALIZED VIEW security_dashboard_mv
TO security_dashboard_table
AS SELECT
    toStartOfHour(event_timestamp) as hour_bucket,
    tenant_id,
    count() as total_events,
    countIf(threat_detected) as threat_events,
    countIf(threat_score >= 7.0) as high_risk_events,
    countIf(threat_score >= 3.0 AND threat_score < 7.0) as medium_risk_events,
    uniq(source_ip) as unique_source_ips,
    uniqIf(source_ip, threat_detected) as unique_threat_ips
FROM siem_events
GROUP BY hour_bucket, tenant_id;
```

### 📈 **Performance Monitoring Views**
```sql
-- Parser Performance Analysis
CREATE VIEW parser_performance_v AS
SELECT
    parser_used,
    parsing_confidence,
    count() as events_processed,
    avg(ml_confidence_score) as avg_ml_enhancement,
    quantile(0.95)(length(raw_data)) as p95_event_size
FROM siem_events
WHERE event_timestamp >= now() - INTERVAL 24 HOUR
GROUP BY parser_used, parsing_confidence
ORDER BY events_processed DESC;

-- Threat Detection Effectiveness
CREATE VIEW threat_effectiveness_v AS
SELECT
    threat_risk_level,
    threat_category,
    count() as detections,
    avg(threat_score) as avg_score,
    min(threat_score) as min_score,
    max(threat_score) as max_score
FROM siem_events  
WHERE threat_detected = true
AND event_timestamp >= now() - INTERVAL 7 DAY
GROUP BY threat_risk_level, threat_category
ORDER BY detections DESC;
```

---

## 🔍 Query Optimization Patterns

### ⚡ **High-Performance Query Examples**

#### 1. **Security Investigation Queries**
```sql
-- Find all events from a suspicious IP
SELECT *
FROM siem_events
WHERE source_ip = '185.220.100.240'
AND event_timestamp >= now() - INTERVAL 24 HOUR
ORDER BY event_timestamp DESC;

-- Threat correlation analysis
SELECT 
    threat_category,
    threat_risk_level,
    count() as events,
    uniq(source_ip) as unique_ips,
    avg(threat_score) as avg_score
FROM siem_events
WHERE threat_detected = true
AND date_partition >= today() - 7
GROUP BY threat_category, threat_risk_level
ORDER BY events DESC;
```

#### 2. **ML Performance Analysis**
```sql
-- ML enhancement effectiveness
SELECT
    parser_used,
    parsing_confidence,
    count() as total_events,
    avg(ml_confidence_score) as avg_enhancement,
    countIf(ml_adjustment_reason LIKE '%upgrade%') / count() * 100 as upgrade_rate
FROM siem_events
WHERE date_partition = today()
GROUP BY parser_used, parsing_confidence
ORDER BY total_events DESC;

-- Parser accuracy trends
SELECT
    toStartOfDay(event_timestamp) as day,
    parser_used,
    avg(ml_confidence_score) as daily_avg_confidence,
    count() as daily_events
FROM siem_events
WHERE date_partition >= today() - 30
GROUP BY day, parser_used
ORDER BY day DESC, daily_events DESC;
```

#### 3. **Real-Time Monitoring Queries**
```sql
-- Current threat activity (last hour)
SELECT
    threat_risk_level,
    count() as current_threats,
    uniq(source_ip) as threat_sources,
    max(threat_score) as max_threat_score
FROM siem_events  
WHERE threat_detected = true
AND event_timestamp >= now() - INTERVAL 1 HOUR
GROUP BY threat_risk_level
ORDER BY current_threats DESC;

-- High-confidence parsing events
SELECT
    parser_used,
    count() as high_confidence_events,
    avg(ml_confidence_score) as avg_ml_score
FROM siem_events
WHERE parsing_confidence IN ('High', 'VeryHigh')
AND event_timestamp >= now() - INTERVAL 1 HOUR  
GROUP BY parser_used
ORDER BY high_confidence_events DESC;
```

---

## 🏗️ Schema Evolution & Migration

### 📊 **Schema Versioning**
```sql
-- Schema version tracking
CREATE TABLE schema_version (
    version String,
    applied_date DateTime,
    description String
) ENGINE = Log;

INSERT INTO schema_version VALUES 
('4.0', now(), 'Enhanced schema with ML and threat intelligence support');
```

### 🔄 **Migration Scripts**
```sql
-- Add new ML intelligence columns (if upgrading from v3.x)
ALTER TABLE siem_events ADD COLUMN ml_confidence_score Float32 DEFAULT 0.0;
ALTER TABLE siem_events ADD COLUMN ml_adjustment_reason String DEFAULT '';
ALTER TABLE siem_events ADD COLUMN ml_base_confidence String DEFAULT 'Unknown';

-- Add threat intelligence columns  
ALTER TABLE siem_events ADD COLUMN threat_detected Bool DEFAULT false;
ALTER TABLE siem_events ADD COLUMN threat_score Float32 DEFAULT 0.0;
ALTER TABLE siem_events ADD COLUMN threat_risk_level String DEFAULT 'None';
ALTER TABLE siem_events ADD COLUMN threat_summary String DEFAULT '';
ALTER TABLE siem_events ADD COLUMN threat_category Nullable(String);
ALTER TABLE siem_events ADD COLUMN threat_source_ip Nullable(String);

-- Update indexes for new columns
ALTER TABLE siem_events ADD INDEX ml_idx ml_confidence_score TYPE minmax GRANULARITY 1;
ALTER TABLE siem_events ADD INDEX threat_idx threat_detected TYPE set(100) GRANULARITY 1;
```

### 📈 **Backward Compatibility**
- **Default Values:** All new columns have sensible defaults
- **Nullable Fields:** Optional threat intelligence fields are nullable
- **Index Addition:** New indexes added without affecting existing queries
- **View Updates:** Materialized views updated to include new fields

---

## 🔧 Performance Tuning Guidelines

### ⚡ **Query Optimization Best Practices**

#### 1. **Index Usage**
- **Always filter by tenant_id first** for multi-tenant deployments
- **Use time ranges** to leverage partition pruning
- **Include source_ip in WHERE clauses** for security investigations

#### 2. **Aggregation Optimization**
```sql
-- Efficient threat aggregation
SELECT 
    threat_risk_level,
    count() as events
FROM siem_events  
WHERE tenant_id = 'acme_corp'
AND date_partition >= today() - 7
AND threat_detected = true
GROUP BY threat_risk_level;

-- ML metrics aggregation
SELECT
    parser_used,
    quantile(0.5)(ml_confidence_score) as median_ml_score,
    quantile(0.95)(ml_confidence_score) as p95_ml_score
FROM siem_events
WHERE tenant_id = 'acme_corp'  
AND date_partition = today()
GROUP BY parser_used;
```

#### 3. **Memory Optimization**
```sql
-- Settings for large result sets
SET max_memory_usage = 10000000000;  -- 10GB for large analytics
SET max_bytes_before_external_group_by = 20000000000;  -- 20GB before disk
SET max_rows_to_group_by = 1000000;  -- Limit GROUP BY rows
```

### 📊 **Storage Optimization**

#### 1. **Data Lifecycle Management**
```sql
-- Partition cleanup (automated)
ALTER TABLE siem_events DROP PARTITION 'partition_older_than_90_days';

-- Optimize partitions (weekly maintenance)
OPTIMIZE TABLE siem_events PARTITION 'current_week' FINAL;
```

#### 2. **Compression Monitoring**
```sql
-- Check compression ratios
SELECT
    partition,
    formatReadableSize(sum(bytes_on_disk)) as compressed_size,
    formatReadableSize(sum(data_uncompressed_bytes)) as uncompressed_size,
    round(sum(data_uncompressed_bytes) / sum(bytes_on_disk), 2) as compression_ratio
FROM system.parts
WHERE table = 'siem_events'
GROUP BY partition
ORDER BY partition DESC;
```

---

## ✅ Schema Validation & Quality Assurance

### 🧪 **Schema Testing**
```sql
-- Validate schema constraints
SELECT 
    'Core fields populated' as test,
    count() as total_events,
    countIf(event_id != '') as valid_event_ids,
    countIf(tenant_id != '') as valid_tenant_ids,
    countIf(source_ip != '0.0.0.0') as valid_source_ips
FROM siem_events
WHERE date_partition = today();

-- ML enhancement validation
SELECT
    'ML enhancement working' as test,
    count() as total_events,
    countIf(ml_confidence_score > 0) as ml_enhanced_events,
    avg(ml_confidence_score) as avg_ml_score
FROM siem_events  
WHERE date_partition = today();

-- Threat intelligence validation
SELECT
    'Threat intelligence active' as test,
    count() as total_events,
    countIf(threat_detected) as threat_events,
    countIf(threat_score > 0) as scored_threat_events
FROM siem_events
WHERE date_partition = today();
```

### 📊 **Performance Monitoring**
```sql
-- Query performance metrics
SELECT
    query,
    count() as executions,
    avg(query_duration_ms) as avg_duration_ms,
    max(query_duration_ms) as max_duration_ms
FROM system.query_log
WHERE event_date = today()
AND query LIKE '%siem_events%'
GROUP BY query
ORDER BY executions DESC;
```

---

## 🎯 Schema Deployment Checklist

### ✅ **Pre-Deployment Validation**
- [ ] Schema syntax validation
- [ ] Index strategy verification  
- [ ] Compression settings optimization
- [ ] Materialized view creation
- [ ] Performance baseline establishment

### ✅ **Post-Deployment Verification**
- [ ] Data ingestion validation
- [ ] Query performance testing
- [ ] Index utilization monitoring
- [ ] Compression ratio verification
- [ ] Materialized view population

### ✅ **Monitoring Setup**
- [ ] Performance metrics dashboards
- [ ] Storage usage monitoring
- [ ] Query performance alerting
- [ ] Data quality validation
- [ ] Backup/restore verification

---

**🌟 ClickHouse Schema Status: PRODUCTION OPTIMIZED - January 21, 2025**

*Enterprise-grade schema design with advanced intelligence support and optimal performance characteristics.*