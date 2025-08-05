//! Unit tests for schema diff algorithm

use std::collections::HashMap;

// Test types and functions for schema diff algorithm
#[derive(Debug, Clone)]
struct ColumnMeta {
    table: String,
    name: String,
    r#type: String,
    #[allow(dead_code)]
    default_kind: String,
    #[allow(dead_code)]
    codec: Option<String>,
}

#[derive(Debug, Clone)]
struct RustField {
    name: String,
    rust_type: String,
    serde_name: Option<String>,
    skip: bool,
}

#[derive(Debug, Clone)]
struct SchemaDiff {
    table: String,
    missing_in_db: Vec<RustField>,
    extra_in_db: Vec<ColumnMeta>,
    type_mismatches: Vec<(RustField, ColumnMeta)>,
}

/// Test implementation of the diff algorithm
fn compute_schema_diff(
    db_columns: &[ColumnMeta],
    rust_structs: &HashMap<String, HashMap<String, RustField>>,
) -> Vec<SchemaDiff> {
    let mut diffs = Vec::new();

    // Group database columns by table
    let mut db_by_table: HashMap<String, Vec<&ColumnMeta>> = HashMap::new();
    for col in db_columns {
        db_by_table.entry(col.table.clone()).or_default().push(col);
    }

    // Map table names to struct names
    let table_to_struct = |table: &str| -> Option<&str> {
        if table.starts_with("events_") {
            Some("Event")
        } else if table == "alerts" {
            Some("Alert")
        } else {
            None
        }
    };

    // Process each table
    for (table, db_cols) in &db_by_table {
        if let Some(struct_name) = table_to_struct(table) {
            if let Some(rust_fields) = rust_structs.get(struct_name) {
                let mut missing_in_db = Vec::new();
                let mut extra_in_db = Vec::new();
                let mut type_mismatches = Vec::new();

                // Create maps for easier lookup
                let db_col_map: HashMap<String, &ColumnMeta> =
                    db_cols.iter().map(|col| (col.name.clone(), *col)).collect();

                // Check for missing fields in DB
                for (field_name, rust_field) in rust_fields {
                    if rust_field.skip {
                        continue;
                    }

                    let db_field_name = rust_field.serde_name.as_ref().unwrap_or(field_name);

                    if let Some(db_col) = db_col_map.get(db_field_name) {
                        // Check for type mismatches
                        let expected_rust_type = convert_clickhouse_to_rust(&db_col.r#type);
                        if expected_rust_type != rust_field.rust_type {
                            type_mismatches.push((rust_field.clone(), (*db_col).clone()));
                        }
                    } else {
                        missing_in_db.push(rust_field.clone());
                    }
                }

                // Check for extra fields in DB
                for db_col in db_cols {
                    let found_in_rust = rust_fields.values().any(|rf| {
                        let db_field_name = rf.serde_name.as_ref().unwrap_or(&rf.name);
                        db_field_name == &db_col.name
                    });

                    if !found_in_rust {
                        extra_in_db.push((*db_col).clone());
                    }
                }

                if !missing_in_db.is_empty()
                    || !extra_in_db.is_empty()
                    || !type_mismatches.is_empty()
                {
                    diffs.push(SchemaDiff {
                        table: table.clone(),
                        missing_in_db,
                        extra_in_db,
                        type_mismatches,
                    });
                }
            }
        }
    }

    diffs
}

/// Convert ClickHouse type to Rust type for comparison
fn convert_clickhouse_to_rust(ch_type: &str) -> String {
    match ch_type {
        "String" => "String".to_string(),
        "UInt32" => "u32".to_string(),
        "UInt64" => "u64".to_string(),
        "Int32" => "i32".to_string(),
        "Int64" => "i64".to_string(),
        "Float32" => "f32".to_string(),
        "Float64" => "f64".to_string(),
        "UUID" => "Uuid".to_string(),
        "DateTime" => "DateTime<Utc>".to_string(),
        "Date" => "NaiveDate".to_string(),
        t if t.starts_with("Nullable(") => {
            let inner = &t[9..t.len() - 1];
            format!("Option<{}>", convert_clickhouse_to_rust(inner))
        }
        t if t.starts_with("Array(") => {
            let inner = &t[6..t.len() - 1];
            format!("Vec<{}>", convert_clickhouse_to_rust(inner))
        }
        _ => ch_type.to_string(), // Fallback to original type
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use insta::assert_debug_snapshot;

    #[test]
    fn test_schema_diff_missing_in_db() {
        let db_columns = vec![
            ColumnMeta {
                table: "events_test".to_string(),
                name: "id".to_string(),
                r#type: "UUID".to_string(),
                default_kind: "".to_string(),
                codec: None,
            },
            ColumnMeta {
                table: "events_test".to_string(),
                name: "timestamp".to_string(),
                r#type: "DateTime".to_string(),
                default_kind: "".to_string(),
                codec: None,
            },
        ];

        let mut rust_structs = HashMap::new();
        let mut event_fields = HashMap::new();

        event_fields.insert(
            "id".to_string(),
            RustField {
                name: "id".to_string(),
                rust_type: "Uuid".to_string(),
                serde_name: None,
                skip: false,
            },
        );

        event_fields.insert(
            "timestamp".to_string(),
            RustField {
                name: "timestamp".to_string(),
                rust_type: "DateTime<Utc>".to_string(),
                serde_name: None,
                skip: false,
            },
        );

        // Add a field that's missing in DB
        event_fields.insert(
            "tenant_id".to_string(),
            RustField {
                name: "tenant_id".to_string(),
                rust_type: "Uuid".to_string(),
                serde_name: None,
                skip: false,
            },
        );

        rust_structs.insert("Event".to_string(), event_fields);

        let diffs = compute_schema_diff(&db_columns, &rust_structs);

        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].table, "events_test");
        assert_eq!(diffs[0].missing_in_db.len(), 1);
        assert_eq!(diffs[0].missing_in_db[0].name, "tenant_id");
        assert_eq!(diffs[0].extra_in_db.len(), 0);
        assert_eq!(diffs[0].type_mismatches.len(), 0);
    }

    #[test]
    fn test_schema_diff_extra_in_db() {
        let db_columns = vec![
            ColumnMeta {
                table: "events_test".to_string(),
                name: "id".to_string(),
                r#type: "UUID".to_string(),
                default_kind: "".to_string(),
                codec: None,
            },
            ColumnMeta {
                table: "events_test".to_string(),
                name: "legacy_field".to_string(),
                r#type: "String".to_string(),
                default_kind: "".to_string(),
                codec: None,
            },
        ];

        let mut rust_structs = HashMap::new();
        let mut event_fields = HashMap::new();

        event_fields.insert(
            "id".to_string(),
            RustField {
                name: "id".to_string(),
                rust_type: "Uuid".to_string(),
                serde_name: None,
                skip: false,
            },
        );

        rust_structs.insert("Event".to_string(), event_fields);

        let diffs = compute_schema_diff(&db_columns, &rust_structs);

        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].table, "events_test");
        assert_eq!(diffs[0].missing_in_db.len(), 0);
        assert_eq!(diffs[0].extra_in_db.len(), 1);
        assert_eq!(diffs[0].extra_in_db[0].name, "legacy_field");
        assert_eq!(diffs[0].type_mismatches.len(), 0);
    }

    #[test]
    fn test_schema_diff_type_mismatch() {
        let db_columns = vec![ColumnMeta {
            table: "events_test".to_string(),
            name: "count".to_string(),
            r#type: "UInt32".to_string(),
            default_kind: "".to_string(),
            codec: None,
        }];

        let mut rust_structs = HashMap::new();
        let mut event_fields = HashMap::new();

        // Rust field expects u64 but DB has UInt32
        event_fields.insert(
            "count".to_string(),
            RustField {
                name: "count".to_string(),
                rust_type: "u64".to_string(),
                serde_name: None,
                skip: false,
            },
        );

        rust_structs.insert("Event".to_string(), event_fields);

        let diffs = compute_schema_diff(&db_columns, &rust_structs);

        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].table, "events_test");
        assert_eq!(diffs[0].missing_in_db.len(), 0);
        assert_eq!(diffs[0].extra_in_db.len(), 0);
        assert_eq!(diffs[0].type_mismatches.len(), 1);
        assert_eq!(diffs[0].type_mismatches[0].0.name, "count");
        assert_eq!(diffs[0].type_mismatches[0].1.r#type, "UInt32");
    }

    #[test]
    fn test_schema_diff_serde_rename() {
        let db_columns = vec![ColumnMeta {
            table: "events_test".to_string(),
            name: "event_timestamp".to_string(),
            r#type: "DateTime".to_string(),
            default_kind: "".to_string(),
            codec: None,
        }];

        let mut rust_structs = HashMap::new();
        let mut event_fields = HashMap::new();

        // Rust field with serde rename
        event_fields.insert(
            "timestamp".to_string(),
            RustField {
                name: "timestamp".to_string(),
                rust_type: "DateTime<Utc>".to_string(),
                serde_name: Some("event_timestamp".to_string()),
                skip: false,
            },
        );

        rust_structs.insert("Event".to_string(), event_fields);

        let diffs = compute_schema_diff(&db_columns, &rust_structs);

        // Should find no differences since serde rename matches DB column name
        assert_eq!(diffs.len(), 0);
    }

    #[test]
    fn test_schema_diff_skip_field() {
        let db_columns = vec![ColumnMeta {
            table: "events_test".to_string(),
            name: "id".to_string(),
            r#type: "UUID".to_string(),
            default_kind: "".to_string(),
            codec: None,
        }];

        let mut rust_structs = HashMap::new();
        let mut event_fields = HashMap::new();

        event_fields.insert(
            "id".to_string(),
            RustField {
                name: "id".to_string(),
                rust_type: "Uuid".to_string(),
                serde_name: None,
                skip: false,
            },
        );

        // Add a skipped field that shouldn't be considered
        event_fields.insert(
            "computed_field".to_string(),
            RustField {
                name: "computed_field".to_string(),
                rust_type: "String".to_string(),
                serde_name: None,
                skip: true,
            },
        );

        rust_structs.insert("Event".to_string(), event_fields);

        let diffs = compute_schema_diff(&db_columns, &rust_structs);

        // Should find no differences since skipped field is ignored
        assert_eq!(diffs.len(), 0);
    }

    #[test]
    fn test_schema_diff_snapshot() {
        let db_columns = vec![
            ColumnMeta {
                table: "events_test".to_string(),
                name: "id".to_string(),
                r#type: "UUID".to_string(),
                default_kind: "".to_string(),
                codec: None,
            },
            ColumnMeta {
                table: "events_test".to_string(),
                name: "legacy_count".to_string(),
                r#type: "UInt32".to_string(),
                default_kind: "".to_string(),
                codec: None,
            },
        ];

        let mut rust_structs = HashMap::new();
        let mut event_fields = HashMap::new();

        event_fields.insert(
            "id".to_string(),
            RustField {
                name: "id".to_string(),
                rust_type: "Uuid".to_string(),
                serde_name: None,
                skip: false,
            },
        );

        // Missing in DB
        event_fields.insert(
            "tenant_id".to_string(),
            RustField {
                name: "tenant_id".to_string(),
                rust_type: "Uuid".to_string(),
                serde_name: None,
                skip: false,
            },
        );

        // Type mismatch
        event_fields.insert(
            "count".to_string(),
            RustField {
                name: "count".to_string(),
                rust_type: "u64".to_string(),
                serde_name: Some("legacy_count".to_string()),
                skip: false,
            },
        );

        rust_structs.insert("Event".to_string(), event_fields);

        let diffs = compute_schema_diff(&db_columns, &rust_structs);

        // Use insta for snapshot testing
        assert_debug_snapshot!(diffs);
    }

    #[test]
    fn test_type_conversion() {
        assert_eq!(convert_clickhouse_to_rust("String"), "String");
        assert_eq!(convert_clickhouse_to_rust("UInt32"), "u32");
        assert_eq!(convert_clickhouse_to_rust("UInt64"), "u64");
        assert_eq!(convert_clickhouse_to_rust("UUID"), "Uuid");
        assert_eq!(convert_clickhouse_to_rust("DateTime"), "DateTime<Utc>");
        assert_eq!(
            convert_clickhouse_to_rust("Nullable(String)"),
            "Option<String>"
        );
        assert_eq!(convert_clickhouse_to_rust("Array(UInt32)"), "Vec<u32>");
        assert_eq!(
            convert_clickhouse_to_rust("Nullable(Array(String))"),
            "Option<Vec<String>>"
        );
    }
}
