// Thin ClickHouse HTTP client with named parameters
use reqwest::{Client, header::CONTENT_TYPE};
use serde::de::DeserializeOwned;
use serde_json::Value;
use anyhow::Result;

pub struct Ch {
    http: Client,
    base: String,            // e.g., http://127.0.0.1:8123
    user: String,            // read-only user
    pass: String,
}

impl Ch {
    pub fn new(base: String, user: String, pass: String) -> Self {
        Self { 
            http: Client::new(), 
            base, 
            user, 
            pass 
        }
    }

    /// Execute a parameterized query and return typed JSON response
    /// 
    /// # Arguments
    /// * `sql` - SQL with placeholders like {tenant:String}, {from:UInt32}
    /// * `params` - Named parameters [("tenant", "default"), ("from", "1234567890")]
    /// * `settings` - ClickHouse settings [("max_execution_time", "8"), ("max_result_rows", "10000")]
    pub async fn query_json<T: DeserializeOwned>(
        &self,
        sql: &str,
        params: &[(&str, String)],
        settings: &[(&str, &str)],
    ) -> Result<T> {
        // Build query string with params & settings
        let mut url = format!("{}/?user={}&password={}", self.base, self.user, self.pass);
        
        // Add named parameters (ClickHouse expects param_<name> for {name:Type} placeholders)
        for (k, v) in params {
            url.push_str(&format!("&param_{}={}", k, urlencoding::encode(v)));
        }
        
        // Add settings
        for (k, v) in settings {
            url.push_str(&format!("&{}={}", k, v));
        }
        
        // Add JSON format
        let query = format!("{} FORMAT JSON", sql);
        
        // Execute request
        let res = self.http
            .post(&url)
            .header(CONTENT_TYPE, "text/plain; charset=utf-8")
            .body(query)
            .send()
            .await?
            .error_for_status()?
            .bytes()
            .await?;
            
        let parsed: T = serde_json::from_slice(&res)?;
        Ok(parsed)
    }
    
    /// Execute a query and return raw JSON value
    pub async fn query_json_value(
        &self,
        sql: &str,
        params: &[(&str, String)],
        settings: &[(&str, &str)],
    ) -> Result<Value> {
        self.query_json::<Value>(sql, params, settings).await
    }
}

/// Standard query settings for safety
pub fn default_query_settings() -> Vec<(&'static str, &'static str)> {
    vec![
        ("max_execution_time", "8"),
        ("max_result_rows", "10000"),
        ("max_result_bytes", "104857600"), // 100MB
        ("max_memory_usage", "1073741824"), // 1GB
        ("readonly", "1"),
    ]
}

/// ClickHouse JSON response format
#[derive(Debug, serde::Deserialize)]
pub struct ChResponse {
    pub meta: Vec<ChMeta>,
    pub data: Vec<Value>,
    pub rows: usize,
    pub rows_before_limit_at_least: Option<usize>,
    pub statistics: Option<ChStats>,
}

#[derive(Debug, serde::Deserialize)]
pub struct ChMeta {
    pub name: String,
    #[serde(rename = "type")]
    pub ch_type: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct ChStats {
    pub elapsed: f64,
    pub rows_read: u64,
    pub bytes_read: u64,
}
