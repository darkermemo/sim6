use once_cell::sync::Lazy;
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FieldKind {
    String,
    NullableString,
    UInt16,
    UInt32,
    JsonText,
}

pub static CANONICAL_FIELDS: Lazy<HashMap<&'static str, FieldKind>> = Lazy::new(|| {
    use FieldKind::*;
    HashMap::from([
        ("event_timestamp", UInt32),
        ("created_at", UInt32),
        ("tenant_id", String),
        // User-related
        ("user_name", NullableString),
        ("user_id", NullableString),
        // Network-related
        ("source_ip", NullableString),
        ("destination_ip", NullableString),
        ("source_port", UInt16),
        ("dest_port", UInt16),
        ("protocol", NullableString),
        // Source/log origin variants commonly used by the UI and compiler
        ("source", NullableString),
        ("service", NullableString),
        ("program", NullableString),
        ("logger", NullableString),
        ("facility", NullableString),
        ("host", NullableString),
        // Vendor/Product taxonomy
        ("vendor", NullableString),
        ("product", NullableString),
        // Event classification
        ("source_type", NullableString),
        ("event_type", NullableString),
        ("event_category", String),
        ("event_action", String),
        ("event_outcome", NullableString),
        // Severity/log level
        ("severity", NullableString),
        ("level", NullableString),
        ("log_level", NullableString),
        // Message/log body
        ("message", NullableString),
        ("raw_message", NullableString),
        ("raw_log", NullableString),
        ("raw_event", String),
        ("metadata", JsonText),
        ("event_id", String),
        ("correlation_id", NullableString),
        ("tags", NullableString),
    ])
});

pub static ALIASES: Lazy<HashMap<&'static str, &'static str>> = Lazy::new(|| {
    HashMap::from([
        ("src_ip", "source_ip"),
        ("dst_ip", "destination_ip"),
        ("dest_ip", "destination_ip"),
        ("destination_port", "dest_port"),
        ("cat", "event_category"),
        ("action", "event_action"),
        ("outcome", "event_outcome"),
        ("proto", "protocol"),
        ("user", "user_name"),
    ])
});

pub fn canonicalize_field(input: &str) -> (&'static str, Option<FieldKind>) {
    let key = input.to_lowercase();
    if let Some(&canon) = ALIASES.get(key.as_str()) { return (canon, CANONICAL_FIELDS.get(canon).copied()); }
    if let Some(kind) = CANONICAL_FIELDS.get(key.as_str()).copied() { return (Box::leak(key.into_boxed_str()), Some(kind)); }
    // Unknown
    (Box::leak(key.into_boxed_str()), None)
}

pub fn suggestions(for_field: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let f = for_field.to_lowercase();
    for k in CANONICAL_FIELDS.keys() {
        if k.contains(&f) || f.contains(k) { out.push((*k).to_string()); }
    }
    for (a, canon) in ALIASES.iter() {
        if a.contains(&f) || f.contains(a) { out.push((*canon).to_string()); }
    }
    out.sort(); out.dedup();
    out
}

pub fn is_string_like(kind: FieldKind) -> bool { matches!(kind, FieldKind::String | FieldKind::NullableString | FieldKind::JsonText) }
pub fn is_numeric(kind: FieldKind) -> bool { matches!(kind, FieldKind::UInt16 | FieldKind::UInt32) }
pub fn is_ip_string_field(name: &str) -> bool { matches!(name, "source_ip" | "destination_ip") }


