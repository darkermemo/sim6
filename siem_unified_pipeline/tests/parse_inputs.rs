use siem_unified_pipeline::v2::handlers::parse::coerce_sample_any;

#[test]
fn coerce_sample_any_prefers_sample() {
    let s = Some("A".to_string());
    let out = coerce_sample_any(&s, &None, &None, &None);
    assert_eq!(out, "A");
}

#[test]
fn coerce_sample_any_uses_first_samples() {
    let out = coerce_sample_any(&None, &Some(vec!["X".into(), "Y".into()]), &None, &None);
    assert_eq!(out, "X");
}

#[test]
fn coerce_sample_any_falls_back_to_raw() {
    let out = coerce_sample_any(&None, &None, &Some("R".into()), &None);
    assert_eq!(out, "R");
}

#[test]
fn coerce_sample_any_serializes_record() {
    let v = serde_json::json!({"a":1});
    let out = coerce_sample_any(&None, &None, &None, &Some(v));
    assert!(out.contains("\"a\""));
}


