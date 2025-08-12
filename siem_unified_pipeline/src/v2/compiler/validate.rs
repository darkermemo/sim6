use crate::v2::schema::catalog::{canonicalize_field, is_string_like, is_numeric, is_ip_string_field};
use super::Expr;

#[derive(Debug, Clone)]
pub struct ValidationError {
    pub code: &'static str,
    pub field: Option<String>,
    pub message: String,
    pub suggestions: Vec<String>,
}

pub fn validate_expr(expr: &Expr) -> Result<(), ValidationError> {
    match expr {
        Expr::And(list) | Expr::Or(list) => {
            for e in list { validate_expr(e)?; }
            Ok(())
        }
        Expr::Not(inner) => validate_expr(inner),
        Expr::Eq((f,_)) | Expr::Ne((f,_)) => { validate_field_basic(f) }
        Expr::JsonEq((path,_)) => {
            // Allow JSON paths under metadata.* or raw_event.* without catalog lookup
            if path.starts_with("metadata.") || path.starts_with("raw_event.") {
                return Ok(());
            }
            validate_field_basic(path)
        }
        Expr::In((f,_)) | Expr::Nin((f,_)) => validate_field_basic(f),
        Expr::Contains((f,_)) | Expr::ContainsAny((f,_)) | Expr::Startswith((f,_)) | Expr::Endswith((f,_)) | Expr::Regex((f,_)) => {
            let (canon, kind) = canonicalize_field(f);
            let Some(k) = kind else { return Err(unknown_field_err(f)); };
            if !is_string_like(k) {
                return Err(ValidationError{ code: "INVALID_OPERATOR_TYPE", field: Some(canon.to_string()), message: "string operator on non-string field".into(), suggestions: vec![] });
            }
            Ok(())
        }
        Expr::Gt((f,_)) | Expr::Gte((f,_)) | Expr::Lt((f,_)) | Expr::Lte((f,_)) | Expr::Between((f,_,_)) => {
            let (canon, kind) = canonicalize_field(f);
            let Some(k) = kind else { return Err(unknown_field_err(f)); };
            if !is_numeric(k) {
                return Err(ValidationError{ code: "INVALID_OPERATOR_TYPE", field: Some(canon.to_string()), message: "numeric operator on non-numeric field".into(), suggestions: vec![] });
            }
            Ok(())
        }
        Expr::IpInCidr((f,_)) => {
            let (canon, kind) = canonicalize_field(f);
            let Some(k) = kind else { return Err(unknown_field_err(f)); };
            if !(is_string_like(k) && is_ip_string_field(canon)) {
                return Err(ValidationError{ code: "INVALID_OPERATOR_TYPE", field: Some(canon.to_string()), message: "ip operator on non-ip field".into(), suggestions: vec!["source_ip".into(), "destination_ip".into()] });
            }
            Ok(())
        }
        Expr::Exists(f) | Expr::Missing(f) | Expr::IsNull(f) | Expr::NotNull(f) => {
            let (canon, kind) = canonicalize_field(f);
            let Some(_) = kind else { return Err(unknown_field_err(f)); };
            let _ = canon; // just existence check
            Ok(())
        }
    }
}

fn validate_field_basic(f: &str) -> Result<(), ValidationError> {
    let (canon, kind) = canonicalize_field(f);
    if kind.is_none() {
        return Err(unknown_field_err(f));
    }
    let _ = canon;
    Ok(())
}

fn unknown_field_err(f: &str) -> ValidationError {
    let sug = crate::v2::schema::catalog::suggestions(f);
    ValidationError{ code: "UNKNOWN_FIELD", field: Some(f.to_string()), message: "Unknown field".into(), suggestions: sug }
}


