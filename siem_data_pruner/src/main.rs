use chrono::Utc;
use log::{error, info, warn};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::time::Duration;
use tokio::time::interval;

#[derive(Debug, Serialize, Deserialize)]
struct RetentionPolicy {
    policy_id: String,
    tenant_id: String,
    policy_name: String,
    source_type_match: String,
    retention_days: u32,
    created_at: u32,
    updated_at: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct Tenant {
    tenant_id: String,
    tenant_name: String,
    is_active: u8,
    created_at: u32,
}

struct Config {
    clickhouse_url: String,
    api_url: String,
    check_interval_hours: u64,
    dry_run: bool,
    #[allow(dead_code)]
    admin_token: Option<String>,
}

impl Config {
    fn from_env() -> Self {
        Config {
            clickhouse_url: env::var("CLICKHOUSE_URL").unwrap_or_else(|_| "http://localhost:8123".to_string()),
            api_url: env::var("API_URL").unwrap_or_else(|_| "http://localhost:8080".to_string()),
            check_interval_hours: env::var("CHECK_INTERVAL_HOURS")
                .unwrap_or_else(|_| "24".to_string())
                .parse()
                .unwrap_or(24),
            dry_run: env::var("DRY_RUN")
                .unwrap_or_else(|_| "false".to_string())
                .parse()
                .unwrap_or(false),
            admin_token: env::var("ADMIN_TOKEN").ok(),
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::init();
    dotenvy::dotenv().ok();

    let config = Config::from_env();
    let client = Client::new();

    info!("Starting SIEM Data Pruner");
    info!("ClickHouse URL: {}", config.clickhouse_url);
    info!("API URL: {}", config.api_url);
    info!("Check interval: {} hours", config.check_interval_hours);
    info!("Dry run mode: {}", config.dry_run);

    // Run immediately on startup, then at intervals
    if let Err(e) = run_pruning_cycle(&client, &config).await {
        error!("Error in initial pruning cycle: {}", e);
    }

    let mut interval = interval(Duration::from_secs(config.check_interval_hours * 3600));
    
    loop {
        interval.tick().await;
        
        info!("Starting scheduled pruning cycle");
        if let Err(e) = run_pruning_cycle(&client, &config).await {
            error!("Error in pruning cycle: {}", e);
        }
    }
}

async fn run_pruning_cycle(client: &Client, config: &Config) -> Result<(), Box<dyn std::error::Error>> {
    info!("=== Starting Data Pruning Cycle ===");
    
    // Get all active tenants
    let tenants = get_tenants(client, config).await?;
    info!("Found {} active tenants", tenants.len());

    let mut total_deleted = 0u64;

    for tenant in tenants {
        info!("Processing tenant: {} ({})", tenant.tenant_name, tenant.tenant_id);
        
        // Get retention policies for this tenant
        let policies = get_retention_policies(client, config, &tenant.tenant_id).await?;
        info!("Found {} retention policies for tenant {}", policies.len(), tenant.tenant_id);

        if policies.is_empty() {
            info!("No retention policies found for tenant {}, skipping", tenant.tenant_id);
            continue;
        }

        // Group policies by source_type_match for efficient processing
        let mut policies_by_source_type: HashMap<String, Vec<RetentionPolicy>> = HashMap::new();
        
        for policy in policies {
            policies_by_source_type
                .entry(policy.source_type_match.clone())
                .or_insert_with(Vec::new)
                .push(policy);
        }

        // Process each source type
        for (source_type_match, type_policies) in policies_by_source_type {
            // Find the most restrictive policy (shortest retention) for this source type
            let min_retention_days = type_policies
                .iter()
                .map(|p| p.retention_days)
                .min()
                .unwrap_or(0);

            if min_retention_days == 0 {
                warn!("Found policy with 0 retention days for tenant {} source type {}, skipping", 
                      tenant.tenant_id, source_type_match);
                continue;
            }

            info!("Processing source type '{}' with minimum retention {} days", 
                  source_type_match, min_retention_days);

            let deleted_count = prune_events(
                client, 
                config, 
                &tenant.tenant_id, 
                &source_type_match, 
                min_retention_days
            ).await?;

            total_deleted += deleted_count;
            
            if deleted_count > 0 {
                info!("Deleted {} events for tenant {} source type {}", 
                      deleted_count, tenant.tenant_id, source_type_match);
            }
        }
    }

    info!("=== Pruning Cycle Complete ===");
    info!("Total events deleted: {}", total_deleted);

    Ok(())
}

async fn get_tenants(client: &Client, config: &Config) -> Result<Vec<Tenant>, Box<dyn std::error::Error>> {
    let query = "SELECT tenant_id, tenant_name, is_active, created_at FROM dev.tenants WHERE is_active = 1";
    
    let response = client
        .post(&config.clickhouse_url)
        .query(&[("query", query), ("format", &"JSON".to_string())])
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await?;
        return Err(format!("Failed to fetch tenants: {}", error_text).into());
    }

    let json: serde_json::Value = response.json().await?;
    let mut tenants = Vec::new();

    if let Some(data) = json["data"].as_array() {
        for row in data {
            if let Some(row_array) = row.as_array() {
                if row_array.len() >= 4 {
                    let tenant = Tenant {
                        tenant_id: row_array[0].as_str().unwrap_or("").to_string(),
                        tenant_name: row_array[1].as_str().unwrap_or("").to_string(),
                        is_active: row_array[2].as_u64().unwrap_or(0) as u8,
                        created_at: row_array[3].as_u64().unwrap_or(0) as u32,
                    };
                    tenants.push(tenant);
                }
            }
        }
    }

    Ok(tenants)
}

async fn get_retention_policies(
    client: &Client, 
    config: &Config, 
    tenant_id: &str
) -> Result<Vec<RetentionPolicy>, Box<dyn std::error::Error>> {
    let query = format!(
        "SELECT policy_id, tenant_id, policy_name, source_type_match, retention_days, created_at, updated_at FROM dev.retention_policies WHERE tenant_id = '{}'",
        tenant_id
    );
    
    let response = client
        .post(&config.clickhouse_url)
        .query(&[("query", &query), ("format", &"JSON".to_string())])
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await?;
        return Err(format!("Failed to fetch retention policies: {}", error_text).into());
    }

    let json: serde_json::Value = response.json().await?;
    let mut policies = Vec::new();

    if let Some(data) = json["data"].as_array() {
        for row in data {
            if let Some(row_array) = row.as_array() {
                if row_array.len() >= 7 {
                    let policy = RetentionPolicy {
                        policy_id: row_array[0].as_str().unwrap_or("").to_string(),
                        tenant_id: row_array[1].as_str().unwrap_or("").to_string(),
                        policy_name: row_array[2].as_str().unwrap_or("").to_string(),
                        source_type_match: row_array[3].as_str().unwrap_or("").to_string(),
                        retention_days: row_array[4].as_u64().unwrap_or(0) as u32,
                        created_at: row_array[5].as_u64().unwrap_or(0) as u32,
                        updated_at: row_array[6].as_u64().unwrap_or(0) as u32,
                    };
                    policies.push(policy);
                }
            }
        }
    }

    Ok(policies)
}

async fn prune_events(
    client: &Client,
    config: &Config,
    tenant_id: &str,
    source_type_match: &str,
    retention_days: u32,
) -> Result<u64, Box<dyn std::error::Error>> {
    let cutoff_timestamp = Utc::now().timestamp() as u32 - (retention_days * 86400);
    
    // First, count how many events would be deleted
    let count_query = if source_type_match == "*" {
        format!(
            "SELECT COUNT(*) as count FROM dev.events WHERE tenant_id = '{}' AND event_timestamp < {}",
            tenant_id, cutoff_timestamp
        )
    } else {
        format!(
            "SELECT COUNT(*) as count FROM dev.events WHERE tenant_id = '{}' AND source_type = '{}' AND event_timestamp < {}",
            tenant_id, source_type_match, cutoff_timestamp
        )
    };

    let count_response = client
        .post(&config.clickhouse_url)
        .query(&[("query", &count_query), ("format", &"JSON".to_string())])
        .send()
        .await?;

    if !count_response.status().is_success() {
        let error_text = count_response.text().await?;
        return Err(format!("Failed to count events for deletion: {}", error_text).into());
    }

    let count_json: serde_json::Value = count_response.json().await?;
    let count = count_json["data"][0][0].as_u64().unwrap_or(0);

    if count == 0 {
        info!("No events to delete for tenant {} source type {} (retention {} days)", 
              tenant_id, source_type_match, retention_days);
        return Ok(0);
    }

    info!("Found {} events older than {} days for tenant {} source type {}", 
          count, retention_days, tenant_id, source_type_match);

    if config.dry_run {
        info!("DRY RUN: Would delete {} events", count);
        return Ok(count);
    }

    // Execute the deletion
    let delete_query = if source_type_match == "*" {
        format!(
            "ALTER TABLE dev.events DELETE WHERE tenant_id = '{}' AND event_timestamp < {}",
            tenant_id, cutoff_timestamp
        )
    } else {
        format!(
            "ALTER TABLE dev.events DELETE WHERE tenant_id = '{}' AND source_type = '{}' AND event_timestamp < {}",
            tenant_id, source_type_match, cutoff_timestamp
        )
    };

    info!("Executing deletion query: {}", delete_query);

    let delete_response = client
        .post(&config.clickhouse_url)
        .query(&[("query", &delete_query)])
        .send()
        .await?;

    if !delete_response.status().is_success() {
        let error_text = delete_response.text().await?;
        return Err(format!("Failed to delete events: {}", error_text).into());
    }

    info!("Successfully deleted {} events for tenant {} source type {}", 
          count, tenant_id, source_type_match);

    Ok(count)
} 