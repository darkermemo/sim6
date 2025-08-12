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
    // Optional free-text query string
    let where_ = if let Some(q) = body.get("q").and_then(|v| v.as_str()) { 
        parse_free_text(q) 
    } else if let Some(query) = body.get("query").and_then(|v| v.as_str()) {
        // Support legacy 'query' field for KQL
        parse_kql(query)
    } else { 
        None 
    };
    let section = SearchSection { time_range: tr, where_, tenant_ids: vec![tenant] };
    Ok(SearchDsl { version: Some("1".into()), search: Some(section), threshold: None, cardinality: None, sequence: None })
}

/// Very small KQL/Lucene-lite parser → Expr tree
/// Supports: field:value, "exact phrase", value (implies message contains), AND/OR/NOT, ranges field:[a TO b], cidr, regex:/.../ (guarded), json path with dot notation
pub fn parse_kql(input: &str) -> Option<Expr> {
    let mut tokens = tokenize(input);
    parse_or(&mut tokens)
}

/// Parse free-text search query into multiSearch expression
pub fn parse_free_text(input: &str) -> Option<Expr> {
    if input.trim().is_empty() {
        return None;
    }
    
    let mut tokens = Vec::new();
    let mut phrases = Vec::new();
    
    // Extract quoted phrases first
    let mut remaining = input.to_string();
    let mut i = 0;
    while let Some(start) = remaining[i..].find('"') {
        let start_idx = i + start;
        if let Some(end) = remaining[start_idx + 1..].find('"') {
            let phrase = remaining[start_idx + 1..start_idx + 1 + end].to_string();
            if !phrase.is_empty() {
                phrases.push(phrase);
                // Replace phrase with placeholder to avoid re-tokenizing
                remaining.replace_range(start_idx..=start_idx + 1 + end, " ");
            }
            i = start_idx + 1;
        } else {
            break;
        }
    }
    
    // Split remaining text on whitespace for individual tokens
    for word in remaining.split_whitespace() {
        if !word.is_empty() {
            tokens.push(word.to_string());
        }
    }
    
    // Build expression
    let mut conditions = Vec::new();
    
    // Add multiSearch for all tokens using ContainsAny
    if !tokens.is_empty() {
        conditions.push(Expr::ContainsAny(("message".to_string(), tokens)));
    }
    
    // Add exact phrase matches
    for phrase in phrases {
        conditions.push(Expr::Contains(("message".to_string(), phrase)));
    }
    
    // Combine with AND
    if conditions.is_empty() {
        None
    } else if conditions.len() == 1 {
        Some(conditions.into_iter().next().unwrap())
    } else {
        Some(Expr::And(conditions))
    }
}

#[derive(Clone, Debug, PartialEq)]
enum Tok { And, Or, Not, LBracket, RBracket, Field(String), Phrase(String), Regex(String), Word(String) }

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
    while let Some(e) = parse_term(ts) {
        parts.push(e);
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
                } else if v.contains('/') && v.chars().filter(|&c| c=='/').count()==1 && v.split('/').next_back().and_then(|p| p.parse::<u8>().ok()).is_some() {
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


