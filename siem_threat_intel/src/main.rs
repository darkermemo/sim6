use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::time::Duration;
use tokio::time;
use uuid::Uuid;
use log::{info, error, warn};

#[derive(Debug, Serialize, Deserialize)]
struct ThreatIntelRecord {
    ioc_id: String,
    ioc_type: String,
    ioc_value: String,
    source: String,
    first_seen: u32,
    created_at: u32,
}

async fn fetch_existing_iocs(client: &Client) -> Result<HashSet<String>, Box<dyn std::error::Error>> {
    let query = "SELECT ioc_value FROM dev.threat_intel FORMAT JSON";
    
    let response = client
        .get("http://localhost:8123/")
        .query(&[("query", query)])
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await?;
        error!("Failed to fetch existing IOCs: {}", error_text);
        return Ok(HashSet::new());
    }

    let body = response.text().await?;
    
    // Parse ClickHouse JSON response
    let parsed: serde_json::Value = serde_json::from_str(&body)?;
    let mut existing_iocs = HashSet::new();
    
    if let Some(data) = parsed.get("data").and_then(|d| d.as_array()) {
        for row in data {
            if let Some(ioc_value) = row.get("ioc_value").and_then(|v| v.as_str()) {
                existing_iocs.insert(ioc_value.to_string());
            }
        }
    }
    
    info!("Loaded {} existing IOCs from database", existing_iocs.len());
    Ok(existing_iocs)
}

async fn fetch_threat_feed(client: &Client) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    info!("Fetching threat intelligence feed from abuse.ch...");
    
    let response = client
        .get("https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.txt")
        .timeout(Duration::from_secs(30))
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(format!("Failed to fetch threat feed: {}", response.status()).into());
    }

    let body = response.text().await?;
    let mut ips = Vec::new();
    
    for line in body.lines() {
        let line = line.trim();
        if !line.is_empty() && !line.starts_with('#') {
            // Basic IP validation
            if line.split('.').count() == 4 && line.chars().all(|c| c.is_numeric() || c == '.') {
                ips.push(line.to_string());
            }
        }
    }
    
    info!("Fetched {} malicious IPs from threat feed", ips.len());
    Ok(ips)
}

async fn insert_ioc(client: &Client, ioc: &ThreatIntelRecord) -> Result<(), Box<dyn std::error::Error>> {
    let insert_query = format!(
        "INSERT INTO dev.threat_intel (ioc_id, ioc_type, ioc_value, source, first_seen, created_at) VALUES ('{}', '{}', '{}', '{}', {}, {})",
        ioc.ioc_id, ioc.ioc_type, ioc.ioc_value, ioc.source, ioc.first_seen, ioc.created_at
    );
    
    let response = client
        .post("http://localhost:8123/")
        .header("Content-Type", "text/plain")
        .body(insert_query)
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await?;
        return Err(format!("ClickHouse insertion failed: {}", error_text).into());
    }

    Ok(())
}

async fn update_threat_intelligence() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new();
    
    // Fetch existing IOCs to avoid duplicates
    let existing_iocs = fetch_existing_iocs(&client).await?;
    
    // Fetch new threat intelligence data
    let threat_ips = fetch_threat_feed(&client).await?;
    
    let current_time = chrono::Utc::now().timestamp() as u32;
    let mut new_iocs_count = 0;
    
    for ip in threat_ips {
        if existing_iocs.contains(&ip) {
            continue; // Skip if already exists
        }
        
        let ioc = ThreatIntelRecord {
            ioc_id: Uuid::new_v4().to_string(),
            ioc_type: "ipv4".to_string(),
            ioc_value: ip.clone(),
            source: "abuse.ch".to_string(),
            first_seen: current_time,
            created_at: current_time,
        };
        
        match insert_ioc(&client, &ioc).await {
            Ok(_) => {
                new_iocs_count += 1;
                if new_iocs_count % 100 == 0 {
                    info!("Inserted {} new IOCs so far...", new_iocs_count);
                }
            }
            Err(e) => {
                error!("Failed to insert IOC {}: {}", ip, e);
            }
        }
    }
    
    info!("Threat intelligence update complete. Added {} new IOCs", new_iocs_count);
    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::init();
    info!("Starting SIEM Threat Intelligence Service");
    
    loop {
        info!("Starting threat intelligence update...");
        
        match update_threat_intelligence().await {
            Ok(_) => {
                info!("Threat intelligence update successful. Sleeping for 1 hour...");
            }
            Err(e) => {
                error!("Threat intelligence update failed: {}", e);
                warn!("Retrying in 10 minutes...");
                time::sleep(Duration::from_secs(600)).await;
                continue;
            }
        }
        
        // Sleep for 1 hour before next update
        time::sleep(Duration::from_secs(3600)).await;
    }
} 