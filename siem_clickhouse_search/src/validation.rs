//! Input validation module for search requests and security
//! Provides comprehensive validation, sanitization, and security checks

use crate::dto::{SearchRequest, TimeRange, Pagination, FilterValue};
use crate::security::Claims;
use anyhow::{Context, Result};
use chrono::{DateTime, Utc, Duration};
use regex::Regex;
use std::collections::HashMap;
use tracing::{debug, warn};

/// Maximum allowed query length
const MAX_QUERY_LENGTH: usize = 256;

/// Maximum allowed page size
const MAX_PAGE_SIZE: u32 = 1000;

/// Maximum time range in days
const MAX_TIME_RANGE_DAYS: i64 = 90;

/// Allowed characters in search queries (alphanumeric, spaces, basic punctuation)
const ALLOWED_QUERY_PATTERN: &str = r#"^[\w\s\.\-\*:/\(\)\[\]"']+$"#;

/// SQL injection patterns to detect and block
const SQL_INJECTION_PATTERNS: &[&str] = &[
    r"(?i)\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b",
    r"(?i)\b(or|and)\s+\d+\s*=\s*\d+",
    r#"(?i)\b(or|and)\s+['"]\w+['"]\s*=\s*['"]\w+['"]?"#,
    r"--",
    r"/\*.*\*/",
    r"(?i)\bxp_cmdshell\b",
    r"(?i)\bsp_\w+\b",
    r"[';]\s*(drop|delete|truncate|alter)",
];

/// Validation service for search requests
pub struct ValidationService {
    query_regex: Regex,
    sql_injection_regexes: Vec<Regex>,
}

impl ValidationService {
    /// Create a new validation service
    pub fn new() -> Result<Self> {
        let query_regex = Regex::new(ALLOWED_QUERY_PATTERN)
            .context("Failed to compile query validation regex")?;
        
        let mut sql_injection_regexes = Vec::new();
        for pattern in SQL_INJECTION_PATTERNS {
            let regex = Regex::new(pattern)
                .with_context(|| format!("Failed to compile SQL injection pattern: {}", pattern))?;
            sql_injection_regexes.push(regex);
        }
        
        Ok(Self {
            query_regex,
            sql_injection_regexes,
        })
    }
    
    /// Validate and sanitize a search request
    pub fn validate_search_request(
        &self,
        mut request: SearchRequest,
        claims: &Claims,
        enable_tenant_isolation: bool,
    ) -> Result<SearchRequest> {
        // Set tenant_id from JWT claims if tenant isolation is enabled
        if enable_tenant_isolation {
            request.tenant_id = Some(claims.tenant_id.clone());
        }
        
        // Validate query string
        if let Some(ref query) = request.query {
            self.validate_query_string(query)
                .context("Invalid query string")?;
        }
        
        // Validate time range
        if let Some(ref time_range) = request.time_range {
            self.validate_time_range(time_range)
                .context("Invalid time range")?;
        }
        
        // Validate pagination
        if let Some(ref pagination) = request.pagination {
            self.validate_pagination(pagination)
                .context("Invalid pagination parameters")?;
        }
        
        // Validate filters
        if let Some(ref filters) = request.filters {
            self.validate_filters(filters)
                .context("Invalid filter parameters")?;
        }
        
        // Sanitize query string
        if let Some(ref mut query) = request.query {
            *query = self.sanitize_query_string(query);
        }
        
        debug!("Search request validated for tenant: {}", claims.tenant_id);
        
        Ok(request)
    }
    
    /// Validate query string for length, characters, and SQL injection
    fn validate_query_string(&self, query: &str) -> Result<()> {
        // Check length
        if query.len() > MAX_QUERY_LENGTH {
            return Err(anyhow::anyhow!(
                "Query too long: {} characters (max: {})",
                query.len(),
                MAX_QUERY_LENGTH
            ));
        }
        
        // Check for empty or whitespace-only queries
        if query.trim().is_empty() {
            return Err(anyhow::anyhow!("Query cannot be empty"));
        }
        
        // Check allowed characters
        if !self.query_regex.is_match(query) {
            warn!("Query contains invalid characters: {}", query);
            return Err(anyhow::anyhow!(
                "Query contains invalid characters. Only alphanumeric characters, spaces, and basic punctuation are allowed."
            ));
        }
        
        // Check for SQL injection patterns
        for regex in &self.sql_injection_regexes {
            if regex.is_match(query) {
                warn!("Potential SQL injection detected in query: {}", query);
                return Err(anyhow::anyhow!(
                    "Query contains potentially dangerous patterns"
                ));
            }
        }
        
        Ok(())
    }
    
    /// Validate time range constraints
    fn validate_time_range(&self, time_range: &TimeRange) -> Result<()> {
        // Check that start is before end
        if time_range.start >= time_range.end {
            return Err(anyhow::anyhow!(
                "Start time must be before end time"
            ));
        }
        
        // Check maximum time range
        let duration = time_range.end - time_range.start;
        if duration > Duration::days(MAX_TIME_RANGE_DAYS) {
            return Err(anyhow::anyhow!(
                "Time range too large: {} days (max: {} days)",
                duration.num_days(),
                MAX_TIME_RANGE_DAYS
            ));
        }
        
        // Check that times are not in the future
        let now = Utc::now();
        if time_range.start > now || time_range.end > now {
            return Err(anyhow::anyhow!(
                "Time range cannot be in the future"
            ));
        }
        
        Ok(())
    }
    
    /// Validate pagination parameters
    fn validate_pagination(&self, pagination: &Pagination) -> Result<()> {
        // Check page size
        if pagination.size > MAX_PAGE_SIZE {
            return Err(anyhow::anyhow!(
                "Page size too large: {} (max: {})",
                pagination.size,
                MAX_PAGE_SIZE
            ));
        }
        
        if pagination.size == 0 {
            return Err(anyhow::anyhow!("Page size must be greater than 0"));
        }
        
        // Check page number
        if pagination.page == 0 {
            return Err(anyhow::anyhow!("Page number must be greater than 0"));
        }
        
        Ok(())
    }
    
    /// Validate filter values
    fn validate_filters(&self, filters: &HashMap<String, FilterValue>) -> Result<()> {
        for (field, filter_value) in filters {
            // Validate field name (only allow known safe fields)
            if !self.is_valid_field_name(field) {
                return Err(anyhow::anyhow!(
                    "Invalid field name: {}",
                    field
                ));
            }
            
            // Validate filter value
            self.validate_filter_value(filter_value)
                .with_context(|| format!("Invalid filter value for field: {}", field))?;
        }
        
        Ok(())
    }
    
    /// Check if field name is valid (alphanumeric and underscores only)
    fn is_valid_field_name(&self, field: &str) -> bool {
        field.chars().all(|c| c.is_alphanumeric() || c == '_') &&
        !field.is_empty() &&
        field.len() <= 64
    }
    
    /// Validate individual filter values
    fn validate_filter_value(&self, filter_value: &FilterValue) -> Result<()> {
        match filter_value {
            FilterValue::Equals(value) |
            FilterValue::NotEquals(value) |
            FilterValue::Contains(value) |
            FilterValue::NotContains(value) |
            FilterValue::StartsWith(value) |
            FilterValue::EndsWith(value) |
            FilterValue::GreaterThan(value) |
            FilterValue::GreaterThanOrEqual(value) |
            FilterValue::LessThan(value) |
            FilterValue::LessThanOrEqual(value) => {
                self.validate_filter_string_value(value)?;
            },
            FilterValue::Regex(pattern) => {
                self.validate_regex_pattern(pattern)?;
            },
            FilterValue::In(values) | FilterValue::NotIn(values) => {
                if values.len() > 100 {
                    return Err(anyhow::anyhow!(
                        "Too many values in filter: {} (max: 100)",
                        values.len()
                    ));
                }
                for value in values {
                    self.validate_filter_string_value(value)?;
                }
            },
            FilterValue::Between(start, end) => {
                self.validate_filter_string_value(start)?;
                self.validate_filter_string_value(end)?;
            },
            FilterValue::Exists | FilterValue::NotExists => {
                // No validation needed for existence checks
            }
        }
        
        Ok(())
    }
    
    /// Validate string values in filters
    fn validate_filter_string_value(&self, value: &str) -> Result<()> {
        if value.len() > 1000 {
            return Err(anyhow::anyhow!(
                "Filter value too long: {} characters (max: 1000)",
                value.len()
            ));
        }
        
        // Check for SQL injection in filter values
        for regex in &self.sql_injection_regexes {
            if regex.is_match(value) {
                warn!("Potential SQL injection detected in filter value: {}", value);
                return Err(anyhow::anyhow!(
                    "Filter value contains potentially dangerous patterns"
                ));
            }
        }
        
        Ok(())
    }
    
    /// Validate regex patterns
    fn validate_regex_pattern(&self, pattern: &str) -> Result<()> {
        // Check pattern length
        if pattern.len() > 500 {
            return Err(anyhow::anyhow!(
                "Regex pattern too long: {} characters (max: 500)",
                pattern.len()
            ));
        }
        
        // Try to compile the regex to ensure it's valid
        Regex::new(pattern)
            .with_context(|| format!("Invalid regex pattern: {}", pattern))?;
        
        // Check for potentially dangerous regex patterns
        if pattern.contains(".*.*") || pattern.contains(".+.+") {
            return Err(anyhow::anyhow!(
                "Regex pattern may cause excessive backtracking"
            ));
        }
        
        Ok(())
    }
    
    /// Sanitize query string by trimming and normalizing whitespace
    fn sanitize_query_string(&self, query: &str) -> String {
        // Trim whitespace and normalize multiple spaces to single spaces
        query.trim()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    }
}

impl Default for ValidationService {
    fn default() -> Self {
        Self::new().expect("Failed to create validation service")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dto::{Pagination, TimeRange};
    use chrono::Utc;
    use std::collections::HashMap;
    
    #[allow(dead_code)]
    fn create_test_claims() -> Claims {
        Claims {
            sub: "test_user".to_string(),
            tenant_id: "test_tenant".to_string(),
            roles: vec!["user".to_string()],
            iat: Utc::now().timestamp(),
            exp: None,
            iss: "siem-auth".to_string(),
            aud: "siem-search".to_string(),
            jti: "test_jti".to_string(),
            custom: None,
        }
    }
    
    #[test]
    fn test_valid_query_string() {
        let validator = ValidationService::new().unwrap();
        assert!(validator.validate_query_string("test query").is_ok());
        assert!(validator.validate_query_string("user:admin AND status:active").is_ok());
    }
    
    #[test]
    fn test_sql_injection_detection() {
        let validator = ValidationService::new().unwrap();
        assert!(validator.validate_query_string("test' OR 1=1 --").is_err());
        assert!(validator.validate_query_string("UNION SELECT * FROM users").is_err());
        assert!(validator.validate_query_string("'; DROP TABLE events; --").is_err());
    }
    
    #[test]
    fn test_query_length_validation() {
        let validator = ValidationService::new().unwrap();
        let long_query = "a".repeat(MAX_QUERY_LENGTH + 1);
        assert!(validator.validate_query_string(&long_query).is_err());
    }
    
    #[test]
    fn test_time_range_validation() {
        let validator = ValidationService::new().unwrap();
        let now = Utc::now();
        
        // Valid time range
        let valid_range = TimeRange {
            start: now - Duration::hours(1),
            end: now,
            timezone: None,
        };
        assert!(validator.validate_time_range(&valid_range).is_ok());
        
        // Invalid: start after end
        let invalid_range = TimeRange {
            start: now,
            end: now - Duration::hours(1),
            timezone: None,
        };
        assert!(validator.validate_time_range(&invalid_range).is_err());
        
        // Invalid: too large range
        let large_range = TimeRange {
            start: now - Duration::days(MAX_TIME_RANGE_DAYS + 1),
            end: now,
            timezone: None,
        };
        assert!(validator.validate_time_range(&large_range).is_err());
    }
    
    #[test]
    fn test_pagination_validation() {
        let validator = ValidationService::new().unwrap();
        
        // Valid pagination
        let valid_pagination = Pagination {
            page: 1,
            size: 50,
            cursor: None,
            include_total: true,
        };
        assert!(validator.validate_pagination(&valid_pagination).is_ok());
        
        // Invalid: page size too large
        let invalid_pagination = Pagination {
            page: 1,
            size: MAX_PAGE_SIZE + 1,
            cursor: None,
            include_total: true,
        };
        assert!(validator.validate_pagination(&invalid_pagination).is_err());
    }
}