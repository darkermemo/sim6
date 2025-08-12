use axum::Json;

#[derive(serde::Serialize)]
pub struct FieldInfo { pub name: &'static str, pub r#type: &'static str }

/// GET /api/v2/schema/fields - static field catalog for UI + compiler
pub async fn get_fields() -> Json<Vec<FieldInfo>> {
    Json(vec![
        FieldInfo { name: "event_timestamp", r#type: "UInt32" },
        FieldInfo { name: "created_at", r#type: "UInt32" },
        FieldInfo { name: "tenant_id", r#type: "String" },
        FieldInfo { name: "user_name", r#type: "Nullable(String)" },
        FieldInfo { name: "user_id", r#type: "Nullable(String)" },
        FieldInfo { name: "source_ip", r#type: "Nullable(String)" },
        FieldInfo { name: "destination_ip", r#type: "Nullable(String)" },
        FieldInfo { name: "source_port", r#type: "Nullable(UInt16)" },
        FieldInfo { name: "dest_port", r#type: "Nullable(UInt16)" },
        FieldInfo { name: "protocol", r#type: "Nullable(String)" },
        FieldInfo { name: "source_type", r#type: "Nullable(String)" },
        FieldInfo { name: "event_category", r#type: "String" },
        FieldInfo { name: "event_action", r#type: "Nullable(String)" },
        FieldInfo { name: "event_outcome", r#type: "Nullable(String)" },
        FieldInfo { name: "severity", r#type: "Nullable(String)" },
        FieldInfo { name: "message", r#type: "Nullable(String)" },
        FieldInfo { name: "raw_event", r#type: "String" },
        FieldInfo { name: "metadata", r#type: "String" },
        FieldInfo { name: "event_id", r#type: "String" },
        FieldInfo { name: "correlation_id", r#type: "Nullable(String)" },
        FieldInfo { name: "tags", r#type: "String" },
    ])
}

#[derive(serde::Serialize)]
pub struct Enums { pub severity: Vec<&'static str>, pub status: Vec<&'static str> }

/// GET /api/v2/schema/enums - enums for UI and normalization
pub async fn get_enums() -> Json<Enums> {
    Json(Enums {
        severity: vec!["LOW","MEDIUM","HIGH","CRITICAL"],
        status: vec!["OPEN","ACK","RESOLVED","SUPPRESSED"],
    })
}


