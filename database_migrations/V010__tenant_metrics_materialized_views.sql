-- V010: Tenant Metrics Materialized Views
-- Creates materialized views for tenant EPS statistics and parsing error tracking

-- Materialized view for tenant EPS (Events Per Second) per minute
CREATE MATERIALIZED VIEW IF NOT EXISTS dev.mv_tenant_eps
ENGINE = SummingMergeTree()
ORDER BY (tenant_id, toStartOfMinute(timestamp))
AS SELECT
    tenant_id,
    toStartOfMinute(timestamp) as minute_timestamp,
    count() as event_count,
    count() / 60.0 as eps
FROM dev.events
WHERE tenant_id != ''
GROUP BY tenant_id, toStartOfMinute(timestamp);

-- Materialized view for parsing errors per tenant/source/type
CREATE MATERIALIZED VIEW IF NOT EXISTS dev.mv_parser_errors
ENGINE = SummingMergeTree()
ORDER BY (tenant_id, log_source_id, parsing_status, toDate(timestamp))
AS SELECT
    tenant_id,
    log_source_id,
    parsing_status,
    toDate(timestamp) as date,
    count() as error_count,
    any(parse_error_msg) as sample_error_msg
FROM dev.events
WHERE log_source_id != '' AND parsing_status IN ('failed', 'partial')
GROUP BY tenant_id, log_source_id, parsing_status, toDate(timestamp);

-- Materialized view for tenant daily statistics summary
CREATE MATERIALIZED VIEW IF NOT EXISTS dev.mv_tenant_daily_stats
ENGINE = SummingMergeTree()
ORDER BY (tenant_id, toDate(timestamp))
AS SELECT
    tenant_id,
    toDate(timestamp) as date,
    count() as total_events,
    countIf(parsing_status = 'ok') as successful_parses,
    countIf(parsing_status = 'failed') as failed_parses,
    countIf(parsing_status = 'partial') as partial_parses,
    uniqExact(log_source_id) as active_log_sources,
    avg(if(parsing_status = 'ok', 1, 0)) as parse_success_rate
FROM dev.events
WHERE tenant_id != ''
GROUP BY tenant_id, toDate(timestamp);

-- Materialized view for log source type statistics per tenant
CREATE MATERIALIZED VIEW IF NOT EXISTS dev.mv_tenant_log_source_type_stats
ENGINE = SummingMergeTree()
ORDER BY (tenant_id, log_source_type, toDate(timestamp))
AS SELECT
    e.tenant_id,
    ls.type as log_source_type,
    ls.subtype as log_source_subtype,
    toDate(e.timestamp) as date,
    count() as event_count,
    countIf(e.parsing_status = 'failed') as parse_failures,
    avg(if(e.parsing_status = 'ok', 1, 0)) as parse_success_rate
FROM dev.events e
LEFT JOIN dev.log_sources ls ON e.log_source_id = ls.id AND e.tenant_id = ls.tenant_id
WHERE e.tenant_id != '' AND e.log_source_id != ''
GROUP BY e.tenant_id, ls.type, ls.subtype, toDate(e.timestamp);

-- Create a view for real-time tenant metrics (last 24 hours)
CREATE VIEW IF NOT EXISTS dev.v_tenant_metrics_24h AS
SELECT 
    tenant_id,
    sum(event_count) as total_events_24h,
    avg(eps) as avg_eps_24h,
    max(eps) as peak_eps_24h,
    count(DISTINCT toStartOfHour(minute_timestamp)) as active_hours
FROM dev.mv_tenant_eps
WHERE minute_timestamp >= now() - INTERVAL 24 HOUR
GROUP BY tenant_id;

-- Create a view for tenant parsing error summary (last 7 days)
CREATE VIEW IF NOT EXISTS dev.v_tenant_parsing_errors_7d AS
SELECT 
    tenant_id,
    log_source_id,
    parsing_status,
    sum(error_count) as total_errors_7d,
    any(sample_error_msg) as latest_error_msg,
    max(date) as last_error_date
FROM dev.mv_parser_errors
WHERE date >= today() - INTERVAL 7 DAY
GROUP BY tenant_id, log_source_id, parsing_status
ORDER BY total_errors_7d DESC;