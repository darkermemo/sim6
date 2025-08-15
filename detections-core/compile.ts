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
    // CHUNK 1: Advanced Detection Families
    case 'spike': return { sql: compileSpike(spec) };
    case 'spread': return { sql: compileSpread(spec) };
    case 'peer_out': return { sql: compilePeerOut(spec) };
    // CHUNK 2: Behavioral Detection Families
    case 'burst': return { sql: compileBurst(spec) };
    case 'time_of_day': return { sql: compileTimeOfDay(spec) };
    case 'travel': return { sql: compileTravel(spec) };
    case 'lex': return { sql: compileLex(spec) };
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
HAVING windowFunnel(${r.window_sec}${strict})(ts_uint32, ${stages}) = ${r.stages.length}
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
HAVING windowFunnel(${r.window_sec})(ts_uint32, (${r.a.sql}), (${r.b.sql})) < 2
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
HAVING windowFunnel(${r.window_sec})(ts_uint32, ${stages}) = ${r.stages.length}
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

// === CHUNK 1: Advanced Detection Compilers ===

/**
 * Spike Detection: Rate-of-change, z-score vs history
 * Example: Authentication failures spike above 3 standard deviations
 */
function compileSpike(r: SpikeRule): string {
  const T = timeWhere(r.time);
  const BY = byKey(['tenant_id', ...(r.by ?? [])]);

  return `
WITH b AS (
  SELECT ${BY},
         toStartOfInterval(ts, INTERVAL ${r.bucket_sec} SECOND) AS bkt,
         countIf(${r.metric.sql}) AS c
  FROM ${SRC}
  WHERE tenant_id='${r.tenant_id}' AND ${T}
  GROUP BY ${BY}, bkt
),
z AS (
  SELECT ${BY}, bkt, c,
         avg(c) OVER (PARTITION BY ${BY} ORDER BY bkt
           ROWS BETWEEN ${r.hist_buckets} PRECEDING AND 1 PRECEDING) AS mu,
         stddevPop(c) OVER (PARTITION BY ${BY} ORDER BY bkt
           ROWS BETWEEN ${r.hist_buckets} PRECEDING AND 1 PRECEDING) AS sigma
  FROM b
)
SELECT ${BY} AS entity_keys,
       bkt AS bucket_end,
       c AS current_value, mu AS baseline_avg, sigma AS baseline_stddev,
       (c - mu) / nullIf(sigma,0) AS z_score
FROM z
WHERE z_score >= ${r.z}
ORDER BY bucket_end DESC, z_score DESC
${limit(r.emit?.limit)};`.trim();
}

/**
 * Spread Detection: Distinct-count threshold in a window
 * Example: Same source IP touches ≥20 different users in 10 minutes
 */
function compileSpread(r: SpreadRule): string {
  const T = timeWhere(r.time);
  const BY = byKey(['tenant_id', ...(r.by ?? [])]);
  const where = r.where ? `AND (${r.where.sql})` : '';

  return `
SELECT ${BY} AS entity_keys,
       toStartOfInterval(ts, INTERVAL ${r.window_sec} SECOND) AS window_start,
       uniqExact(${r.target}) AS distinct_${r.target.replace(/[^a-zA-Z0-9]/g, '_')},
       count() AS total_events
FROM ${SRC}
WHERE tenant_id='${r.tenant_id}' AND ${T} ${where}
GROUP BY ${BY}, window_start
HAVING distinct_${r.target.replace(/[^a-zA-Z0-9]/g, '_')} >= ${r.min_distinct}
ORDER BY window_start DESC, distinct_${r.target.replace(/[^a-zA-Z0-9]/g, '_')} DESC
${limit(r.emit?.limit)};`.trim();
}

/**
 * Peer Outlier Detection: Entity vs peer p-percentile
 * Example: Downloads per hour above peer group 95th percentile
 */
function compilePeerOut(r: PeerOutlierRule): string {
  const T = timeWhere(r.time);
  const BY = byKey(['tenant_id', ...(r.by ?? [])]);

  return `
WITH bucketed AS (
  SELECT ${BY},
         ${r.peer_label_field} AS peer_label,
         toStartOfInterval(ts, INTERVAL ${r.bucket_sec} SECOND) AS bkt,
         sumIf(1, ${r.kpi.sql}) AS kpi_value
  FROM ${SRC}
  WHERE tenant_id='${r.tenant_id}' AND ${T}
  GROUP BY ${BY}, peer_label, bkt
),
peer_baseline AS (
  SELECT peer_label,
         quantileTDigest(${r.p})(kpi_value) AS peer_pctl,
         count() AS peer_observations
  FROM bucketed
  GROUP BY peer_label
)
SELECT b.${BY.replace(/, /g, ', b.')} AS entity_keys,
       b.peer_label, b.bkt AS bucket_end, 
       b.kpi_value, p.peer_pctl AS peer_${Math.round(r.p * 100)}th_percentile,
       p.peer_observations
FROM bucketed b
JOIN peer_baseline p USING (peer_label)
WHERE b.kpi_value > p.peer_pctl
ORDER BY bucket_end DESC, b.kpi_value DESC
${limit(r.emit?.limit)};`.trim();
}

// === CHUNK 2: Behavioral Detection Compilers ===

/**
 * Burst Detection: Short-term vs long-term activity ratio
 * Example: Process spawning 10x faster in 2min vs 10min baseline
 */
function compileBurst(r: BurstRule): string {
  const T = timeWhere(r.time);
  const BY = byKey(['tenant_id', ...(r.by ?? [])]);
  const where = r.where ? `AND (${r.where.sql})` : '';
  
  return `
WITH fast AS (
  SELECT ${BY}, toStartOfInterval(ts, INTERVAL ${r.bucket_fast_sec} SECOND) AS b,
         count() AS c_fast
  FROM ${SRC}
  WHERE tenant_id='${r.tenant_id}' AND ${T} ${where}
  GROUP BY ${BY}, b
),
slow AS (
  SELECT ${BY}, toStartOfInterval(ts, INTERVAL ${r.bucket_slow_sec} SECOND) AS b_slow,
         count() AS c_slow
  FROM ${SRC}
  WHERE tenant_id='${r.tenant_id}' AND ${T} ${where}
  GROUP BY ${BY}, b_slow
),
j AS (
  SELECT f.${BY.replace(/, /g, ', f.')}, f.b AS bucket_end, f.c_fast,
         anyLast(s.c_slow) AS c_slow
  FROM fast f
  LEFT JOIN slow s
    ON ${['tenant_id', ...(r.by ?? [])].map(k => `f.${k}=s.${k}`).join(' AND ')}
   AND s.b_slow <= f.b
  GROUP BY ${['f.'+(['tenant_id', ...(r.by ?? [])].join(', f.')), 'f.b', 'f.c_fast'].join(', ')}
)
SELECT ${['tenant_id', ...(r.by ?? [])].join(', ')} AS entity_keys,
       bucket_end, c_fast, c_slow, c_fast / nullIf(c_slow,0) AS ratio
FROM j
WHERE c_slow > 0 AND ratio >= ${r.ratio_gt}
ORDER BY bucket_end DESC, ratio DESC
${limit(r.emit?.limit)};`.trim();
}

/**
 * Time-of-Day Detection: Unusual activity during specific hours with Z-score
 * Example: Authentication activity during 2-4 AM above 3 standard deviations
 */
function compileTimeOfDay(r: TimeOfDayRule): string {
  const T = timeWhere(r.time);
  const BY = byKey(['tenant_id', ...(r.by ?? [])]);
  const where = r.where ? `AND (${r.where.sql})` : '';
  
  return `
WITH b AS (
  SELECT ${BY},
         toStartOfInterval(ts, INTERVAL ${r.bucket_sec} SECOND) AS bkt,
         toHour(ts) AS hr,
         count() AS c
  FROM ${SRC}
  WHERE tenant_id='${r.tenant_id}' AND ${T} ${where}
  GROUP BY ${BY}, bkt, hr
),
f AS (
  SELECT * FROM b WHERE hr BETWEEN ${r.hour_start} AND ${r.hour_end}
),
z AS (
  SELECT ${BY}, bkt, c,
         avg(c) OVER (PARTITION BY ${BY} ORDER BY bkt
           ROWS BETWEEN ${r.hist_buckets} PRECEDING AND 1 PRECEDING) AS mu,
         stddevPop(c) OVER (PARTITION BY ${BY} ORDER BY bkt
           ROWS BETWEEN ${r.hist_buckets} PRECEDING AND 1 PRECEDING) AS sigma
  FROM f
)
SELECT ${BY} AS entity_keys, bkt AS bucket_end, c AS current_value, 
       mu AS baseline_avg, sigma AS baseline_stddev,
       (c - mu) / nullIf(sigma,0) AS z_score
FROM z
WHERE z_score >= ${r.z}
ORDER BY bucket_end DESC, z_score DESC
${limit(r.emit?.limit)};`.trim();
}

/**
 * Travel Detection: Impossible travel patterns (geographic or speed-based)
 * Example: User authentication from different countries within 1 hour
 */
function compileTravel(r: TravelRule): string {
  const T = timeWhere(r.time);
  const BY_KEYS = ['tenant_id', ...(r.by ?? [])];
  const BY = byKey(BY_KEYS);
  const ipCol = r.src_ip_field ?? 'src_ip';
  
  // Country-only detection (no geo dicts needed)
  if (r.countries_only !== false && !r.speed_kmh_gt) {
    return `
WITH auth AS (
  SELECT ${BY}, ts,
         assumeNotNull(coalesce(
           parsed_fields['country'], 
           parsed_fields['geoip_country'],
           'UNKNOWN'
         )) AS country
  FROM ${SRC}
  WHERE tenant_id='${r.tenant_id}' AND ${T} 
    AND (event_type='auth' AND outcome='success')
),
w AS (
  SELECT ${BY}, ts, country,
         lagInFrame(ts) OVER (PARTITION BY ${BY} ORDER BY ts) AS prev_ts,
         lagInFrame(country) OVER (PARTITION BY ${BY} ORDER BY ts) AS prev_country
  FROM auth
)
SELECT ${BY} AS entity_keys, ts, prev_ts, country, prev_country,
       toUInt32(ts - prev_ts) AS dt_sec
FROM w
WHERE prev_ts IS NOT NULL
  AND country != prev_country
  AND country != 'UNKNOWN' AND prev_country != 'UNKNOWN'
  AND (ts - prev_ts) <= ${r.max_interval_sec}
ORDER BY ts DESC
${limit(r.emit?.limit)};`.trim();
  }
  
  // Speed mode (requires geo lat/lon - simplified for demo)
  return `
WITH auth AS (
  SELECT ${BY}, ts,
         toFloat64OrZero(parsed_fields['lat']) AS lat,
         toFloat64OrZero(parsed_fields['lon']) AS lon
  FROM ${SRC}
  WHERE tenant_id='${r.tenant_id}' AND ${T} 
    AND (event_type='auth' AND outcome='success')
    AND parsed_fields['lat'] != '' AND parsed_fields['lon'] != ''
),
w AS (
  SELECT ${BY}, ts, lat, lon,
         lagInFrame(ts) OVER (PARTITION BY ${BY} ORDER BY ts) AS prev_ts,
         lagInFrame(lat) OVER (PARTITION BY ${BY} ORDER BY ts) AS prev_lat,
         lagInFrame(lon) OVER (PARTITION BY ${BY} ORDER BY ts) AS prev_lon
  FROM auth
),
s AS (
  SELECT ${BY}, ts, prev_ts,
         greatCircleDistance(lat, lon, prev_lat, prev_lon) / 1000.0 AS km,
         toUInt32(ts - prev_ts) AS dt_sec
  FROM w 
  WHERE prev_ts IS NOT NULL AND (ts - prev_ts) <= ${r.max_interval_sec}
)
SELECT ${BY} AS entity_keys, ts, prev_ts, km, dt_sec,
       (km / nullIf(dt_sec,0)) * 3600.0 AS kmh
FROM s
WHERE kmh >= ${r.speed_kmh_gt ?? 900}
ORDER BY ts DESC
${limit(r.emit?.limit)};`.trim();
}

/**
 * Lexical Detection: Suspicious string patterns (DGA, encoded data, etc.)
 * Example: Long base64-like DNS queries or command lines
 */
function compileLex(r: LexRule): string {
  const T = timeWhere(r.time);
  const BY = byKey(['tenant_id', ...(r.by ?? [])]);
  const where = r.where ? `AND (${r.where.sql})` : '';
  const len = r.min_len ?? 30;

  // If score_sql provided, use it
  if (r.score_sql && r.score_gt != null) {
    return `
SELECT ${BY} AS entity_keys, ts, ${r.field} AS suspicious_value,
       (${r.score_sql.sql}) AS lexical_score
FROM ${SRC}
WHERE tenant_id='${r.tenant_id}' AND ${T} ${where}
  AND length(${r.field}) >= ${len}
  AND lexical_score >= ${r.score_gt}
ORDER BY ts DESC, lexical_score DESC
${limit(r.emit?.limit)};`.trim();
  }

  // Safe default heuristics: long string + base64-ish/hex-ish patterns
  return `
SELECT ${BY} AS entity_keys, ts, ${r.field} AS suspicious_value,
       length(${r.field}) AS string_length,
       multiIf(
         match(${r.field}, '^[A-Za-z0-9+/=]{${Math.max(24, len)},}$'), 'base64_like',
         match(${r.field}, '^[A-Fa-f0-9]{${Math.max(24, len)},}$'), 'hex_like',
         match(${r.field}, '[^A-Za-z0-9._-]{10,}'), 'symbol_heavy',
         'other'
       ) AS pattern_type
FROM ${SRC}
WHERE tenant_id='${r.tenant_id}' AND ${T} ${where}
  AND length(${r.field}) >= ${len}
  AND (
    match(${r.field}, '^[A-Za-z0-9+/=]{${Math.max(24, len)},}$')  -- base64-looking
    OR match(${r.field}, '^[A-Fa-f0-9]{${Math.max(24, len)},}$')  -- long hex
    OR match(${r.field}, '[^A-Za-z0-9._-]{10,}')                 -- lots of odd symbols
  )
ORDER BY ts DESC, string_length DESC
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
    // CHUNK 1: Advanced Detection Validations
    case 'spike':
      if (!spec.metric?.sql) errors.push('spike.metric.sql required');
      if (!spec.bucket_sec) errors.push('spike.bucket_sec required');
      if (!spec.hist_buckets) errors.push('spike.hist_buckets required');
      if (spec.z == null) errors.push('spike.z required');
      break;
    case 'spread':
      if (!spec.target) errors.push('spread.target required');
      if (!spec.window_sec) errors.push('spread.window_sec required');
      if (spec.min_distinct == null) errors.push('spread.min_distinct required');
      break;
    case 'peer_out':
      if (!spec.kpi?.sql) errors.push('peer_out.kpi.sql required');
      if (!spec.bucket_sec) errors.push('peer_out.bucket_sec required');
      if (!spec.peer_label_field) errors.push('peer_out.peer_label_field required');
      if (spec.p == null) errors.push('peer_out.p required');
      break;
    // CHUNK 2: Behavioral Detection Validations
    case 'burst':
      if (!spec.bucket_fast_sec) errors.push('burst.bucket_fast_sec required');
      if (!spec.bucket_slow_sec) errors.push('burst.bucket_slow_sec required');
      if (spec.ratio_gt == null) errors.push('burst.ratio_gt required');
      break;
    case 'time_of_day':
      if (spec.hour_start == null || spec.hour_end == null) errors.push('time_of_day hour range required');
      if (!spec.bucket_sec) errors.push('time_of_day.bucket_sec required');
      if (!spec.hist_buckets) errors.push('time_of_day.hist_buckets required');
      if (spec.z == null) errors.push('time_of_day.z required');
      break;
    case 'travel':
      if (!Array.isArray(spec.by) || spec.by.length === 0) errors.push('travel.by must include an entity key (e.g., user)');
      if (!spec.max_interval_sec) errors.push('travel.max_interval_sec required');
      break;
    case 'lex':
      if (!spec.field) errors.push('lex.field required');
      if ((spec.score_sql && spec.score_gt == null) || (!spec.score_sql && spec.score_gt != null))
        errors.push('lex.score_sql and lex.score_gt must be provided together or omitted together');
      break;
  }
  
  return errors;
}
