/**
 * World-class SIEM detection compiler
 * Transforms rule specifications into optimized ClickHouse SQL
 * Uses proven patterns: windowFunnel, rolling aggregations, beaconing analysis
 */

import { 
  RuleSpec, SequenceRule, AbsenceRule, ChainRule, 
  RollingRule, RatioRule, FirstSeenRule, BeaconRule 
} from './types';

const SRC = 'siem_v3.events_norm';

const timeWhere = (t: RuleSpec['time']) =>
  t?.last_seconds
    ? `ts >= now() - INTERVAL ${t.last_seconds} SECOND`
    : `ts BETWEEN toDateTime64('${t!.from}',3) AND toDateTime64('${t!.to}',3)`;

const byKey = (by: string[]) => by.length ? by.join(', ') : 'tenant_id';

const limit = (n?: number) => `LIMIT ${n ?? 1000}`;

export function compile(spec: RuleSpec): { sql: string } {
  switch (spec.type) {
    case 'sequence': return { sql: compileSequence(spec) };
    case 'sequence_absence': return { sql: compileAbsence(spec) };
    case 'chain': return { sql: compileChain(spec) };
    case 'rolling_threshold': return { sql: compileRolling(spec) };
    case 'ratio': return { sql: compileRatio(spec) };
    case 'first_seen': return { sql: compileFirstSeen(spec) };
    case 'beaconing': return { sql: compileBeacon(spec) };
    default: throw new Error(`unsupported rule type: ${(spec as any).type}`);
  }
}

// --- Detection Templates ---

/**
 * Sequence Detection: A THEN B THEN C within time window
 * Uses ClickHouse windowFunnel for optimal performance
 * Example: 50 auth failures THEN 1 success within 3 minutes
 */
function compileSequence(r: SequenceRule): string {
  const T = timeWhere(r.time);
  const BY = byKey(['tenant_id', ...r.by]);
  const stages = r.stages.map((s,i) => `(${s.cond.sql})`).join(', ');
  const strict = r.strict ? `, ['${r.strict}']` : '';
  const repeatGuard = r.stages
    .map((s,i) => s.repeat_min ? `countIf(${s.cond.sql}) >= ${s.repeat_min}` : '1')
    .join(' AND ');
  
  return `
SELECT ${BY} AS entity_keys,
       min(ts) AS first_ts, max(ts) AS last_ts,
       count() AS total_events
FROM ${SRC}
WHERE tenant_id='${r.tenant_id}' AND ${T}
GROUP BY ${BY}
HAVING windowFunnel(${r.window_sec}${strict})(ts, ${stages}) = ${r.stages.length}
   AND ${repeatGuard}
ORDER BY last_ts DESC
${limit(r.emit?.limit)};`.trim();
}

/**
 * Absence Detection: A THEN NOT B within time window
 * Example: Password reset then NO MFA challenge within 10 minutes
 */
function compileAbsence(r: AbsenceRule): string {
  const T = timeWhere(r.time);
  const BY = byKey(['tenant_id', ...r.by]);
  
  return `
SELECT ${BY} AS entity_keys, 
       min(ts) AS a_ts,
       countIf(${r.a.sql}) AS a_count,
       countIf(${r.b.sql}) AS b_count
FROM ${SRC}
WHERE tenant_id='${r.tenant_id}' AND ${T}
GROUP BY ${BY}
HAVING windowFunnel(${r.window_sec})(ts, (${r.a.sql}), (${r.b.sql})) < 2
   AND countIf(${r.a.sql}) > 0
ORDER BY a_ts DESC
${limit(r.emit?.limit)};`.trim();
}

/**
 * Chain Detection: Ordered sequence A→B→C
 * Example: login → oauth_consent → mailbox_rule within 15 minutes
 */
function compileChain(r: ChainRule): string {
  const T = timeWhere(r.time);
  const BY = byKey(['tenant_id', ...r.by]);
  const stages = r.stages.map(s => `(${s.sql})`).join(', ');
  
  return `
SELECT ${BY} AS entity_keys, 
       min(ts) AS first_ts, max(ts) AS last_ts,
       ${r.stages.map((_, i) => `countIf(stage_${i+1}) AS stage_${i+1}_count`).join(', ')}
FROM (
  SELECT *, 
    ${r.stages.map((s, i) => `${s.sql} AS stage_${i+1}`).join(', ')}
  FROM ${SRC}
  WHERE tenant_id='${r.tenant_id}' AND ${T}
)
GROUP BY ${BY}
HAVING windowFunnel(${r.window_sec})(ts, ${stages}) = ${r.stages.length}
ORDER BY last_ts DESC
${limit(r.emit?.limit)};`.trim();
}

/**
 * Rolling Threshold: Moving window aggregation
 * Example: More than 100 auth failures in any 5-minute window
 */
function compileRolling(r: RollingRule): string {
  const T = timeWhere(r.time);
  const BY = byKey(['tenant_id', ...r.by]);
  
  return `
WITH b AS (
  SELECT ${BY}, toStartOfMinute(ts) AS bucket,
         count() AS c
  FROM ${SRC}
  WHERE tenant_id='${r.tenant_id}' AND ${T}
  GROUP BY ${BY}, bucket
)
SELECT ${BY} AS entity_keys, 
       max(bucket) AS bucket_end,
       sum(c) OVER (
         PARTITION BY ${BY} 
         ORDER BY bucket 
         RANGE BETWEEN ${Math.ceil(r.window_sec/60)} PRECEDING AND CURRENT ROW
       ) AS rolling
FROM b
WHERE ${r.expr.replace(/fails_5m|succ_5m|rolling/g, 'rolling')}
ORDER BY bucket_end DESC
${limit(r.emit?.limit)};`.trim();
}

/**
 * Ratio Detection: Compare two event types within buckets
 * Example: Authentication failure:success ratio > 20:1 per IP
 */
function compileRatio(r: RatioRule): string {
  const T = timeWhere(r.time);
  const BY = byKey(['tenant_id', ...r.by]);
  
  return `
SELECT ${BY} AS entity_keys, 
       toStartOfInterval(ts, INTERVAL ${r.bucket_sec} SECOND) AS bucket,
       countIf(${r.numerator.sql}) AS numerator,
       countIf(${r.denominator.sql}) AS denominator,
       countIf(${r.numerator.sql}) / countIf(${r.denominator.sql}) AS ratio
FROM ${SRC}
WHERE tenant_id='${r.tenant_id}' AND ${T}
GROUP BY ${BY}, bucket
HAVING denominator > 0 AND ratio > ${r.ratio_gt}
ORDER BY bucket DESC, ratio DESC
${limit(r.emit?.limit)};`.trim();
}

/**
 * First Seen Detection: New entities within horizon
 * Example: User login from never-before-seen country in past 180 days
 */
function compileFirstSeen(r: FirstSeenRule): string {
  const T = timeWhere(r.time);
  const BY = byKey(['tenant_id', ...r.by, r.entity]);
  const within = r.within ? `AND ${r.within.sql}` : '';
  
  return `
WITH baseline AS (
  SELECT DISTINCT ${BY}
  FROM ${SRC}
  WHERE tenant_id='${r.tenant_id}' 
    AND ts >= now() - INTERVAL ${r.horizon_days} DAY
    AND ts < now() - INTERVAL ${r.time.last_seconds || 3600} SECOND
    ${within}
),
recent AS (
  SELECT ${BY}, min(ts) AS first_ts, count() AS event_count
  FROM ${SRC}
  WHERE tenant_id='${r.tenant_id}' AND ${T} ${within}
  GROUP BY ${BY}
)
SELECT r.${BY.replace(/, /g, ', r.')} AS entity_keys,
       r.first_ts, r.event_count
FROM recent r
LEFT JOIN baseline b ON ${BY.split(', ').map(field => `r.${field} = b.${field}`).join(' AND ')}
WHERE ${BY.split(', ').map(field => `b.${field}`).join(' IS NULL AND ')} IS NULL
ORDER BY first_ts DESC
${limit(r.emit?.limit)};`.trim();
}

/**
 * Beaconing Detection: Periodic communication patterns
 * Example: C2 beaconing with low variance in timing (RSD < 0.2)
 */
function compileBeacon(r: BeaconRule): string {
  const T = timeWhere(r.time);
  const BY = byKey(['tenant_id', ...r.partition]);
  const where = r.where ? `AND ${r.where.sql}` : '';
  
  return `
WITH intervals AS (
  SELECT ${BY}, ts,
         ts - lagInFrame(ts) OVER (PARTITION BY ${BY} ORDER BY ts) AS interval_sec
  FROM ${SRC}
  WHERE tenant_id='${r.tenant_id}' AND ${T} ${where}
),
stats AS (
  SELECT ${BY}, 
         count() AS event_count,
         avg(interval_sec) AS avg_interval,
         stddevPop(interval_sec) AS stddev_interval,
         stddevPop(interval_sec) / avg(interval_sec) AS rsd,
         min(ts) AS first_ts,
         max(ts) AS last_ts
  FROM intervals
  WHERE interval_sec IS NOT NULL
  GROUP BY ${BY}
)
SELECT ${BY.replace(/, /g, ', ')} AS entity_keys,
       event_count, avg_interval, rsd,
       first_ts, last_ts
FROM stats
WHERE event_count >= ${r.min_events} AND rsd < ${r.rsd_lt}
ORDER BY rsd ASC, event_count DESC
${limit(r.emit?.limit)};`.trim();
}

/**
 * Validate rule specification before compilation
 */
export function validateRule(spec: RuleSpec): string[] {
  const errors: string[] = [];
  
  if (!spec.tenant_id) errors.push("tenant_id is required");
  if (!spec.time?.last_seconds && !(spec.time?.from && spec.time?.to)) {
    errors.push("time range is required (last_seconds or from/to)");
  }
  
  // Type-specific validations
  switch (spec.type) {
    case 'sequence':
      if (!spec.stages?.length) errors.push("sequence requires stages");
      break;
    case 'sequence_absence':
      if (!spec.a?.sql || !spec.b?.sql) errors.push("absence requires both a and b conditions");
      break;
    case 'chain':
      if (!spec.stages?.length) errors.push("chain requires stages");
      break;
    case 'rolling_threshold':
      if (!spec.expr) errors.push("rolling threshold requires expr");
      break;
    case 'ratio':
      if (!spec.numerator?.sql || !spec.denominator?.sql) {
        errors.push("ratio requires numerator and denominator");
      }
      break;
    case 'first_seen':
      if (!spec.entity) errors.push("first_seen requires entity field");
      break;
    case 'beaconing':
      if (!spec.partition?.length) errors.push("beaconing requires partition fields");
      break;
  }
  
  return errors;
}
