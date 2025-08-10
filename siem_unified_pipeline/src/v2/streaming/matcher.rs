use std::collections::HashMap;

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
}


