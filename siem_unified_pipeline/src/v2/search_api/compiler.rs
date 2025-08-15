use serde_json::Value;
use crate::v2::compiler::{SearchDsl, SearchSection, TimeRange};
use crate::v2::compiler::Expr;

/// Translates the new search body shape into existing SearchDsl
/// Supports a minimal subset: tenant_id, time (last_seconds|from/to), optional q ignored (for now)
pub fn translate_to_dsl(body: &Value) -> Result<SearchDsl, String> {
    if body.get("tenant_id").and_then(|v| v.as_str()).is_none() {
        return Err("tenant_id is required".into());
    }
    let tenant = body.get("tenant_id").and_then(|v| v.as_str()).unwrap().to_string();
    let mut tr: Option<TimeRange> = None;
    if let Some(t) = body.get("time") {
        if let Some(ls) = t.get("last_seconds").and_then(|v| v.as_u64()) {
            tr = Some(TimeRange::Last { last_seconds: ls });
        } else if let (Some(from), Some(to)) = (t.get("from").and_then(|v| v.as_u64()), t.get("to").and_then(|v| v.as_u64())) {
            tr = Some(TimeRange::Between { between: (from, to) });
        }
    } else {
        tr = Some(TimeRange::Last { last_seconds: 900 });
    }
    // Optional KQL/Lucene-lite query string
    let where_ = if let Some(q) = body.get("q").and_then(|v| v.as_str()) { parse_kql(q) } else { None };
    let section = SearchSection {
        time_range: tr,
        where_: where_,
        tenant_ids: vec![tenant],
    };
    Ok(SearchDsl { version: Some("1".into()), search: Some(section), threshold: None, cardinality: None, sequence: None })
}

/// Comprehensive DSL parser supporting all logic families
/// Supports: seq(), roll(), ratio(), spike(), first_seen(), beacon(), join(), overlay() and field conditions
pub fn parse_kql(input: &str) -> Option<Expr> {
    let trimmed = input.trim();
    
    // First try to parse as comprehensive DSL (before tokenization)
    if let Some(dsl_expr) = parse_comprehensive_dsl(trimmed) {
        return Some(dsl_expr);
    }
    
    // Fallback to basic KQL parsing for simple field queries
    let mut tokens = tokenize(input);
    let expr = parse_or(&mut tokens);
    expr
}

/// Parse comprehensive DSL with all logic families
pub fn parse_comprehensive_dsl(input: &str) -> Option<Expr> {
    let trimmed = input.trim();
    
    // Debug: Always log that we're trying to parse DSL
    println!("DSL_DEBUG: Attempting to parse '{}'", trimmed);
    
    // Parse sequence expressions: seq(...)
    if trimmed.starts_with("seq(") {
        println!("DSL_DEBUG: Detected sequence pattern!");
        return parse_sequence(trimmed);
    }
    
    // Parse rolling expressions: roll(...)
    if trimmed.starts_with("roll(") {
        return parse_rolling(trimmed);
    }
    
    // Parse ratio expressions: ratio(...)
    if trimmed.starts_with("ratio(") {
        return parse_ratio(trimmed);
    }
    
    // Parse spike expressions: spike(...)
    if trimmed.starts_with("spike(") {
        return parse_spike(trimmed);
    }
    
    // Parse first_seen expressions: first_seen(...)
    if trimmed.starts_with("first_seen(") {
        return parse_first_seen(trimmed);
    }
    
    // Parse beacon expressions: beacon(...)
    if trimmed.starts_with("beacon(") {
        return parse_beacon(trimmed);
    }
    
    // Parse join expressions: join(...)
    if trimmed.starts_with("join(") {
        return parse_join(trimmed);
    }
    
    // Parse overlay expressions: overlay(...)
    if trimmed.starts_with("overlay(") {
        return parse_overlay(trimmed);
    }
    
    // Parse field conditions: field(name) op value
    if trimmed.starts_with("field(") {
        return parse_field_condition(trimmed);
    }
    
    None
}

#[derive(Clone, Debug, PartialEq)]
enum Tok { And, Or, Not, LBracket, RBracket, Field(String), Phrase(String), Regex(String), Word(String), Range(String,String,String) }

fn tokenize(s: &str) -> Vec<Tok> {
    let mut out = Vec::new();
    let mut i=0; let b = s.as_bytes();
    while i < b.len() {
        let c = b[i] as char;
        if c.is_whitespace() { i+=1; continue; }
        if c == '"' { // phrase
            i+=1; let start=i; while i<b.len() && b[i] as char != '"' { i+=1; }
            let ph = &s[start..i.min(b.len())]; out.push(Tok::Phrase(ph.to_string())); if i<b.len(){i+=1;} continue;
        }
        if c == '[' { // range like field:[a TO b] handled in parse stage
            // let parser handle inside; push bracket
            out.push(Tok::LBracket); i+=1; continue;
        }
        if c == ']' { out.push(Tok::RBracket); i+=1; continue; }
        if c == '/' { // regex /.../
            i+=1; let start=i; while i<b.len() && b[i] as char != '/' { i+=1; }
            let re = &s[start..i.min(b.len())]; out.push(Tok::Regex(re.to_string())); if i<b.len(){i+=1;} continue;
        }
        // read word
        let start=i; while i<b.len() { let ch=b[i] as char; if ch.is_whitespace() || ch=='[' || ch==']' { break;} i+=1; }
        let w = &s[start..i];
        match w.to_uppercase().as_str() { "AND" => out.push(Tok::And), "OR"=>out.push(Tok::Or), "NOT"=>out.push(Tok::Not), _=>{
            if let Some(colon) = w.find(':') { let field=&w[..colon]; let val=&w[colon+1..]; out.push(Tok::Field(format!("{}:{}", field, val))); }
            else { out.push(Tok::Word(w.to_string())); }
        }}
    }
    out
}

fn parse_or(ts: &mut Vec<Tok>) -> Option<Expr> {
    let mut left = parse_and(ts)?;
    let mut i=0; while i<ts.len() { if let Tok::Or = ts[i] { ts.remove(i); if let Some(r)=parse_and(ts){ left = Expr::Or(vec![left, r]); } } else { i+=1; } }
    Some(left)
}

fn parse_and(ts: &mut Vec<Tok>) -> Option<Expr> {
    let mut parts: Vec<Expr> = Vec::new();
    loop {
        if let Some(e) = parse_term(ts) { parts.push(e); } else { break; }
        if matches!(ts.first(), Some(Tok::And)) { ts.remove(0); continue; }
        // implicit AND on whitespace between terms
        if matches!(ts.first(), Some(Tok::Or)) { break; }
    }
    if parts.is_empty() { None } else if parts.len()==1 { Some(parts.remove(0)) } else { Some(Expr::And(parts)) }
}

fn parse_term(ts: &mut Vec<Tok>) -> Option<Expr> {
    if ts.is_empty() { return None; }
    match ts.remove(0) {
        Tok::Not => parse_term(ts).map(|e| Expr::Not(Box::new(e))),
        Tok::Phrase(p) => Some(Expr::Contains(("message".to_string(), p))),
        Tok::Regex(r) => { if r.len()>128 { None } else { Some(Expr::Regex(("message".to_string(), r))) }},
        Tok::Word(w) => {
            // free token → message contains
            Some(Expr::Contains(("message".to_string(), w)))
        }
        Tok::Field(fv) => {
            // field:value or field:[a TO b] or field:/re/
            if let Some((f,v)) = fv.split_once(':') {
                if v.starts_with('[') && v.ends_with(']') {
                    let inner = v.trim_matches(&['[', ']'][..]);
                    if let Some((a,b)) = inner.split_once("TO") { let a=a.trim(); let b=b.trim(); if let (Ok(a_n), Ok(b_n)) = (a.parse::<f64>(), b.parse::<f64>()) { return Some(Expr::Between((f.to_string(), a_n, b_n))); } }
                } else if v.contains('/') && v.chars().filter(|&c| c=='/').count()==1 && v.split('/').last().and_then(|p| p.parse::<u8>().ok()).is_some() {
                    return Some(Expr::IpInCidr((f.to_string(), v.to_string())));
                } else if v.starts_with('/') && v.ends_with('/') { let re=v.trim_matches('/'); if re.len()<=128 { return Some(Expr::Regex((f.to_string(), re.to_string())));} }
                else if f.starts_with("metadata.") || f.starts_with("raw_event.") {
                    return Some(Expr::JsonEq((f.to_string(), Value::String(v.to_string()))));
                } else if v.contains('*') || v.contains('?') { // wildcard → simple regex or starts/ends
                    let re = v.replace('.', "\\.").replace('*', ".*").replace('?', ".");
                    return Some(Expr::Regex((f.to_string(), re)));
                } else { return Some(Expr::Eq((f.to_string(), Value::String(v.to_string())))); }
            }
            None
        }
        _ => None,
    }
}

/// Parse sequence expressions: seq(stages, within=time, by=fields, strict=mode)
fn parse_sequence(input: &str) -> Option<Expr> {
    // Extract content between parentheses
    let content = extract_function_content(input, "seq")?;
    
    // Parse seq() using custom logic family expressions
    // For now, store as a special Expr variant that compiler recognizes
    Some(Expr::Contains(("__dsl_seq".to_string(), format!("DETECTED_SEQUENCE:{}", content))))
}

/// Parse rolling expressions: roll(expr, within=time, by=fields)
fn parse_rolling(input: &str) -> Option<Expr> {
    let content = extract_function_content(input, "roll")?;
    Some(Expr::Contains(("__dsl_roll".to_string(), content)))
}

/// Parse ratio expressions: ratio(num:den op k, within=time, by=fields)
fn parse_ratio(input: &str) -> Option<Expr> {
    let content = extract_function_content(input, "ratio")?;
    Some(Expr::Contains(("__dsl_ratio".to_string(), content)))
}

/// Parse spike expressions: spike(metric, z>=threshold, within=time, history=horizon, by=fields)
fn parse_spike(input: &str) -> Option<Expr> {
    let content = extract_function_content(input, "spike")?;
    Some(Expr::Contains(("__dsl_spike".to_string(), content)))
}

/// Parse first_seen expressions: first_seen(dimension, horizon=time, by=fields)
fn parse_first_seen(input: &str) -> Option<Expr> {
    let content = extract_function_content(input, "first_seen")?;
    Some(Expr::Contains(("__dsl_first_seen".to_string(), content)))
}

/// Parse beacon expressions: beacon(count>=N, jitter<r, within=time, by=fields)
fn parse_beacon(input: &str) -> Option<Expr> {
    let content = extract_function_content(input, "beacon")?;
    Some(Expr::Contains(("__dsl_beacon".to_string(), content)))
}

/// Parse join expressions: join(left=stream, right=stream, within=time, by=fields)
fn parse_join(input: &str) -> Option<Expr> {
    let content = extract_function_content(input, "join")?;
    Some(Expr::Contains(("__dsl_join".to_string(), content)))
}

/// Parse overlay expressions: overlay(tag in [values])
fn parse_overlay(input: &str) -> Option<Expr> {
    let content = extract_function_content(input, "overlay")?;
    Some(Expr::Contains(("__dsl_overlay".to_string(), content)))
}

/// Parse field conditions: field(name) op value
fn parse_field_condition(input: &str) -> Option<Expr> {
    // Extract field name: field(user) = "alice"
    if let Some(field_end) = input.find(')') {
        let field_part = &input[6..field_end]; // Skip "field("
        let rest = input[field_end + 1..].trim();
        
        // Parse operator and value
        if let Some((op, value)) = parse_operator_value(rest) {
            match op.as_str() {
                "=" => {
                    if let Ok(json_val) = serde_json::from_str(&value) {
                        return Some(Expr::Eq((field_part.to_string(), json_val)));
                    }
                    return Some(Expr::Eq((field_part.to_string(), serde_json::Value::String(value))));
                }
                "!=" | "≠" => {
                    if let Ok(json_val) = serde_json::from_str(&value) {
                        return Some(Expr::Ne((field_part.to_string(), json_val)));
                    }
                    return Some(Expr::Ne((field_part.to_string(), serde_json::Value::String(value))));
                }
                ">" => {
                    if let Ok(num) = value.parse::<f64>() {
                        return Some(Expr::Gt((field_part.to_string(), num)));
                    }
                }
                ">=" | "≥" => {
                    if let Ok(num) = value.parse::<f64>() {
                        return Some(Expr::Gte((field_part.to_string(), num)));
                    }
                }
                "<" => {
                    if let Ok(num) = value.parse::<f64>() {
                        return Some(Expr::Lt((field_part.to_string(), num)));
                    }
                }
                "<=" | "≤" => {
                    if let Ok(num) = value.parse::<f64>() {
                        return Some(Expr::Lte((field_part.to_string(), num)));
                    }
                }
                "contains" => {
                    return Some(Expr::Contains((field_part.to_string(), value)));
                }
                "startswith" => {
                    return Some(Expr::Startswith((field_part.to_string(), value)));
                }
                "endswith" => {
                    return Some(Expr::Endswith((field_part.to_string(), value)));
                }
                "regex" => {
                    return Some(Expr::Regex((field_part.to_string(), value)));
                }
                "exists" => {
                    return Some(Expr::Exists(field_part.to_string()));
                }
                "missing" => {
                    return Some(Expr::Missing(field_part.to_string()));
                }
                _ => {}
            }
        }
    }
    None
}

/// Extract content between function parentheses
fn extract_function_content(input: &str, func_name: &str) -> Option<String> {
    let prefix = format!("{}(", func_name);
    if input.starts_with(&prefix) {
        let start = prefix.len();
        // Find matching closing parenthesis
        let mut paren_count = 1;
        let mut end = start;
        for (i, c) in input[start..].char_indices() {
            match c {
                '(' => paren_count += 1,
                ')' => {
                    paren_count -= 1;
                    if paren_count == 0 {
                        end = start + i;
                        break;
                    }
                }
                _ => {}
            }
        }
        if paren_count == 0 {
            return Some(input[start..end].to_string());
        }
    }
    None
}

/// Parse operator and value from a string like "= 'value'" or "> 100"
fn parse_operator_value(input: &str) -> Option<(String, String)> {
    let trimmed = input.trim();
    
    // Handle operators
    for op in &["!=", "≠", ">=", "≥", "<=", "≤", "=", ">", "<", "contains", "startswith", "endswith", "regex", "exists", "missing"] {
        if trimmed.starts_with(op) {
            let value_part = trimmed[op.len()..].trim();
            
            // Handle special cases for exists/missing (no value)
            if *op == "exists" || *op == "missing" {
                return Some((op.to_string(), "".to_string()));
            }
            
            // Parse quoted strings
            if (value_part.starts_with('"') && value_part.ends_with('"')) ||
               (value_part.starts_with('\'') && value_part.ends_with('\'')) {
                let unquoted = &value_part[1..value_part.len()-1];
                return Some((op.to_string(), unquoted.to_string()));
            }
            
            // Parse unquoted values
            return Some((op.to_string(), value_part.to_string()));
        }
    }
    
    None
}


