//! Compiler operator tests for v2 DSL → SQL
use siem_unified_pipeline::v2::compiler::{SearchDsl, SearchSection, TimeRange, Expr};

/// Helper to compile and return SQL
fn compile_where(expr: Expr) -> String {
    let dsl = SearchDsl {
        version: Some("1".into()),
        search: Some(SearchSection { time_range: Some(TimeRange::Last { last_seconds: 900 }), where_: Some(expr), tenant_ids: vec!["default".into()] }),
        threshold: None, cardinality: None, sequence: None,
    };
    let res = siem_unified_pipeline::v2::compiler::compile_search(&dsl, "dev.events").expect("compile");
    res.sql
}

#[test]
fn json_meta_equivalent_via_json_eq() {
    // eq(json_meta("http.user_agent"), "Mozilla") is represented as JsonEq(("metadata.http.user_agent", "Mozilla"))
    let sql = compile_where(Expr::JsonEq(("metadata.http.user_agent".into(), serde_json::json!("Mozilla"))));
    assert!(sql.contains("JSONExtractString(metadata, 'http.user_agent') = 'Mozilla'"));
}

#[test]
fn json_raw_guarded() {
    // eq(json_raw("resource.service.name"), "app") via JsonEq with raw_event path
    let sql = compile_where(Expr::JsonEq(("raw_event.resource.service.name".into(), serde_json::json!("app"))));
    assert!(sql.contains("if(isValidJSON(raw_event), JSONExtractString(raw_event, 'resource.service.name'), NULL) = 'app'"));
}

#[test]
fn ip_in_cidr_basic() {
    let sql = compile_where(Expr::IpInCidr(("source_ip".into(), "10.0.0.0/8".into())));
    assert!(sql.contains("ipCIDRMatch(source_ip, '10.0.0.0/8')"));
}

#[test]
fn contains_any_single_and_multi() {
    let sql1 = compile_where(Expr::ContainsAny(("message".into(), vec!["fail".into()])));
    assert!(sql1.contains("positionCaseInsensitive(message, 'fail') > 0"));
    let sql2 = compile_where(Expr::ContainsAny(("message".into(), vec!["fail".into(), "error".into()])));
    assert!(sql2.contains("multiSearchAnyCaseInsensitive(message, ['fail','error'])"));
}


