#[cfg(test)]
mod tests {
    use super::*;
    use crate::dto::{FilterValue, SearchRequest, SearchQuery, Filter};
    use std::collections::HashMap;

    #[test]
    fn test_filter_value_in_binding() {
        let config = Config::default();
        let mut request = SearchRequest::default();
        
        // Create a filter with IN clause
        let filter = Filter {
            field: "severity".to_string(),
            value: FilterValue::In(vec!["high".to_string(), "medium".to_string(), "low".to_string()]),
        };
        
        request.query = Some(SearchQuery {
            filters: vec![filter],
            ..Default::default()
        });
        
        let query_builder = QueryBuilder::new(&config, &request);
        
        // Test build_filter_clause for IN values
        let result = query_builder.build_filter_clause("severity", &FilterValue::In(vec![
            "high".to_string(),
            "medium".to_string(), 
            "low".to_string()
        ]));
        
        assert!(result.is_ok());
        let (sql_clause, param_value) = result.unwrap();
        
        // Verify SQL clause has correct named parameters
        assert_eq!(sql_clause, "severity IN (:severity_in_0, :severity_in_1, :severity_in_2)");
        
        // Verify parameter value contains all values
        assert!(param_value.is_some());
        let param_str = param_value.unwrap();
        assert_eq!(param_str, "high,medium,low");
        
        // Verify the parameter can be split correctly
        let values: Vec<&str> = param_str.split(',').collect();
        assert_eq!(values.len(), 3);
        assert_eq!(values, vec!["high", "medium", "low"]);
    }
    
    #[test]
    fn test_invalid_field_name_rejection() {
        let config = Config::default();
        let request = SearchRequest::default();
        let query_builder = QueryBuilder::new(&config, &request);
        
        // Test with invalid field name (SQL injection attempt)
        let result = query_builder.build_filter_clause(
            "severity; DROP TABLE events; --", 
            &FilterValue::Equals("high".to_string())
        );
        
        assert!(result.is_err());
        let error_msg = result.unwrap_err().to_string();
        assert!(error_msg.contains("Invalid filter field"));
    }
    
    #[test]
    fn test_allowed_field_names() {
        let config = Config::default();
        let request = SearchRequest::default();
        let query_builder = QueryBuilder::new(&config, &request);
        
        // Test with valid field names
        let valid_fields = vec![
            "event_id", "tenant_id", "source_ip", "severity", "message"
        ];
        
        for field in valid_fields {
            let result = query_builder.build_filter_clause(
                field,
                &FilterValue::Equals("test".to_string())
            );
            assert!(result.is_ok(), "Field '{}' should be allowed", field);
        }
    }
    
    #[test]
    fn test_filter_value_not_in_binding() {
        let config = Config::default();
        let request = SearchRequest::default();
        let query_builder = QueryBuilder::new(&config, &request);
        
        // Test build_filter_clause for NOT IN values
        let result = query_builder.build_filter_clause("severity", &FilterValue::NotIn(vec![
            "debug".to_string(),
            "trace".to_string()
        ]));
        
        assert!(result.is_ok());
        let (sql_clause, param_value) = result.unwrap();
        
        // Verify SQL clause has correct named parameters
        assert_eq!(sql_clause, "severity NOT IN (:severity_not_in_0, :severity_not_in_1)");
        
        // Verify parameter value contains all values
        assert!(param_value.is_some());
        let param_str = param_value.unwrap();
        assert_eq!(param_str, "debug,trace");
    }
}