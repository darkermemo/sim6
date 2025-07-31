# Events V2 Schema Design Rationale

## Overview
This document explains the design decisions and rationale behind the events_v2 schema redesign, focusing on performance optimizations, data quality improvements, and future-proofing.

## Core Design Principles

### 1. Vectorized Scan Optimization
**Problem**: The original events table had suboptimal column ordering and data types that hindered ClickHouse's vectorized processing capabilities.

**Solution**:
- **UUID for tenant_id**: More efficient storage and comparison than String
- **LowCardinality(String) for event_category**: Reduces memory usage and improves compression for categorical data
- **IPv6 for IP addresses**: Native IP type enables efficient IP-based queries and range operations
- **Enum8 for compression_alg**: Compact storage for known compression algorithms
- **UInt types for metrics**: Optimal storage for numeric counters and measurements

### 2. Filter Push-Down Optimization
**Problem**: Complex WHERE clauses on the original schema couldn't leverage ClickHouse's filter push-down effectively.

**Solution**:
- **Partitioning by _partition (YYYYMM)**: Enables partition pruning for time-based queries
- **Ordering by (_partition, tenant_id, event_timestamp)**: Optimizes the most common query patterns
- **Bloom filter indexes**: Added for high-cardinality fields (IPs, users) to speed up exact match queries
- **MinMax index on raw_log_size**: Enables efficient range queries on log sizes
- **Set index on parsed_success**: Optimizes filtering by parsing status

### 3. Data Quality and Observability
**New Fields Added**:
- **raw_log_size**: Enables log size analysis and storage optimization
- **raw_log_hash**: Provides deduplication capabilities and data integrity verification
- **parsed_success**: Tracks parsing quality for monitoring and alerting
- **schema_version**: Enables backward compatibility during schema evolution
- **ingest_node**: Identifies processing nodes for debugging and load balancing
- **ingest_latency_ms**: Monitors pipeline performance

### 4. Compression and Storage Efficiency
**Compression Algorithm Tracking**:
- **compression_alg enum**: Tracks which compression was used for each log
- **Materialized view for compression stats**: Provides real-time compression effectiveness metrics
- **TTL policy**: Automatic data cleanup after 90 days (configurable)

## Performance Optimizations

### 1. Partitioning Strategy
```sql
PARTITION BY _partition  -- toYYYYMM(event_timestamp)
```
**Benefits**:
- Monthly partitions balance query performance with partition management overhead
- Enables efficient partition pruning for time-range queries
- Simplifies data lifecycle management (archival, deletion)

### 2. Ordering Key Design
```sql
ORDER BY (_partition, tenant_id, event_timestamp)
```
**Benefits**:
- **_partition first**: Ensures data locality within partitions
- **tenant_id second**: Enables efficient tenant isolation and multi-tenancy
- **event_timestamp third**: Optimizes time-series queries within tenant data

### 3. Materialized Views for Real-Time Analytics
**Hourly Statistics View**:
- Pre-aggregates common metrics (event counts, log sizes, latencies)
- Enables fast dashboard queries without scanning raw data
- Uses SummingMergeTree for automatic aggregation

**Compression Statistics View**:
- Tracks compression effectiveness across tenants
- Helps optimize storage and ingestion strategies

### 4. Index Strategy
**Bloom Filter Indexes**:
- Applied to high-cardinality fields (IPs, users, categories)
- Reduces false positives in WHERE clause evaluation
- Granularity of 1 for maximum precision

**Specialized Indexes**:
- MinMax on raw_log_size for efficient range queries
- Set index on parsed_success for binary flag filtering

## Backward Compatibility

### Schema Evolution Support
- **schema_version field**: Tracks data format versions
- **raw_event_json preservation**: Maintains original data for reprocessing
- **Separate table approach**: events_v2 coexists with original events table

### Migration Strategy
- Non-breaking deployment: New ingestion writes to events_v2
- API versioning: /api/v1/events_v2/search alongside existing endpoints
- Gradual migration: Backfill historical data in batches

## Monitoring and Observability

### Pipeline Health Metrics
- **ingest_latency_ms**: End-to-end processing time tracking
- **parsed_success**: Data quality monitoring
- **ingest_node**: Load distribution and node health

### Storage Optimization
- **raw_log_size**: Storage usage analysis
- **compression_alg**: Compression strategy effectiveness
- **raw_log_hash**: Deduplication opportunities

## Query Pattern Optimization

### Common Query Patterns Optimized
1. **Time-range + tenant filtering**: Leverages partition pruning and ordering key
2. **IP-based searches**: Native IPv6 type with bloom filter indexes
3. **Category filtering**: LowCardinality type with bloom filter
4. **Log size analysis**: MinMax index enables efficient range queries
5. **Data quality queries**: Set index on parsed_success

### Example Optimized Queries
```sql
-- Time-range query with partition pruning
SELECT * FROM events_v2 
WHERE tenant_id = '123e4567-e89b-12d3-a456-426614174000'
  AND event_timestamp BETWEEN '2025-01-01' AND '2025-01-31'
  AND event_category = 'Authentication';

-- Log size analysis
SELECT event_category, avg(raw_log_size), count()
FROM events_v2
WHERE raw_log_size > 10000
GROUP BY event_category;

-- Data quality monitoring
SELECT 
    toStartOfHour(event_timestamp) as hour,
    sum(parsed_success) / count() * 100 as success_rate
FROM events_v2
WHERE event_timestamp >= now() - INTERVAL 24 HOUR
GROUP BY hour
ORDER BY hour;
```

## Future-Proofing Considerations

### Extensibility
- **schema_version**: Enables gradual schema evolution
- **raw_event_json**: Preserves original data for future reprocessing
- **Flexible compression tracking**: Supports new compression algorithms

### Scalability
- **Efficient partitioning**: Supports high-volume ingestion
- **Optimized data types**: Minimizes storage footprint
- **Materialized views**: Pre-computed aggregations for fast analytics

### Operational Excellence
- **TTL policies**: Automatic data lifecycle management
- **Comprehensive indexing**: Supports diverse query patterns
- **Monitoring integration**: Built-in observability metrics