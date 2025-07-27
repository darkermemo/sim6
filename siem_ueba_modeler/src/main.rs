use anyhow::{Context, Result};
use chrono::Utc;
use dotenvy::dotenv;
use env_logger;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use log::{error, info, warn};
use reqwest::Client;
use serde::{Deserialize, Serialize};
// Removed statrs dependency - using manual statistical calculations instead
use std::collections::HashMap;
use std::env;
use std::time::Duration;
use tokio::time::interval;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,
    tid: String,
    roles: Vec<String>,
    exp: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct BehavioralBaseline {
    baseline_id: String,
    tenant_id: String,
    entity_id: String,
    entity_type: String,
    metric: String,
    baseline_value_avg: f64,
    baseline_value_stddev: f64,
    sample_count: u32,
    calculation_period_days: u32,
    confidence_score: f64,
    last_updated: u32,
    created_at: u32,
}

#[derive(Debug, Serialize)]
struct CreateBaselinesRequest {
    baselines: Vec<BehavioralBaseline>,
}

#[derive(Debug, Deserialize)]
struct ClickHouseResponse {
    data: Vec<serde_json::Value>,
}

#[derive(Debug, Clone)]
struct UserLoginStats {
    user: String,
    total_logins: f64,
    hours_observed: f64,
    avg_logins_per_hour: f64,
}

#[derive(Debug, Clone)]
struct ServerDataStats {
    server_ip: String,
    total_bytes_out: f64,
    days_observed: f64,
    avg_bytes_per_day: f64,
}

struct UebaModeler {
    client: Client,
    api_base_url: String,
    clickhouse_url: String,
    service_token: String,
    calculation_period_days: u32,
}

impl UebaModeler {
    async fn new() -> Result<Self> {
        let api_base_url = env::var("API_BASE_URL").unwrap_or_else(|_| "http://localhost:8080/v1".to_string());
        let clickhouse_url = env::var("CLICKHOUSE_URL").unwrap_or_else(|_| "http://localhost:8123".to_string());
        let jwt_secret = env::var("JWT_SECRET").unwrap_or_else(|_| "this-is-a-very-long-secure-random-string-for-jwt-signing-do-not-use-in-production".to_string());
        let calculation_period_days = env::var("CALCULATION_PERIOD_DAYS")
            .unwrap_or_else(|_| "30".to_string())
            .parse::<u32>()
            .unwrap_or(30);
        
        // Generate a service account token
        let service_token = Self::generate_service_token(&jwt_secret);
        
        Ok(Self {
            client: Client::new(),
            api_base_url,
            clickhouse_url,
            service_token,
            calculation_period_days,
        })
    }
    
    fn generate_service_token(secret: &str) -> String {
        let claims = Claims {
            sub: "ueba-modeler-service".to_string(),
            tid: "system".to_string(),
            roles: vec!["Service".to_string()],
            exp: (chrono::Utc::now() + chrono::Duration::days(365)).timestamp() as usize,
        };
        
        let header = Header::new(Algorithm::HS256);
        let encoding_key = EncodingKey::from_secret(secret.as_ref());
        
        encode(&header, &claims, &encoding_key).expect("Failed to generate service token")
    }

    fn generate_tenant_token(&self, secret: &str, tenant_id: &str) -> String {
        let claims = Claims {
            sub: format!("ueba-modeler-{}", tenant_id),
            tid: tenant_id.to_string(),
            roles: vec!["Admin".to_string()],
            exp: (chrono::Utc::now() + chrono::Duration::hours(1)).timestamp() as usize,
        };
        
        let header = Header::new(Algorithm::HS256);
        let encoding_key = EncodingKey::from_secret(secret.as_ref());
        
        encode(&header, &claims, &encoding_key).expect("Failed to generate tenant token")
    }
    
    async fn fetch_tenants(&self) -> Result<Vec<String>> {
        let response = self.client
            .get(&format!("{}/service/tenants", self.api_base_url))
            .header("Authorization", format!("Bearer {}", self.service_token))
            .send()
            .await?;
        
        if !response.status().is_success() {
            return Err(anyhow::anyhow!("Failed to fetch tenants: {}", response.status()));
        }
        
        let json: serde_json::Value = response.json().await?;
        let mut tenants = Vec::new();
        
        if let Some(data) = json.get("data") {
            if let Some(array) = data.as_array() {
                for item in array {
                    if let Some(tenant_id) = item.get("tenant_id").and_then(|v| v.as_str()) {
                        tenants.push(tenant_id.to_string());
                    }
                }
            }
        }
        
        Ok(tenants)
    }
    
    async fn execute_clickhouse_query(&self, query: &str) -> Result<Vec<serde_json::Value>> {
        let response = self.client
            .post(&self.clickhouse_url)
            .body(format!("{} FORMAT JSON", query))
            .send()
            .await?;
        
        if !response.status().is_success() {
            return Err(anyhow::anyhow!("ClickHouse query failed: {}", response.text().await?));
        }
        
        let json: ClickHouseResponse = response.json().await?;
        Ok(json.data)
    }
    
    async fn calculate_user_login_baselines(&self, tenant_id: &str) -> Result<Vec<UserLoginStats>> {
        info!("Calculating user login baselines for tenant: {}", tenant_id);
        
        // Calculate average logins per hour for each user over the calculation period
        let query = format!(
            r#"
            WITH user_hourly_logins AS (
                SELECT 
                    user,
                    toStartOfHour(toDateTime(event_timestamp)) as hour,
                    COUNT(*) as login_count
                FROM dev.events 
                WHERE tenant_id = '{}'
                    AND event_category = 'Authentication'
                    AND event_outcome = 'Success'
                    AND user IS NOT NULL
                    AND user != ''
                    AND event_timestamp > (toUnixTimestamp(now()) - {})
                GROUP BY user, hour
            ),
            user_stats AS (
                SELECT 
                    user,
                    SUM(login_count) as total_logins,
                    COUNT(DISTINCT hour) as hours_observed,
                    AVG(login_count) as avg_logins_per_hour
                FROM user_hourly_logins
                GROUP BY user
                HAVING hours_observed >= 24  -- At least 24 hours of data
            )
            SELECT 
                user,
                total_logins,
                hours_observed,
                avg_logins_per_hour
            FROM user_stats
            ORDER BY user
            "#,
            tenant_id,
            self.calculation_period_days * 24 * 3600  // Convert days to seconds
        );
        
        let results = self.execute_clickhouse_query(&query).await?;
        let mut user_stats = Vec::new();
        
        for row in results {
            if let (Some(user), Some(total_logins), Some(hours_observed), Some(avg_logins_per_hour)) = (
                row.get("user").and_then(|v| v.as_str()),
                row.get("total_logins").and_then(|v| v.as_f64()),
                row.get("hours_observed").and_then(|v| v.as_f64()),
                row.get("avg_logins_per_hour").and_then(|v| v.as_f64()),
            ) {
                user_stats.push(UserLoginStats {
                    user: user.to_string(),
                    total_logins,
                    hours_observed,
                    avg_logins_per_hour,
                });
            }
        }
        
        info!("Calculated login baselines for {} users in tenant {}", user_stats.len(), tenant_id);
        Ok(user_stats)
    }
    
    async fn calculate_server_data_baselines(&self, tenant_id: &str) -> Result<Vec<ServerDataStats>> {
        info!("Calculating server data egress baselines for tenant: {}", tenant_id);
        
        // Calculate average bytes out per day for each server over the calculation period
        let query = format!(
            r#"
            WITH server_daily_traffic AS (
                SELECT 
                    source_ip,
                    toDate(toDateTime(event_timestamp)) as date,
                    SUM(bytes_out) as daily_bytes_out
                FROM dev.events 
                WHERE tenant_id = '{}'
                    AND bytes_out > 0
                    AND source_ip IS NOT NULL
                    AND source_ip != ''
                    AND event_timestamp > (toUnixTimestamp(now()) - {})
                GROUP BY source_ip, date
            ),
            server_stats AS (
                SELECT 
                    source_ip,
                    SUM(daily_bytes_out) as total_bytes_out,
                    COUNT(DISTINCT date) as days_observed,
                    AVG(daily_bytes_out) as avg_bytes_per_day
                FROM server_daily_traffic
                GROUP BY source_ip
                HAVING days_observed >= 7  -- At least 7 days of data
            )
            SELECT 
                source_ip as server_ip,
                total_bytes_out,
                days_observed,
                avg_bytes_per_day
            FROM server_stats
            ORDER BY source_ip
            "#,
            tenant_id,
            self.calculation_period_days * 24 * 3600  // Convert days to seconds
        );
        
        let results = self.execute_clickhouse_query(&query).await?;
        let mut server_stats = Vec::new();
        
        for row in results {
            if let (Some(server_ip), Some(total_bytes_out), Some(days_observed), Some(avg_bytes_per_day)) = (
                row.get("server_ip").and_then(|v| v.as_str()),
                row.get("total_bytes_out").and_then(|v| v.as_f64()),
                row.get("days_observed").and_then(|v| v.as_f64()),
                row.get("avg_bytes_per_day").and_then(|v| v.as_f64()),
            ) {
                server_stats.push(ServerDataStats {
                    server_ip: server_ip.to_string(),
                    total_bytes_out,
                    days_observed,
                    avg_bytes_per_day,
                });
            }
        }
        
        info!("Calculated data baselines for {} servers in tenant {}", server_stats.len(), tenant_id);
        Ok(server_stats)
    }
    
    async fn calculate_hourly_variance_baselines(&self, tenant_id: &str) -> Result<Vec<BehavioralBaseline>> {
        info!("Calculating hourly activity variance baselines for tenant: {}", tenant_id);
        
        // Calculate variance in hourly activity patterns for users
        let query = format!(
            r#"
            WITH user_hourly_activity AS (
                SELECT 
                    user,
                    toHour(toDateTime(event_timestamp)) as hour_of_day,
                    COUNT(*) as activity_count
                FROM dev.events 
                WHERE tenant_id = '{}'
                    AND user IS NOT NULL
                    AND user != ''
                    AND event_timestamp > (toUnixTimestamp(now()) - {})
                GROUP BY user, hour_of_day
            ),
            user_hourly_stats AS (
                SELECT 
                    user,
                    hour_of_day,
                    AVG(activity_count) as avg_activity,
                    COUNT(*) as sample_count
                FROM user_hourly_activity
                GROUP BY user, hour_of_day
                HAVING sample_count >= 3  -- At least 3 samples per hour
            )
            SELECT 
                user,
                hour_of_day,
                avg_activity,
                sample_count
            FROM user_hourly_stats
            ORDER BY user, hour_of_day
            "#,
            tenant_id,
            self.calculation_period_days * 24 * 3600
        );
        
        let results = self.execute_clickhouse_query(&query).await?;
        let mut baselines = Vec::new();
        let mut user_hourly_data: HashMap<String, Vec<f64>> = HashMap::new();
        
        // Group data by user
        for row in results {
            if let (Some(user), Some(hour_of_day), Some(avg_activity), Some(_sample_count)) = (
                row.get("user").and_then(|v| v.as_str()),
                row.get("hour_of_day").and_then(|v| v.as_u64()),
                row.get("avg_activity").and_then(|v| v.as_f64()),
                row.get("sample_count").and_then(|v| v.as_u64()),
            ) {
                let key = format!("{}:hourly_activity_hour_{}", user, hour_of_day);
                user_hourly_data.entry(key).or_insert_with(Vec::new).push(avg_activity);
            }
        }
        
        // Calculate statistics for each user's hourly patterns
        for (key, values) in user_hourly_data {
            if values.len() >= 3 {  // Minimum samples for meaningful statistics
                let mean = values.iter().sum::<f64>() / values.len() as f64;
                let variance = values.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / values.len() as f64;
                let std_dev = variance.sqrt();
                let confidence = Self::calculate_confidence_score(values.len(), std_dev / mean.max(1.0));
                
                let parts: Vec<&str> = key.split(':').collect();
                if parts.len() == 2 {
                    let user = parts[0];
                    let metric = parts[1];
                    
                    baselines.push(BehavioralBaseline {
                        baseline_id: Uuid::new_v4().to_string(),
                        tenant_id: tenant_id.to_string(),
                        entity_id: user.to_string(),
                        entity_type: "user".to_string(),
                        metric: metric.to_string(),
                        baseline_value_avg: mean,
                        baseline_value_stddev: std_dev,
                        sample_count: values.len() as u32,
                        calculation_period_days: self.calculation_period_days,
                        confidence_score: confidence,
                        last_updated: Utc::now().timestamp() as u32,
                        created_at: Utc::now().timestamp() as u32,
                    });
                }
            }
        }
        
        info!("Calculated {} hourly variance baselines for tenant {}", baselines.len(), tenant_id);
        Ok(baselines)
    }
    
    async fn create_baselines(&self, baselines: Vec<BehavioralBaseline>) -> Result<()> {
        if baselines.is_empty() {
            return Ok(());
        }
        
        let request = CreateBaselinesRequest { baselines };
        
        let response = self.client
            .post(&format!("{}/ueba/baselines", self.api_base_url))
            .header("Authorization", format!("Bearer {}", self.service_token))
            .json(&request)
            .send()
            .await?;
        
        if !response.status().is_success() {
            return Err(anyhow::anyhow!("Failed to create baselines: {} - {}", response.status(), response.text().await?));
        }
        
        Ok(())
    }
    
    async fn process_tenant(&self, tenant_id: &str) -> Result<()> {
        info!("Processing UEBA baselines for tenant: {}", tenant_id);
        let mut all_baselines = Vec::new();
        
        // 1. Calculate user login frequency baselines
        match self.calculate_user_login_baselines(tenant_id).await {
            Ok(user_stats) => {
                for stat in user_stats {
                    // Calculate additional statistics for login patterns
                    let std_dev = (stat.avg_logins_per_hour * 0.3).max(0.1); // Estimate std dev as 30% of mean
                    let confidence = Self::calculate_confidence_score(stat.hours_observed as usize, std_dev / stat.avg_logins_per_hour.max(1.0));
                    
                    all_baselines.push(BehavioralBaseline {
                        baseline_id: Uuid::new_v4().to_string(),
                        tenant_id: tenant_id.to_string(),
                        entity_id: stat.user,
                        entity_type: "user".to_string(),
                        metric: "login_count_per_hour".to_string(),
                        baseline_value_avg: stat.avg_logins_per_hour,
                        baseline_value_stddev: std_dev,
                        sample_count: stat.hours_observed as u32,
                        calculation_period_days: self.calculation_period_days,
                        confidence_score: confidence,
                        last_updated: Utc::now().timestamp() as u32,
                        created_at: Utc::now().timestamp() as u32,
                    });
                }
            }
            Err(e) => warn!("Failed to calculate user login baselines for tenant {}: {}", tenant_id, e),
        }
        
        // 2. Calculate server data egress baselines
        match self.calculate_server_data_baselines(tenant_id).await {
            Ok(server_stats) => {
                for stat in server_stats {
                    // Calculate additional statistics for data patterns
                    let std_dev = (stat.avg_bytes_per_day * 0.4).max(1024.0); // Estimate std dev as 40% of mean, min 1KB
                    let confidence = Self::calculate_confidence_score(stat.days_observed as usize, std_dev / stat.avg_bytes_per_day.max(1.0));
                    
                    all_baselines.push(BehavioralBaseline {
                        baseline_id: Uuid::new_v4().to_string(),
                        tenant_id: tenant_id.to_string(),
                        entity_id: stat.server_ip,
                        entity_type: "server".to_string(),
                        metric: "bytes_out_per_day".to_string(),
                        baseline_value_avg: stat.avg_bytes_per_day,
                        baseline_value_stddev: std_dev,
                        sample_count: stat.days_observed as u32,
                        calculation_period_days: self.calculation_period_days,
                        confidence_score: confidence,
                        last_updated: Utc::now().timestamp() as u32,
                        created_at: Utc::now().timestamp() as u32,
                    });
                }
            }
            Err(e) => warn!("Failed to calculate server data baselines for tenant {}: {}", tenant_id, e),
        }
        
        // 3. Calculate hourly activity variance baselines
        match self.calculate_hourly_variance_baselines(tenant_id).await {
            Ok(mut hourly_baselines) => {
                all_baselines.append(&mut hourly_baselines);
            }
            Err(e) => warn!("Failed to calculate hourly variance baselines for tenant {}: {}", tenant_id, e),
        }
        
        // Store all calculated baselines
        if !all_baselines.is_empty() {
            info!("Storing {} baselines for tenant {}", all_baselines.len(), tenant_id);
            if let Err(e) = self.create_baselines(all_baselines).await {
                error!("Failed to store baselines for tenant {}: {}", tenant_id, e);
            } else {
                info!("Successfully stored baselines for tenant {}", tenant_id);
            }
        } else {
            warn!("No baselines calculated for tenant {} - insufficient data", tenant_id);
        }
        
        Ok(())
    }
    
    async fn run_modeling_cycle(&self) -> Result<()> {
        info!("Starting UEBA modeling cycle");
        
        // Fetch all tenants
        let tenants = self.fetch_tenants().await?;
        info!("Found {} tenants for UEBA modeling", tenants.len());
        
        for tenant_id in tenants {
            match self.process_tenant(&tenant_id).await {
                Ok(()) => info!("Successfully processed tenant: {}", tenant_id),
                Err(e) => error!("Failed to process tenant {}: {}", tenant_id, e),
            }
        }
        
        info!("UEBA modeling cycle completed");
        Ok(())
    }

    fn calculate_confidence_score(sample_count: usize, coefficient_of_variation: f64) -> f64 {
        // Calculate confidence based on sample size and coefficient of variation
        let sample_confidence = (sample_count as f64).ln() / 10.0; // Logarithmic scaling for sample size
        let stability_confidence = 1.0 / (1.0 + coefficient_of_variation); // Higher CV = lower confidence
        
        // Combine and normalize to 0.0-1.0 range
        let combined = (sample_confidence * stability_confidence).min(1.0).max(0.0);
        (combined * 100.0).round() / 100.0 // Round to 2 decimal places
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    env_logger::init();
    
    // Load environment variables
    dotenv().ok();
    
    info!("SIEM UEBA Baseline Modeler starting...");
    
    let modeler = UebaModeler::new().await?;
    
    // Get modeling interval from environment (default: 24 hours)
    let interval_hours = env::var("MODELING_INTERVAL_HOURS")
        .unwrap_or_else(|_| "24".to_string())
        .parse::<u64>()
        .unwrap_or(24);
    
    let mut modeling_interval = interval(Duration::from_secs(interval_hours * 3600));
    
    // Run immediately on startup
    if let Err(e) = modeler.run_modeling_cycle().await {
        error!("Error during initial modeling cycle: {}", e);
    }
    
    // Then run every interval
    loop {
        modeling_interval.tick().await;
        
        if let Err(e) = modeler.run_modeling_cycle().await {
            error!("Error during modeling cycle: {}", e);
        }
    }
}