use std::collections::HashMap;

fn get_field<'a>(env: &'a HashMap<String, String>, key: &str) -> &'a str {
    env.get(key).map(|s| s.as_str()).unwrap_or("")
}

pub fn eq_field(env: &HashMap<String,String>, field: &str, value: &str) -> bool {
    get_field(env, field) == value
}

pub fn contains_case_insensitive(hay: &str, needle: &str) -> bool {
    hay.to_lowercase().contains(&needle.to_lowercase())
}

pub fn contains_field(env: &HashMap<String,String>, field: &str, needle: &str) -> bool {
    contains_case_insensitive(get_field(env, field), needle)
}

pub fn contains_any_field(env: &HashMap<String,String>, field: &str, tokens: &[&str]) -> bool {
    let h = get_field(env, field).to_lowercase();
    tokens.iter().any(|t| h.contains(&t.to_lowercase()))
}

pub fn json_meta_contains(env: &HashMap<String,String>, key: &str, needle: &str) -> bool {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(get_field(env, "meta")) {
        if let Some(s) = v.get(key).and_then(|x| x.as_str()) { return contains_case_insensitive(s, needle); }
    }
    false
}

pub fn json_raw_eq(env: &HashMap<String,String>, key: &str, value: &str) -> bool {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(get_field(env, "raw")) {
        if let Some(s) = v.get(key).and_then(|x| x.as_str()) { return s == value; }
        if let Some(n) = v.get(key).and_then(|x| x.as_i64()) { return value.parse::<i64>().ok().map(|vv| vv == n).unwrap_or(false); }
    }
    false
}

fn parse_ipv4(addr: &str) -> Option<u32> {
    let parts: Vec<&str> = addr.split('.').collect();
    if parts.len() != 4 { return None; }
    let mut v: u32 = 0;
    for p in parts {
        let b = p.parse::<u8>().ok()?;
        v = (v << 8) | (b as u32);
    }
    Some(v)
}

pub fn ip_in_cidr(env: &HashMap<String,String>, field: &str, cidr: &str) -> bool {
    // Supports IPv4 a.b.c.d/len
    let (net, len_str) = match cidr.split_once('/') { Some(x) => x, None => return false };
    let len: u32 = match len_str.parse() { Ok(n) if n <= 32 => n, _ => return false };
    let net_u = match parse_ipv4(net) { Some(n) => n, None => return false };
    let ip_u = match parse_ipv4(get_field(env, field)) { Some(n) => n, None => return false };
    let mask = if len == 0 { 0 } else { (!0u32) << (32 - len) };
    (ip_u & mask) == (net_u & mask)
}

/// Simple DSL evaluator: expects shape { op, args }
pub fn eval_where(env: &HashMap<String,String>, where_json: &serde_json::Value) -> bool {
    use serde_json::Value as V;
    match where_json {
        V::Object(m) => {
            let op = m.get("op").and_then(|v| v.as_str()).unwrap_or("");
            let args = m.get("args").cloned().unwrap_or(V::Null);
            match op {
                "and" => {
                    if let V::Array(arr) = args { return arr.iter().all(|c| eval_where(env, c)); }
                    false
                }
                "or" => {
                    if let V::Array(arr) = args { return arr.iter().any(|c| eval_where(env, c)); }
                    false
                }
                "eq" => {
                    if let V::Array(a) = args { if a.len() == 2 { return eq_field(env, a[0].as_str().unwrap_or(""), a[1].as_str().unwrap_or("")); } }
                    false
                }
                "contains" => {
                    if let V::Array(a) = args { if a.len() == 2 { return contains_field(env, a[0].as_str().unwrap_or(""), a[1].as_str().unwrap_or("")); } }
                    false
                }
                "contains_any" => {
                    if let V::Array(a) = args { if a.len() == 2 { if let Some(list)=a[1].as_array(){ let toks: Vec<&str>=list.iter().filter_map(|v| v.as_str()).collect(); return contains_any_field(env, a[0].as_str().unwrap_or(""), &toks); }} }
                    false
                }
                "json_meta" => {
                    if let V::Array(a) = args { if a.len() == 2 { return json_meta_contains(env, a[0].as_str().unwrap_or(""), a[1].as_str().unwrap_or("")); } }
                    false
                }
                "json_raw_eq" => {
                    if let V::Array(a) = args { if a.len() == 2 { return json_raw_eq(env, a[0].as_str().unwrap_or(""), a[1].as_str().unwrap_or("")); } }
                    false
                }
                "ipincidr" => {
                    if let V::Array(a) = args { if a.len() == 2 { return ip_in_cidr(env, a[0].as_str().unwrap_or(""), a[1].as_str().unwrap_or("")); } }
                    false
                }
                _ => false,
            }
        }
        _ => false,
    }
}

/// Returns true if any token (case-insensitive) appears in any provided haystack.
pub fn contains_any_case_insensitive(haystacks: &[&str], tokens: &[&str]) -> bool {
    if haystacks.is_empty() || tokens.is_empty() { return false; }
    let toks: Vec<String> = tokens.iter().map(|t| t.to_lowercase()).collect();
    haystacks.iter().any(|h| {
        let hlow = h.to_lowercase();
        toks.iter().any(|t| hlow.contains(t))
    })
}

/// Compute a deterministic alert id for idempotence given core identifiers.
pub fn compute_alert_id(rule_id: &str, tenant: &str, event_id: &str, stream_id: &str) -> String {
    let material = format!("{}|{}|{}|{}", rule_id, tenant, event_id, stream_id);
    blake3::hash(material.as_bytes()).to_hex().to_string()
}

/// Evaluate a simple predicate set on a minimal envelope map.
/// Supported ops: contains, contains_any on fields: message/msg/meta/raw.
pub fn evaluate_envelope_contains_any(fields: &HashMap<String, String>, tokens: &[&str]) -> bool {
    let msg = fields.get("msg").map(|s| s.as_str()).unwrap_or("");
    let meta = fields.get("meta").map(|s| s.as_str()).unwrap_or("");
    let raw = fields.get("raw").map(|s| s.as_str()).unwrap_or("");
    contains_any_case_insensitive(&[msg, meta, raw], tokens)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn contains_any_basic() {
        assert!(contains_any_case_insensitive(&["hello hammer world"], &["hammer"]));
        assert!(contains_any_case_insensitive(&["LOUD HAMMER"], &["hammer"]));
        assert!(!contains_any_case_insensitive(&["no match"], &["hammer"]));
    }

    #[test]
    fn alert_id_is_stable() {
        let a = compute_alert_id("r","t","e","1-0");
        let b = compute_alert_id("r","t","e","1-0");
        assert_eq!(a, b);
        let c = compute_alert_id("r","t","e","1-1");
        assert_ne!(a, c);
    }

    #[test]
    fn evaluate_envelope_tokens() {
        let mut f = HashMap::new();
        f.insert("msg".to_string(), "Noise".to_string());
        f.insert("meta".to_string(), "{".to_string());
        f.insert("raw".to_string(), "hammer is here".to_string());
        assert!(evaluate_envelope_contains_any(&f, &["HAMMER"]));
    }

    #[test]
    fn eq_and_contains_field() {
        let mut env = HashMap::new(); env.insert("message".to_string(), "Hello".to_string());
        assert!(eq_field(&env, "message", "Hello"));
        assert!(contains_field(&env, "message", "ell"));
    }

    #[test]
    fn json_ops_meta_and_raw() {
        let mut env = HashMap::new();
        env.insert("meta".to_string(), "{\"k\":\"Val\"}".to_string());
        env.insert("raw".to_string(), "{\"n\":123}".to_string());
        assert!(json_meta_contains(&env, "k", "val"));
        assert!(json_raw_eq(&env, "n", "123"));
    }

    #[test]
    fn ipcidr_basic() {
        let mut env = HashMap::new(); env.insert("source_ip".to_string(), "10.1.2.3".to_string());
        assert!(ip_in_cidr(&env, "source_ip", "10.0.0.0/8"));
        assert!(!ip_in_cidr(&env, "source_ip", "10.2.0.0/16"));
    }

    #[test]
    fn eval_where_and_or() {
        let mut env = HashMap::new(); env.insert("message".to_string(), "error: fail".to_string());
        let j = serde_json::json!({"op":"and","args":[{"op":"contains","args":["message","error"]},{"op":"contains_any","args":["message",["fail"]]}]});
        assert!(eval_where(&env, &j));
    }
}


