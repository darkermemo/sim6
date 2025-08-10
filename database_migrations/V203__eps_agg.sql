-- EPS aggregation structures
CREATE TABLE IF NOT EXISTS dev.tenant_eps_minute
(
  tenant_id String,
  ts_min DateTime,
  c AggregateFunction(count)
) ENGINE = AggregatingMergeTree()
ORDER BY (tenant_id, ts_min);

CREATE MATERIALIZED VIEW IF NOT EXISTS dev.mv_eps_minute
TO dev.tenant_eps_minute AS
SELECT tenant_id, toStartOfMinute(toDateTime(event_timestamp)) AS ts_min, countState() AS c
FROM dev.events
GROUP BY tenant_id, ts_min;


