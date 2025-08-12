/// v2 DSL → SQL compiler entry points
///
/// This module defines the DSL structures and compilation helpers to transform
/// user-provided filters/rules into safe, parameterized ClickHouse SQL.
use serde::{Deserialize, Serialize};
pub mod validate;
use crate::v2::compiler::validate::validate_expr;
use std::fmt::Write as _;

/// Top-level search request DSL
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchDsl {
    pub version: Option<String>,
    pub search: Option<SearchSection>,
    pub threshold: Option<ThresholdSection>,
    pub cardinality: Option<CardinalitySection>,
    pub sequence: Option<SequenceSection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchSection {
    pub time_range: Option<TimeRange>,
    #[serde(rename = "where")]
    pub where_: Option<Expr>,
    #[serde(default)]
    pub tenant_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum TimeRange {
    Last { last_seconds: u64 },
    Between { between: (u64, u64) },
}

/// Boolean expression tree for filters
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", content = "args", rename_all = "lowercase")]
pub enum Expr {
    And(Vec<Expr>),
    Or(Vec<Expr>),
    Not(Box<Expr>),

    Eq((String, serde_json::Value)),
    Ne((String, serde_json::Value)),
    In((String, Vec<serde_json::Value>)),
    Nin((String, Vec<serde_json::Value>)),

    Contains((String, String)),
    /// contains_any(field, [tokens...]) – case-insensitive
    ContainsAny((String, Vec<String>)),
    Startswith((String, String)),
    Endswith((String, String)),
    Regex((String, String)),

    Gt((String, f64)), Gte((String, f64)), Lt((String, f64)), Lte((String, f64)),
    Between((String, f64, f64)),

    IpInCidr((String, String)),
    Exists(String),
    Missing(String),
    IsNull(String),
    NotNull(String),

    JsonEq((String, serde_json::Value)),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThresholdSection {
    pub group_by: Vec<String>,
    #[serde(default)]
    pub window_sec: Option<u64>,
    pub having: ThresholdHaving,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThresholdHaving { #[serde(alias="having_count_gte", alias="gte")] pub count_gte: u64 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardinalitySection {
    #[serde(alias="field", alias="distinct_field")]
    pub distinct_of: String,
    #[serde(alias="distinct_gte")]
    pub gte: u64,
    pub group_by: Vec<String>,
    #[serde(alias="window_sec")]
    pub window_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SequenceSection {
    #[serde(alias="by")]
    pub entity: Vec<String>,
    #[serde(alias="within_sec")]
    pub window_seconds: u64,
    pub steps: Vec<SequenceStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SequenceStep { #[serde(rename = "where")] pub where_: Option<Expr> }

/// Result of compilation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompileResult {
    pub sql: String,
    pub where_sql: String,
    pub warnings: Vec<String>,
}

/// compile_search compiles a SearchDsl (filter only) into a SELECT ... WHERE ... SQL with bounds
pub fn compile_search(dsl: &SearchDsl, events_table: &str) -> Result<CompileResult, String> {
    // Guardrails
    let _max_rows: u64 = 10_000;
    let max_range_sec: u64 = 7 * 24 * 3600;

    // Normalize legacy shapes if provided (compat layer)
    let search = dsl.search.as_ref();
    let mut where_clauses: Vec<String> = Vec::new();
    if let Some(search) = search {
        // Tenants (required)
        if !search.tenant_ids.is_empty() {
            let list = search.tenant_ids.iter().map(|t| format!("'{}'", escape_sql(t))).collect::<Vec<_>>().join(",");
            where_clauses.push(format!("tenant_id IN ({})", list));
        } else {
            return Err("tenant_ids are required".to_string());
        }
        // Time clamp
        if let Some(tr) = &search.time_range {
            match tr {
                TimeRange::Last { last_seconds } => {
                    if *last_seconds > max_range_sec {
                        return Err("time_range too large".to_string());
                    }
                    where_clauses.push(format!("event_timestamp >= toUInt32(now()) - {}", last_seconds));
                }
                TimeRange::Between { between: (t0, t1) } => where_clauses.push(format!("event_timestamp BETWEEN {} AND {}", t0, t1)),
            }
        } else {
            // default last 15m
            where_clauses.push("event_timestamp >= toUInt32(now()) - 900".to_string());
        }

        // WHERE expression compilation (subset of operators)
        if let Some(expr) = &search.where_ {
            // Preflight validation against catalog
            if let Err(ve) = validate_expr(expr) {
                return Err(format!("{}: field={:?} suggestions={:?}", ve.code, ve.field, ve.suggestions));
            }
            let mut buf = String::new();
            compile_expr(expr, &mut buf)?;
            if !buf.is_empty() { where_clauses.push(buf); }
        }
    }
    let where_sql = if where_clauses.is_empty() { "1".to_string() } else { where_clauses.join(" AND ") };

    // Pattern operators (mutually exclusive for now): sequence, threshold, cardinality
    if let Some(seq) = &dsl.sequence {
        // Guardrails
        if seq.entity.is_empty() { return Err("sequence: 'by' keys required".into()); }
        if seq.steps.is_empty() || seq.steps.len() > 5 { return Err("sequence: 1..5 steps required".into()); }
        if seq.window_seconds > 86_400 { return Err("sequence: within_sec too large".into()); }

        // Compile step expressions
        let mut step_cols: Vec<String> = Vec::new();
        for (i, s) in seq.steps.iter().enumerate() {
            let mut cond = String::new();
            if let Some(w) = &s.where_ {
                if let Err(ve) = validate_expr(w) { return Err(format!("{}: field={:?} suggestions={:?}", ve.code, ve.field, ve.suggestions)); }
                compile_expr(w, &mut cond)?;
            } else {
                cond.push('1');
            }
            step_cols.push(format!("({}) AS step{}", cond, i+1));
        }
        let by_expr = seq.entity.iter().map(|f| map_field(f)).collect::<Vec<_>>().join(", ");
        let steps_idx = (1..=seq.steps.len()).map(|i| format!("(?{})", i)).collect::<Vec<_>>().join(".*?");
        let pattern = format!(".*{}", steps_idx);
        let sql = format!(
            "SELECT {by}, anyLast(event_timestamp) AS match_ts \
             FROM ( \
               SELECT event_timestamp, {by}, {steps} \
               FROM ( \
                 SELECT event_timestamp, {by}, {steps_inner} \
                 FROM {tbl} \
                 WHERE {where} \
               ) \
               ORDER BY {by}, event_timestamp \
             ) \
             GROUP BY {by} \
             HAVING sequenceMatch('{pat}')(event_timestamp{step_sig}) \
                AND (max(event_timestamp) - min(event_timestamp)) <= {win} \
             LIMIT 10000 SETTINGS max_execution_time=8",
            by=by_expr,
            steps=step_cols.join(", "),
            steps_inner=step_cols.join(", "),
            tbl=events_table,
            where=where_sql,
            pat=pattern,
            step_sig= (0..seq.steps.len()).map(|i| format!(", step{}", i+1)).collect::<Vec<_>>().join(""),
            win=seq.window_seconds,
        );
        return Ok(CompileResult { sql, where_sql, warnings: vec![] });
    }

    if let Some(th) = &dsl.threshold {
        let gb = if th.group_by.is_empty() { return Err("threshold: group_by required".into()); } else { th.group_by.iter().map(|f| map_field(f)).collect::<Vec<_>>().join(", ") };
        let extra_time = th.window_sec.map(|w| format!(" AND event_timestamp >= toUInt32(now()) - {}", w)).unwrap_or_default();
        let sql = format!(
            "SELECT {gb}, count() AS c FROM {tbl} WHERE ({where}){extra} GROUP BY {gb} HAVING c >= {n} ORDER BY c DESC LIMIT 10000 SETTINGS max_execution_time=8",
            gb=gb, tbl=events_table, where=where_sql, extra=extra_time, n=th.having.count_gte
        );
        return Ok(CompileResult { sql, where_sql, warnings: vec![] });
    }

    if let Some(card) = &dsl.cardinality {
        let gb = if card.group_by.is_empty() { return Err("cardinality: group_by required".into()); } else { card.group_by.iter().map(|f| map_field(f)).collect::<Vec<_>>().join(", ") };
        let extra_time = if card.window_seconds > 0 { format!(" AND event_timestamp >= toUInt32(now()) - {}", card.window_seconds) } else { String::new() };
        let sql = format!(
            "SELECT {gb}, uniqExact({field}) AS u FROM {tbl} WHERE ({where}){extra} GROUP BY {gb} HAVING u >= {n} ORDER BY u DESC LIMIT 10000 SETTINGS max_execution_time=8",
            gb=gb, field=map_field(&card.distinct_of), tbl=events_table, where=where_sql, extra=extra_time, n=card.gte
        );
        return Ok(CompileResult { sql, where_sql, warnings: vec![] });
    }

    // Default: plain filter search
    let sql = format!(
        "SELECT * FROM {} WHERE {} ORDER BY event_timestamp DESC LIMIT 10000 SETTINGS max_execution_time=8",
        events_table, where_sql
    );
    Ok(CompileResult { sql, where_sql, warnings: vec![] })
}

fn escape_sql(s: &str) -> String { s.replace('\'', "''") }

/// compile_expr emits ClickHouse SQL for a subset of DSL operators with safe escaping
fn compile_expr(expr: &Expr, out: &mut String) -> Result<(), String> {
    match expr {
        Expr::And(list) => {
            let mut parts: Vec<String> = Vec::new();
            for e in list { let mut b=String::new(); compile_expr(e, &mut b)?; if !b.is_empty(){parts.push(b);} }
            if !parts.is_empty() { write!(out, "({})", parts.join(" AND ")).unwrap(); }
        }
        Expr::Or(list) => {
            let mut parts: Vec<String> = Vec::new();
            for e in list { let mut b=String::new(); compile_expr(e, &mut b)?; if !b.is_empty(){parts.push(b);} }
            if !parts.is_empty() { write!(out, "({})", parts.join(" OR ")).unwrap(); }
        }
        Expr::Not(inner) => {
            let mut b=String::new(); compile_expr(inner, &mut b)?; if !b.is_empty(){ write!(out, "(NOT {})", b).unwrap(); }
        }
        Expr::Eq((f,v)) => write!(out, "{} = '{}'", map_field(f), escape_sql(&json_to_str(v))).unwrap(),
        Expr::Ne((f,v)) => write!(out, "{} != '{}'", map_field(f), escape_sql(&json_to_str(v))).unwrap(),
        Expr::In((f,vals)) => {
            let items = vals.iter().map(|v| format!("'{}'", escape_sql(&json_to_str(v)))).collect::<Vec<_>>().join(",");
            write!(out, "{} IN ({})", map_field(f), items).unwrap();
        }
        Expr::Nin((f,vals)) => {
            let items = vals.iter().map(|v| format!("'{}'", escape_sql(&json_to_str(v)))).collect::<Vec<_>>().join(",");
            write!(out, "{} NOT IN ({})", map_field(f), items).unwrap();
        }
        Expr::Contains((f,s)) => write!(out, "positionCaseInsensitive({}, '{}') > 0", map_field(f), escape_sql(s)).unwrap(),
        Expr::ContainsAny((f, tokens)) => {
            if tokens.is_empty() { write!(out, "0").unwrap(); }
            else if tokens.len() == 1 {
                write!(out, "positionCaseInsensitive({}, '{}') > 0", map_field(f), escape_sql(&tokens[0])).unwrap();
            } else {
                let arr = tokens.iter().map(|t| format!("'{}'", escape_sql(t))).collect::<Vec<_>>().join(",");
                write!(out, "multiSearchAnyCaseInsensitive({}, [{}])", map_field(f), arr).unwrap();
            }
        }
        Expr::Startswith((f,s)) => write!(out, "startsWith({}, '{}')", map_field(f), escape_sql(s)).unwrap(),
        Expr::Endswith((f,s)) => write!(out, "endsWith({}, '{}')", map_field(f), escape_sql(s)).unwrap(),
        Expr::Regex((f,re)) => {
            // Very basic regex guard to avoid catastrophic patterns
            if re.len() > 256 || re.contains("(a+)+") {
                return Err("regex_guard: pattern too costly".to_string());
            }
            write!(out, "match({}, '{}')", map_field(f), escape_sql(re)).unwrap();
        }
        Expr::Gt((f,n)) => write!(out, "{} > {}", map_field(f), n).unwrap(),
        Expr::Gte((f,n)) => write!(out, "{} >= {}", map_field(f), n).unwrap(),
        Expr::Lt((f,n)) => write!(out, "{} < {}", map_field(f), n).unwrap(),
        Expr::Lte((f,n)) => write!(out, "{} <= {}", map_field(f), n).unwrap(),
        Expr::Between((f,a,b)) => write!(out, "{} BETWEEN {} AND {}", map_field(f), a, b).unwrap(),
        // Prefer native ipCIDRMatch; if the column isn't a valid IP string, ClickHouse returns 0 anyway.
        // A future improvement could probe function existence at boot and fall back to numeric ranges.
        Expr::IpInCidr((f,c)) => {
            // Choose function based on boot capability (set in main.rs)
            let fn_name = if crate::v2::capabilities::ipcidr_available() { "ipCIDRMatch" } else { "IPv4CIDRMatch" };
            write!(out, "{}({}, '{}')", fn_name, map_field(f), escape_sql(c)).unwrap();
        }
        Expr::Exists(f) => write!(out, "{} IS NOT NULL", map_field(f)).unwrap(),
        Expr::Missing(f) => write!(out, "{} IS NULL", map_field(f)).unwrap(),
        Expr::IsNull(f) => write!(out, "{} IS NULL", map_field(f)).unwrap(),
        Expr::NotNull(f) => write!(out, "{} IS NOT NULL", map_field(f)).unwrap(),
        Expr::JsonEq((path, val)) => {
            // Expect form: metadata.a.b or raw_event.a.b
            let (col, p) = split_json_path(path);
            let rhs = escape_sql(&json_to_str(val));
            if col == "raw_event" {
                // NULL-safe guard for raw_event JSON
                write!(out, "if(isValidJSON(raw_event), JSONExtractString(raw_event, '{}'), NULL) = '{}'", p, rhs).unwrap();
            } else {
                write!(out, "JSONExtractString({}, '{}') = '{}'", col, p, rhs).unwrap();
            }
        }
    }
    Ok(())
}

fn json_to_str(v: &serde_json::Value) -> String {
    match v { serde_json::Value::String(s) => s.clone(), _ => v.to_string() }
}

fn split_json_path(path: &str) -> (&str, String) {
    if let Some(rest) = path.strip_prefix("metadata.") { ("metadata", rest.to_string()) }
    else if let Some(rest) = path.strip_prefix("raw_event.") { ("raw_event", rest.to_string()) }
    else { ("metadata", path.to_string()) }
}

fn map_field(f: &str) -> String { escape_sql(f) }


