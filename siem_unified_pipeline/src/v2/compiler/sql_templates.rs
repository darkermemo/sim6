//! Helper SQL template builders for stateful patterns

/// Build a sequenceMatch pattern string for N steps like ".*(?1).*?(?2).*?…"
pub fn sequence_pattern(n_steps: usize) -> String {
    let parts: Vec<String> = (1..=n_steps).map(|i| format!("(?{})", i)).collect();
    format!(".*{}", parts.join(".*?"))
}


