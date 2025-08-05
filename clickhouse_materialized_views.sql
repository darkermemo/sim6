-- Create materialized views for performance monitoring and analytics

-- Parser performance monitoring view
CREATE MATERIALIZED VIEW IF NOT EXISTS dev.parser_performance
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(event_hour)  
ORDER BY (event_hour, source_type, parsing_status)
AS SELECT
    toStartOfHour(FROM_UNIXTIME(ingestion_timestamp)) as event_hour,
    source_type,
    parsing_status,
    count() as events_processed,
    countIf(parse_error_msg != '') as events_with_errors,
    avg(ingestion_timestamp - event_timestamp) as avg_processing_delay_seconds
FROM dev.events
GROUP BY event_hour, source_type, parsing_status;

-- Hourly event statistics view
CREATE MATERIALIZED VIEW IF NOT EXISTS dev.events_hourly_stats
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(event_hour)
ORDER BY (tenant_id, event_hour, source_type, event_category)
AS SELECT
    tenant_id,
    toStartOfHour(FROM_UNIXTIME(event_timestamp)) as event_hour,
    source_type,
    event_category,
    event_outcome,
    parsing_status,
    count() as event_count,
    countIf(is_threat = 1) as threat_count,
    countIf(parsing_status != 'success') as parse_error_count,
    uniqIf(source_ip, source_ip != '') as unique_source_ips,
    uniqIf(dest_ip, dest_ip != '') as unique_dest_ips,
    uniqIf(user, user != '') as unique_users
FROM dev.events
GROUP BY tenant_id, event_hour, source_type, event_category, event_outcome, parsing_status;

-- Threat intelligence summary view
CREATE MATERIALIZED VIEW IF NOT EXISTS dev.threat_summary
ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(event_hour)
ORDER BY (tenant_id, threat_category, threat_name, source_ip)
AS SELECT
    tenant_id,
    toStartOfHour(FROM_UNIXTIME(event_timestamp)) as event_hour,
    ifNull(threat_category, 'unknown') as threat_category,
    ifNull(threat_name, 'unknown') as threat_name,
    source_ip,
    ifNull(dest_ip, '') as dest_ip,
    count() as occurrence_count,
    max(event_timestamp) as last_seen,
    min(event_timestamp) as first_seen,
    groupUniqArrayIf(signature_name, signature_name != '') as signatures,
    groupUniqArrayIf(rule_name, rule_name != '') as rules
FROM dev.events
WHERE is_threat = 1
GROUP BY tenant_id, event_hour, threat_category, threat_name, source_ip, dest_ip;