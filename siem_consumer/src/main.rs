mod errors;
mod models;

use errors::{ConsumerError, Result};
use futures::StreamExt;
use log::{error, info, warn};
use models::{Event, KafkaMessage};
use rdkafka::config::ClientConfig;
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::message::{BorrowedMessage, Message};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use siem_parser::{
    parse_with_custom_parsers, CustomParserDefinition, JsonLogParser, LogParser, ParsedEvent,
    SyslogParser,
};
use std::collections::HashMap;
use std::env;
use std::time::{Duration, Instant};
use tokio::time::interval;

const DEFAULT_BATCH_SIZE: usize = 1000;
const DEFAULT_BATCH_TIMEOUT_MS: u64 = 5000;

struct Config {
    kafka_brokers: String,
    kafka_topic: String,
    kafka_group_id: String,
    clickhouse_url: String,
    clickhouse_db: String,
    clickhouse_table: String,
    batch_size: usize,
    batch_timeout: Duration,
    api_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct LogSourceLookupResponse {
    source_type: String,
    source_name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct TaxonomyMapping {
    mapping_id: String,
    tenant_id: String,
    source_type: String,
    field_to_check: String,
    value_to_match: String,
    event_category: String,
    event_outcome: String,
    event_action: String,
    created_at: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct TaxonomyMappingListResponse {
    mappings: Vec<TaxonomyMapping>,
    total: usize,
}

#[derive(Debug, Serialize, Deserialize)]
struct CustomParserListResponse {
    parsers: Vec<CustomParserDefinition>,
    total: usize,
}

type LogSourceCache = HashMap<String, String>;
type TaxonomyCache = Vec<TaxonomyMapping>;
type CustomParserCache = Vec<CustomParserDefinition>;
type ThreatIntelCache = std::collections::HashSet<String>;

impl Config {
    fn from_env() -> Result<Self> {
        Ok(Config {
            kafka_brokers: env::var("KAFKA_BROKERS")
                .unwrap_or_else(|_| "localhost:9092".to_string()),
            kafka_topic: env::var("KAFKA_TOPIC").unwrap_or_else(|_| "ingest-events".to_string()),
            kafka_group_id: env::var("KAFKA_GROUP_ID")
                .unwrap_or_else(|_| "siem_clickhouse_writer".to_string()),
            clickhouse_url: env::var("CLICKHOUSE_URL")
                .unwrap_or_else(|_| "http://localhost:8123".to_string()),
            clickhouse_db: env::var("CLICKHOUSE_DB").unwrap_or_else(|_| "dev".to_string()),
            clickhouse_table: env::var("CLICKHOUSE_TABLE").unwrap_or_else(|_| "events".to_string()),
            api_url: env::var("API_URL").unwrap_or_else(|_| "http://localhost:8080".to_string()),
            batch_size: env::var("BATCH_SIZE")
                .unwrap_or_else(|_| DEFAULT_BATCH_SIZE.to_string())
                .parse()
                .unwrap_or(DEFAULT_BATCH_SIZE),
            batch_timeout: Duration::from_millis(
                env::var("BATCH_TIMEOUT_MS")
                    .unwrap_or_else(|_| DEFAULT_BATCH_TIMEOUT_MS.to_string())
                    .parse()
                    .unwrap_or(DEFAULT_BATCH_TIMEOUT_MS),
            ),
        })
    }
}

struct EventBatch {
    events: Vec<Event>,
    last_flush: Instant,
}

impl EventBatch {
    fn new() -> Self {
        EventBatch {
            events: Vec::new(),
            last_flush: Instant::now(),
        }
    }

    fn add(&mut self, event: Event) {
        self.events.push(event);
    }

    fn should_flush(&self, batch_size: usize, timeout: Duration) -> bool {
        self.events.len() >= batch_size || self.last_flush.elapsed() >= timeout
    }

    fn take(&mut self) -> Vec<Event> {
        self.last_flush = Instant::now();
        std::mem::take(&mut self.events)
    }

    fn len(&self) -> usize {
        self.events.len()
    }
}

async fn create_consumer(config: &Config) -> Result<StreamConsumer> {
    let consumer: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", &config.kafka_brokers)
        .set("group.id", &config.kafka_group_id)
        .set("enable.auto.commit", "false")
        .set("auto.offset.reset", "earliest")
        .create()
        .map_err(|e| ConsumerError::Config(format!("Failed to create consumer: {}", e)))?;

    consumer
        .subscribe(&[&config.kafka_topic])
        .map_err(|e| ConsumerError::Config(format!("Failed to subscribe to topic: {}", e)))?;

    Ok(consumer)
}

async fn build_taxonomy_cache(client: &Client, api_url: &str) -> Result<TaxonomyCache> {
    let url = format!("{}/api/v1/taxonomy/mappings/all", api_url);

    info!("Fetching taxonomy mappings from {}", url);

    match client.get(&url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                match response.json::<TaxonomyMappingListResponse>().await {
                    Ok(mapping_response) => {
                        info!(
                            "Loaded {} taxonomy mappings",
                            mapping_response.mappings.len()
                        );
                        Ok(mapping_response.mappings)
                    }
                    Err(e) => {
                        warn!("Failed to parse taxonomy mappings: {}", e);
                        Ok(Vec::new())
                    }
                }
            } else {
                warn!(
                    "Failed to fetch taxonomy mappings: HTTP {}",
                    response.status()
                );
                Ok(Vec::new())
            }
        }
        Err(e) => {
            warn!("Failed to connect to API for taxonomy mappings: {}", e);
            Ok(Vec::new())
        }
    }
}

async fn build_custom_parser_cache(client: &Client, api_url: &str) -> Result<CustomParserCache> {
    let url = format!("{}/api/v1/parsers/all", api_url);

    info!("Fetching custom parsers from {}", url);

    match client.get(&url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                match response.json::<CustomParserListResponse>().await {
                    Ok(parser_response) => {
                        info!("Loaded {} custom parsers", parser_response.parsers.len());
                        Ok(parser_response.parsers)
                    }
                    Err(e) => {
                        warn!("Failed to parse custom parsers: {}", e);
                        Ok(Vec::new())
                    }
                }
            } else {
                warn!("Failed to fetch custom parsers: HTTP {}", response.status());
                Ok(Vec::new())
            }
        }
        Err(e) => {
            warn!("Failed to connect to API for custom parsers: {}", e);
            Ok(Vec::new())
        }
    }
}

fn apply_taxonomy_mappings(
    kafka_msg: &KafkaMessage,
    _parsed: &ParsedEvent,
    source_type: Option<&str>,
    taxonomy_cache: &TaxonomyCache,
) -> (String, String, String) {
    // Default values
    let mut event_category = "Unknown".to_string();
    let mut event_outcome = "Unknown".to_string();
    let mut event_action = "Unknown".to_string();

    // Try to find a matching taxonomy mapping
    for mapping in taxonomy_cache {
        // Check if this mapping applies to this tenant and source type
        if mapping.tenant_id != kafka_msg.tenant_id {
            continue;
        }

        if let Some(src_type) = source_type {
            if mapping.source_type != src_type {
                continue;
            }
        }

        // Check the field and value
        let field_value = match mapping.field_to_check.as_str() {
            "raw_message" => &kafka_msg.raw_event,
            "source_ip" => &kafka_msg.source_ip,
            _ => continue, // Unknown field
        };

        // Check if the value matches (case-insensitive substring match)
        if field_value
            .to_lowercase()
            .contains(&mapping.value_to_match.to_lowercase())
        {
            event_category = mapping.event_category.clone();
            event_outcome = mapping.event_outcome.clone();
            event_action = mapping.event_action.clone();

            info!(
                "Applied taxonomy mapping: {} -> category={}, outcome={}, action={}",
                mapping.value_to_match, event_category, event_outcome, event_action
            );

            // Use the first matching rule
            break;
        }
    }

    (event_category, event_outcome, event_action)
}

fn enrich_with_threat_intel(event: &mut Event, threat_intel_cache: &ThreatIntelCache) {
    // Check if the source IP matches any known threat indicators
    if threat_intel_cache.contains(&event.source_ip) {
        event.is_threat = 1;
        info!(
            "Threat detected! Event {} flagged as malicious based on source IP: {}",
            event.event_id, event.source_ip
        );
    } else if event.is_threat == 0 {
        // Only set to 0 if it wasn't already flagged as a threat by the parser
        event.is_threat = 0;
    }
    // If is_threat is already 1 (from parser), preserve that value
}

fn process_message(
    msg: &BorrowedMessage,
    log_source_cache: &LogSourceCache,
    taxonomy_cache: &TaxonomyCache,
    custom_parser_cache: &CustomParserCache,
    threat_intel_cache: &ThreatIntelCache,
) -> Result<Event> {
    let payload = msg
        .payload()
        .ok_or_else(|| ConsumerError::Config("Empty message payload".to_string()))?;

    let payload_str = std::str::from_utf8(payload)?;

    // Try to deserialize with better error handling
    let kafka_msg: KafkaMessage = match serde_json::from_str(payload_str) {
        Ok(msg) => msg,
        Err(e) => {
            error!(
                "Failed to deserialize Kafka message: {}. Payload: {}",
                e, payload_str
            );
            error!("Expected format: {{\"event_id\": \"string\", \"tenant_id\": \"string\", \"event_timestamp\": number, \"source_ip\": \"string\", \"raw_event\": \"string\"}}");
            return Err(ConsumerError::Json(e));
        }
    };

    // Validate required fields
    if kafka_msg.event_id.is_empty() {
        warn!("Missing or empty event_id in Kafka message");
        return Err(ConsumerError::Config("Missing event_id field".to_string()));
    }

    if kafka_msg.tenant_id.is_empty() {
        warn!("Missing or empty tenant_id in Kafka message");
        return Err(ConsumerError::Config("Missing tenant_id field".to_string()));
    }

    if kafka_msg.source_ip.is_empty() {
        warn!("Missing or empty source_ip in Kafka message");
        return Err(ConsumerError::Config("Missing source_ip field".to_string()));
    }

    if kafka_msg.raw_event.is_empty() {
        warn!("Missing or empty raw_event in Kafka message");
        return Err(ConsumerError::Config(
            "Missing raw_event field".to_string(),
        ));
    }

    let mut source_type_used: Option<String> = None;
    let mut parsed_event: Option<ParsedEvent> = None;

    // Check if we have a specific configuration for this source IP
    if let Some(source_type) = log_source_cache.get(&kafka_msg.source_ip) {
        info!(
            "Found configuration for {}, using {} parser",
            kafka_msg.source_ip, source_type
        );
        source_type_used = Some(source_type.clone());

        // Try to parse with configured parser type
        match source_type.as_str() {
            "JSON" => {
                let json_parser = JsonLogParser;
                if let Ok(parsed) = json_parser.parse(&kafka_msg.raw_event) {
                    info!("Successfully parsed as JSON log");
                    parsed_event = Some(parsed);
                }
            }
            "Syslog" => {
                if let Ok(syslog_parser) = SyslogParser::new() {
                    if let Ok(parsed) = syslog_parser.parse(&kafka_msg.raw_event) {
                        info!("Successfully parsed as Syslog");
                        parsed_event = Some(parsed);
                    }
                }
            }
            "unknown" => {
                warn!(
                    "Unknown source type 'unknown' for {}, falling back to all parsers",
                    kafka_msg.source_ip
                );
            }
            custom_parser_name => {
                // Check if this is a custom parser for the specific tenant
                for custom_parser_def in custom_parser_cache {
                    if custom_parser_def.tenant_id == kafka_msg.tenant_id
                        && custom_parser_def.parser_name == custom_parser_name
                    {
                        info!(
                            "Attempting to parse with custom {} parser: {}",
                            custom_parser_def.parser_type, custom_parser_name
                        );

                        // Use the new enhanced parsing function with custom parsers
                        let custom_parsers = vec![custom_parser_def.clone()];
                        if let Ok(parsed) =
                            parse_with_custom_parsers(&kafka_msg.raw_event, &custom_parsers)
                        {
                            info!(
                                "Successfully parsed with custom {} parser",
                                custom_parser_def.parser_type
                            );
                            parsed_event = Some(parsed);
                            break;
                        }
                    }
                }
            }
        }

        if parsed_event.is_none() {
            info!(
                "Configured parser failed for {}, falling back to all parsers",
                kafka_msg.source_ip
            );
        }
    } else {
        info!(
            "No configuration found for {}, trying all parsers",
            kafka_msg.source_ip
        );
    }

    // If no specific parser worked or no configuration found, try all parsers including custom ones
    if parsed_event.is_none() {
        // Filter custom parsers for this tenant
        let tenant_custom_parsers: Vec<CustomParserDefinition> = custom_parser_cache
            .iter()
            .filter(|p| p.tenant_id == kafka_msg.tenant_id)
            .cloned()
            .collect();

        info!("Trying all built-in and custom parsers for fallback parsing");
        if let Ok(parsed) =
            parse_with_custom_parsers(&kafka_msg.raw_event, &tenant_custom_parsers)
        {
            // Check if any actual parsing occurred (more than just raw message)
            if parsed.timestamp.is_some()
                || parsed.hostname.is_some()
                || parsed.source_ip.is_some()
                || !parsed.additional_fields.is_empty()
                || parsed.vendor.is_some()
                || parsed.product.is_some()
            {
                info!("Successfully parsed with built-in or custom parsers (fallback)");

                // Determine the source type based on what was parsed
                if parsed.vendor.is_some() {
                    source_type_used = Some(
                        parsed
                            .vendor
                            .as_ref()
                            .unwrap_or(&"Vendor".to_string())
                            .to_string(),
                    );
                } else if parsed.facility.is_some() {
                    source_type_used = Some("Syslog".to_string());
                } else {
                    source_type_used = Some("Auto-detected".to_string());
                }

                parsed_event = Some(parsed);
            }
        }
    }

    // Apply taxonomy mappings
    if let Some(parsed) = parsed_event {
        let (event_category, event_outcome, event_action) = apply_taxonomy_mappings(
            &kafka_msg,
            &parsed,
            source_type_used.as_deref(),
            taxonomy_cache,
        );

        let mut event = Event::from_kafka_and_parsed_with_cim(
            &kafka_msg,
            &parsed,
            source_type_used.unwrap_or_else(|| "Unknown".to_string()),
            event_category,
            event_outcome,
            event_action,
        );

        // Debug logging to trace CIM field population
        log::debug!(
            "ParsedEvent CIM fields - vendor: {:?}, product: {:?}, dest_ip: {:?}, user: {:?}",
            parsed.vendor,
            parsed.product,
            parsed.dest_ip,
            parsed.user
        );
        log::debug!(
            "Final Event CIM fields - vendor: {:?}, product: {:?}, dest_ip: {:?}, user: {:?}",
            event.vendor,
            event.product,
            event.dest_ip,
            event.user
        );
        log::debug!("Final event for ClickHouse: {:?}", event);

        // Add comprehensive CIM field mapping debug logging
        log::debug!("=== CIM Field Mapping Debug ===");
        log::debug!("Source ParsedEvent fields:");
        log::debug!(
            "  Authentication: user={:?}, src_user={:?}, dest_user={:?}, user_type={:?}",
            parsed.user,
            parsed.src_user,
            parsed.dest_user,
            parsed.user_type
        );
        log::debug!(
            "  Network: dest_ip={:?}, src_port={:?}, dest_port={:?}, protocol={:?}/{:?}",
            parsed.dest_ip,
            parsed.src_port,
            parsed.dest_port,
            parsed.protocol,
            parsed.cim_protocol
        );
        log::debug!(
            "  Device: vendor={:?}, product={:?}, version={:?}, device_type={:?}",
            parsed.vendor,
            parsed.product,
            parsed.version,
            parsed.device_type
        );
        log::debug!(
            "  Security: rule_id={:?}, rule_name={:?}, severity={:?}/{:?}",
            parsed.rule_id,
            parsed.rule_name,
            parsed.severity,
            parsed.cim_severity
        );
        log::debug!(
            "  Process: process_name={:?}, process_id={:?}, file_hash={:?}",
            parsed.process_name,
            parsed.process_id,
            parsed.file_hash
        );
        log::debug!(
            "  Web: url={:?}, http_method={:?}, http_status_code={:?}, http_user_agent={:?}",
            parsed.url,
            parsed.http_method,
            parsed.http_status_code,
            parsed.http_user_agent
        );

        log::debug!("Mapped Event fields:");
        log::debug!(
            "  Authentication: user={:?}, src_user={:?}, dest_user={:?}, user_type={:?}",
            event.user,
            event.src_user,
            event.dest_user,
            event.user_type
        );
        log::debug!(
            "  Network: dest_ip={:?}, src_port={:?}, dest_port={:?}, protocol={:?}",
            event.dest_ip,
            event.src_port,
            event.dest_port,
            event.protocol
        );
        log::debug!(
            "  Device: vendor={:?}, product={:?}, version={:?}, device_type={:?}",
            event.vendor,
            event.product,
            event.version,
            event.device_type
        );
        log::debug!(
            "  Security: rule_id={:?}, rule_name={:?}, severity={:?}",
            event.rule_id,
            event.rule_name,
            event.severity
        );
        log::debug!(
            "  Process: process_name={:?}, process_id={:?}, file_hash={:?}",
            event.process_name,
            event.process_id,
            event.file_hash
        );
        log::debug!(
            "  Web: url={:?}, http_method={:?}, http_status_code={:?}, http_user_agent={:?}",
            event.url,
            event.http_method,
            event.http_status_code,
            event.http_user_agent
        );
        log::debug!("================================");

        log::debug!("Complete final event for ClickHouse: {:?}", event);

        enrich_with_threat_intel(&mut event, threat_intel_cache);

        Ok(event)
    } else {
        // If all parsers fail, create unparsed event with taxonomy
        warn!("Failed to parse log, storing as unparsed event");
        let (event_category, event_outcome, event_action) = apply_taxonomy_mappings(
            &kafka_msg,
            &ParsedEvent::new(),
            source_type_used.as_deref(),
            taxonomy_cache,
        );

        let mut event = Event::from_kafka_unparsed(
            &kafka_msg,
            source_type_used.unwrap_or_else(|| "Unknown".to_string()),
        );
        event.event_category = event_category;
        event.event_outcome = event_outcome;
        event.event_action = event_action;

        enrich_with_threat_intel(&mut event, threat_intel_cache);

        Ok(event)
    }
}

async fn write_to_clickhouse(client: &Client, config: &Config, events: Vec<Event>) -> Result<()> {
    if events.is_empty() {
        return Ok(());
    }

    let query = format!(
        r#"INSERT INTO {}.{} (
            event_id, tenant_id, event_timestamp, ingestion_timestamp, source_ip, source_type, raw_event, 
            event_category, event_outcome, event_action, is_threat,
            user, src_user, dest_user, user_type, dest_ip, src_port, dest_port, protocol,
            bytes_in, bytes_out, packets_in, packets_out, duration, transport, direction,
            process_name, parent_process, process_id, parent_process_id, file_hash, file_path,
            file_name, file_size, command_line, registry_key, registry_value,
            url, uri_path, uri_query, http_method, http_status_code, http_user_agent,
            http_referrer, http_content_type, http_content_length,
            src_host, dest_host, device_type, vendor, product, version,
            src_country, dest_country, src_zone, dest_zone, interface_in, interface_out, vlan_id,
            rule_id, rule_name, policy_id, policy_name, signature_id, signature_name,
            threat_name, threat_category, severity, priority,
            auth_method, auth_app, failure_reason, session_id,
            app_name, app_category, service_name,
            email_sender, email_recipient, email_subject,
            tags, message, details, custom_fields
        ) FORMAT JSONEachRow"#,
        config.clickhouse_db, config.clickhouse_table
    );

    let json_data = events
        .iter()
        .map(serde_json::to_string)
        .collect::<std::result::Result<Vec<_>, _>>()?
        .join("\n");

    let response = client
        .post(&config.clickhouse_url)
        .query(&[("query", &query)])
        .body(json_data)
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(ConsumerError::ClickHouse(format!(
            "Failed to insert events: {}",
            error_text
        )));
    }

    info!("Successfully wrote {} events to ClickHouse", events.len());
    Ok(())
}

async fn build_log_source_cache(client: &Client, api_url: &str) -> Result<LogSourceCache> {
    let mut cache = HashMap::new();

    // For now, we'll make an unauthenticated call to the internal endpoint
    // In production, this could use a service account token or internal API key
    let url = format!("{}/api/v1/log_sources/cache", api_url);

    info!("Attempting to fetch log source configurations from {}", url);

    match client.get(&url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                match response.json::<Vec<(String, String)>>().await {
                    Ok(sources) => {
                        for (ip, source_type) in sources {
                            cache.insert(ip, source_type);
                        }
                        info!("Loaded {} log source configurations", cache.len());
                    }
                    Err(e) => {
                        warn!("Failed to parse log source configurations: {}", e);
                    }
                }
            } else {
                warn!(
                    "Failed to fetch log source configurations: HTTP {}",
                    response.status()
                );
            }
        }
        Err(e) => {
            warn!(
                "Failed to connect to API for log source configurations: {}",
                e
            );
        }
    }

    // Since this endpoint doesn't exist yet, let's create a simple cache mechanism
    // that fetches individual source configs as needed by making requests to the by_ip endpoint

    Ok(cache)
}

async fn lookup_source_type(
    client: &Client,
    api_url: &str,
    source_ip: &str,
    cache: &mut LogSourceCache,
) -> Option<String> {
    // Check cache first
    if let Some(source_type) = cache.get(source_ip) {
        return Some(source_type.clone());
    }

    // Try to fetch from API
    let url = format!("{}/api/v1/log_sources/by_ip/{}", api_url, source_ip);

    match client.get(&url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                match response.json::<LogSourceLookupResponse>().await {
                    Ok(lookup_response) => {
                        let source_type = lookup_response.source_type;
                        // Cache the result for future use
                        cache.insert(source_ip.to_string(), source_type.clone());
                        info!(
                            "Cached log source configuration for {}: {}",
                            source_ip, source_type
                        );
                        Some(source_type)
                    }
                    Err(_) => None,
                }
            } else {
                // Cache negative result to avoid repeated API calls
                cache.insert(source_ip.to_string(), "unknown".to_string());
                None
            }
        }
        Err(_) => None,
    }
}

async fn build_threat_intel_cache(client: &Client) -> Result<ThreatIntelCache> {
    let mut cache = std::collections::HashSet::new();

    let clickhouse_url = "http://localhost:8123";
    let query = "SELECT ioc_value FROM dev.threat_intel WHERE ioc_type = 'ipv4' FORMAT JSON";
    let url = format!("{}/?query={}", clickhouse_url, urlencoding::encode(query));

    info!("Fetching threat intelligence from ClickHouse...");

    match client.get(&url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                let text = response.text().await?;
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                    if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
                        for row in data {
                            if let Some(ioc_value) = row.get("ioc_value").and_then(|v| v.as_str()) {
                                cache.insert(ioc_value.to_string());
                            }
                        }
                    }
                }
                info!("Loaded {} threat intelligence IOCs", cache.len());
            } else {
                warn!(
                    "Failed to fetch threat intelligence: HTTP {}",
                    response.status()
                );
            }
        }
        Err(e) => {
            warn!(
                "Failed to connect to ClickHouse for threat intelligence: {}",
                e
            );
        }
    }

    Ok(cache)
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    env_logger::init();

    info!("Starting SIEM Consumer");

    let config = Config::from_env()?;
    info!("Configuration loaded:");
    info!("  Kafka brokers: {}", config.kafka_brokers);
    info!("  Kafka topic: {}", config.kafka_topic);
    info!("  Kafka group: {}", config.kafka_group_id);
    info!("  ClickHouse URL: {}", config.clickhouse_url);
    info!("  Batch size: {}", config.batch_size);
    info!("  Batch timeout: {:?}", config.batch_timeout);

    let consumer = create_consumer(&config).await?;
    let http_client = Client::new();
    let mut batch = EventBatch::new();

    // Initialize log source cache
    let mut log_source_cache = build_log_source_cache(&http_client, &config.api_url).await?;

    // Initialize taxonomy cache
    let mut taxonomy_cache = build_taxonomy_cache(&http_client, &config.api_url).await?;

    // Initialize custom parser cache
    let mut custom_parser_cache = build_custom_parser_cache(&http_client, &config.api_url).await?;

    // Initialize threat intelligence cache
    let mut threat_intel_cache = build_threat_intel_cache(&http_client).await?;

    // Create interval for periodic flush checks
    let mut flush_interval = interval(Duration::from_secs(1));

    // Create interval for periodic cache refresh (every 5 minutes)
    let mut cache_refresh_interval = interval(Duration::from_secs(300));

    // Create a stream from the consumer
    let mut message_stream = consumer.stream();

    info!("Consumer started, waiting for messages...");

    loop {
        tokio::select! {
            // Process Kafka messages
            message = message_stream.next() => {
                match message {
                    Some(Ok(msg)) => {
                        // Extract source IP for dynamic lookup if needed
                        let payload = msg.payload().unwrap_or(&[]);
                        let payload_str = std::str::from_utf8(payload).unwrap_or("");
                        if let Ok(kafka_msg) = serde_json::from_str::<models::KafkaMessage>(payload_str) {
                            // Try dynamic lookup if not in cache
                            if !log_source_cache.contains_key(&kafka_msg.source_ip) {
                                lookup_source_type(&http_client, &config.api_url, &kafka_msg.source_ip, &mut log_source_cache).await;
                            }
                        }

                        match process_message(&msg, &log_source_cache, &taxonomy_cache, &custom_parser_cache, &threat_intel_cache) {
                            Ok(event) => {
                                batch.add(event);

                                // Check if we should flush
                                if batch.should_flush(config.batch_size, config.batch_timeout) {
                                    let events = batch.take();
                                    if let Err(e) = write_to_clickhouse(&http_client, &config, events).await {
                                        error!("Failed to write batch to ClickHouse: {}", e);
                                        // In production, we might want to retry or save to a dead letter queue
                                    } else {
                                        // Commit offset after successful write
                                        if let Err(e) = consumer.commit_message(&msg, rdkafka::consumer::CommitMode::Async) {
                                            error!("Failed to commit offset: {}", e);
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                error!("Failed to process message: {}", e);
                                // Still commit offset to avoid reprocessing bad messages
                                if let Err(e) = consumer.commit_message(&msg, rdkafka::consumer::CommitMode::Async) {
                                    error!("Failed to commit offset: {}", e);
                                }
                            }
                        }
                    }
                    Some(Err(e)) => {
                        error!("Kafka error: {}", e);
                    }
                    None => {
                        warn!("Consumer stream ended");
                        break;
                    }
                }
            }

            // Periodic flush check
            _ = flush_interval.tick() => {
                if batch.len() > 0 && batch.should_flush(config.batch_size, config.batch_timeout) {
                    let events = batch.take();
                    if let Err(e) = write_to_clickhouse(&http_client, &config, events).await {
                        error!("Failed to write batch to ClickHouse: {}", e);
                    }
                }
            }

            // Periodic cache refresh
            _ = cache_refresh_interval.tick() => {
                info!("Refreshing log source cache...");
                match build_log_source_cache(&http_client, &config.api_url).await {
                    Ok(new_cache) => {
                        log_source_cache = new_cache;
                        info!("Log source cache refreshed successfully");
                    }
                    Err(e) => {
                        warn!("Failed to refresh log source cache: {}", e);
                    }
                }
                info!("Refreshing taxonomy cache...");
                match build_taxonomy_cache(&http_client, &config.api_url).await {
                    Ok(new_cache) => {
                        taxonomy_cache = new_cache;
                        info!("Taxonomy cache refreshed successfully");
                    }
                    Err(e) => {
                        warn!("Failed to refresh taxonomy cache: {}", e);
                    }
                }
                info!("Refreshing custom parser cache...");
                match build_custom_parser_cache(&http_client, &config.api_url).await {
                    Ok(new_cache) => {
                        custom_parser_cache = new_cache;
                        info!("Custom parser cache refreshed successfully");
                    }
                    Err(e) => {
                        warn!("Failed to refresh custom parser cache: {}", e);
                    }
                }
                info!("Refreshing threat intelligence cache...");
                match build_threat_intel_cache(&http_client).await {
                    Ok(new_cache) => {
                        threat_intel_cache = new_cache;
                        info!("Threat intelligence cache refreshed successfully");
                    }
                    Err(e) => {
                        warn!("Failed to refresh threat intelligence cache: {}", e);
                    }
                }
            }
        }
    }

    info!("Consumer shutting down");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{DateTime, Utc};
    use siem_parser::ParsedEvent;

    /// Test the CIM field mapping functionality
    #[test]
    fn test_cim_field_mapping() {
        // Create a sample KafkaMessage
        let kafka_msg = KafkaMessage {
            event_id: "test-event-123".to_string(),
            tenant_id: "tenant-A".to_string(),
            event_timestamp: 1640995200, // 2022-01-01 00:00:00 UTC
            source_type: "Syslog".to_string(),
            event_category: "Unknown".to_string(),
            event_outcome: "Unknown".to_string(),
            event_action: "Unknown".to_string(),
            is_threat: 0,
            source_ip: "192.168.1.100".to_string(),
            raw_event: "Sample firewall log for testing".to_string(),
        };

        // Create a sample ParsedEvent with various CIM fields populated
        let mut parsed_event = ParsedEvent::new();

        // Set timestamp
        parsed_event.timestamp = Some(
            DateTime::parse_from_rfc3339("2022-01-01T12:30:45Z")
                .unwrap()
                .with_timezone(&Utc),
        );

        // Authentication Data Model
        parsed_event.user = Some("john.doe".to_string());
        parsed_event.src_user = Some("admin".to_string());
        parsed_event.dest_user = Some("service_account".to_string());
        parsed_event.user_type = Some("domain".to_string());

        // Network Traffic Data Model
        parsed_event.dest_ip = Some("10.1.1.5".to_string());
        parsed_event.src_port = Some(45123);
        parsed_event.dest_port = Some(443);
        parsed_event.cim_protocol = Some("HTTPS".to_string());
        parsed_event.protocol = Some("TCP".to_string()); // Fallback protocol
        parsed_event.bytes_in = Some(2048);
        parsed_event.bytes_out = Some(1024);
        parsed_event.packets_in = Some(10);
        parsed_event.packets_out = Some(8);
        parsed_event.duration = Some(300);
        parsed_event.transport = Some("TLS".to_string());
        parsed_event.direction = Some("outbound".to_string());

        // Endpoint Activity Data Model
        parsed_event.process_name = Some("nginx.exe".to_string());
        parsed_event.parent_process = Some("systemd".to_string());
        parsed_event.process_id = Some(1234);
        parsed_event.parent_process_id = Some(1);
        parsed_event.file_hash = Some("d41d8cd98f00b204e9800998ecf8427e".to_string());
        parsed_event.file_path = Some("/usr/bin/nginx".to_string());
        parsed_event.file_name = Some("nginx".to_string());
        parsed_event.file_size = Some(65536);
        parsed_event.command_line = Some("nginx -g 'daemon off;'".to_string());
        parsed_event.registry_key = Some("HKLM\\Software\\Test".to_string());
        parsed_event.registry_value = Some("TestValue".to_string());

        // Web Traffic Data Model
        parsed_event.url = Some("https://example.com/api/data".to_string());
        parsed_event.uri_path = Some("/api/data".to_string());
        parsed_event.uri_query = Some("id=123&type=json".to_string());
        parsed_event.http_method = Some("GET".to_string());
        parsed_event.http_status_code = Some(200);
        parsed_event.http_user_agent = Some("Mozilla/5.0 (Test Agent)".to_string());
        parsed_event.http_referrer = Some("https://example.com/".to_string());
        parsed_event.http_content_type = Some("application/json".to_string());
        parsed_event.http_content_length = Some(1024);

        // Device/Host Information
        parsed_event.src_host = Some("workstation-01".to_string());
        parsed_event.dest_host = Some("web-server-02".to_string());
        parsed_event.device_type = Some("firewall".to_string());
        parsed_event.vendor = Some("Palo Alto".to_string());
        parsed_event.product = Some("PA-3020".to_string());
        parsed_event.version = Some("9.1.0".to_string());

        // Geographic and Network Context
        parsed_event.src_country = Some("US".to_string());
        parsed_event.dest_country = Some("CA".to_string());
        parsed_event.src_zone = Some("internal".to_string());
        parsed_event.dest_zone = Some("dmz".to_string());
        parsed_event.interface_in = Some("eth0".to_string());
        parsed_event.interface_out = Some("eth1".to_string());
        parsed_event.vlan_id = Some(100);

        // Security Context
        parsed_event.rule_id = Some("rule-123".to_string());
        parsed_event.rule_name = Some("Allow HTTPS Outbound".to_string());
        parsed_event.policy_id = Some("policy-456".to_string());
        parsed_event.policy_name = Some("Internet Access Policy".to_string());
        parsed_event.signature_id = Some("sig-789".to_string());
        parsed_event.signature_name = Some("HTTP GET Request".to_string());
        parsed_event.threat_name = Some("Test Threat".to_string());
        parsed_event.threat_category = Some("malware".to_string());
        parsed_event.cim_severity = Some("medium".to_string());
        parsed_event.severity = Some("info".to_string()); // Fallback severity
        parsed_event.priority = Some("3".to_string());

        // Authentication Specific
        parsed_event.auth_method = Some("LDAP".to_string());
        parsed_event.auth_app = Some("Web Portal".to_string());
        parsed_event.failure_reason = Some("Invalid credentials".to_string());
        parsed_event.session_id = Some("sess-abc123".to_string());

        // Application/Service Context
        parsed_event.app_name = Some("Web Application".to_string());
        parsed_event.app_category = Some("Business".to_string());
        parsed_event.service_name = Some("nginx".to_string());

        // Email/Communication
        parsed_event.email_sender = Some("sender@example.com".to_string());
        parsed_event.email_recipient = Some("recipient@example.com".to_string());
        parsed_event.email_subject = Some("Test Email Subject".to_string());

        // Additional Context
        parsed_event.tags = Some("test,unit,cim".to_string());
        parsed_event.cim_message = Some("CIM formatted message".to_string());
        parsed_event.message = Some("Legacy message".to_string()); // Fallback message
        parsed_event.details = Some("{\"test\": \"data\"}".to_string());

        // Call the mapping function
        let result_event = Event::from_kafka_and_parsed_with_cim(
            &kafka_msg,
            &parsed_event,
            "Palo Alto Firewall".to_string(),
            "Network Traffic".to_string(),
            "Success".to_string(),
            "Allow".to_string(),
        );

        // Verify basic fields
        assert_eq!(result_event.event_id, "test-event-123");
        assert_eq!(result_event.tenant_id, "tenant-A");
        assert_eq!(result_event.event_timestamp, 1641040245); // ParsedEvent timestamp should override Kafka timestamp (2022-01-01T12:30:45Z = 1641040245)
        assert_eq!(result_event.source_ip, "192.168.1.100"); // Should fall back to Kafka source_ip since ParsedEvent.source_ip is None
        assert_eq!(result_event.source_type, "Palo Alto Firewall");
        assert_eq!(result_event.raw_event, "Sample firewall log for testing");
        assert_eq!(result_event.event_category, "Network Traffic");
        assert_eq!(result_event.event_outcome, "Success");
        assert_eq!(result_event.event_action, "Allow");
        assert_eq!(result_event.is_threat, 0);

        // Verify Authentication Data Model fields
        assert_eq!(result_event.user, Some("john.doe".to_string()));
        assert_eq!(result_event.src_user, Some("admin".to_string()));
        assert_eq!(result_event.dest_user, Some("service_account".to_string()));
        assert_eq!(result_event.user_type, Some("domain".to_string()));

        // Verify Network Traffic Data Model fields
        assert_eq!(result_event.dest_ip, Some("10.1.1.5".to_string()));
        assert_eq!(result_event.src_port, Some(45123));
        assert_eq!(result_event.dest_port, Some(443));
        assert_eq!(result_event.protocol, Some("HTTPS".to_string())); // Should prefer cim_protocol over protocol
        assert_eq!(result_event.bytes_in, Some(2048));
        assert_eq!(result_event.bytes_out, Some(1024));
        assert_eq!(result_event.packets_in, Some(10));
        assert_eq!(result_event.packets_out, Some(8));
        assert_eq!(result_event.duration, Some(300));
        assert_eq!(result_event.transport, Some("TLS".to_string()));
        assert_eq!(result_event.direction, Some("outbound".to_string()));

        // Verify Endpoint Activity Data Model fields
        assert_eq!(result_event.process_name, Some("nginx.exe".to_string()));
        assert_eq!(result_event.parent_process, Some("systemd".to_string()));
        assert_eq!(result_event.process_id, Some(1234));
        assert_eq!(result_event.parent_process_id, Some(1));
        assert_eq!(
            result_event.file_hash,
            Some("d41d8cd98f00b204e9800998ecf8427e".to_string())
        );
        assert_eq!(result_event.file_path, Some("/usr/bin/nginx".to_string()));
        assert_eq!(result_event.file_name, Some("nginx".to_string()));
        assert_eq!(result_event.file_size, Some(65536));
        assert_eq!(
            result_event.command_line,
            Some("nginx -g 'daemon off;'".to_string())
        );
        assert_eq!(
            result_event.registry_key,
            Some("HKLM\\Software\\Test".to_string())
        );
        assert_eq!(result_event.registry_value, Some("TestValue".to_string()));

        // Verify Web Traffic Data Model fields
        assert_eq!(
            result_event.url,
            Some("https://example.com/api/data".to_string())
        );
        assert_eq!(result_event.uri_path, Some("/api/data".to_string()));
        assert_eq!(result_event.uri_query, Some("id=123&type=json".to_string()));
        assert_eq!(result_event.http_method, Some("GET".to_string()));
        assert_eq!(result_event.http_status_code, Some(200));
        assert_eq!(
            result_event.http_user_agent,
            Some("Mozilla/5.0 (Test Agent)".to_string())
        );
        assert_eq!(
            result_event.http_referrer,
            Some("https://example.com/".to_string())
        );
        assert_eq!(
            result_event.http_content_type,
            Some("application/json".to_string())
        );
        assert_eq!(result_event.http_content_length, Some(1024));

        // Verify Device/Host Information fields
        assert_eq!(result_event.src_host, Some("workstation-01".to_string()));
        assert_eq!(result_event.dest_host, Some("web-server-02".to_string()));
        assert_eq!(result_event.device_type, Some("firewall".to_string()));
        assert_eq!(result_event.vendor, Some("Palo Alto".to_string()));
        assert_eq!(result_event.product, Some("PA-3020".to_string()));
        assert_eq!(result_event.version, Some("9.1.0".to_string()));

        // Verify Geographic and Network Context fields
        assert_eq!(result_event.src_country, Some("US".to_string()));
        assert_eq!(result_event.dest_country, Some("CA".to_string()));
        assert_eq!(result_event.src_zone, Some("internal".to_string()));
        assert_eq!(result_event.dest_zone, Some("dmz".to_string()));
        assert_eq!(result_event.interface_in, Some("eth0".to_string()));
        assert_eq!(result_event.interface_out, Some("eth1".to_string()));
        assert_eq!(result_event.vlan_id, Some(100));

        // Verify Security Context fields
        assert_eq!(result_event.rule_id, Some("rule-123".to_string()));
        assert_eq!(
            result_event.rule_name,
            Some("Allow HTTPS Outbound".to_string())
        );
        assert_eq!(result_event.policy_id, Some("policy-456".to_string()));
        assert_eq!(
            result_event.policy_name,
            Some("Internet Access Policy".to_string())
        );
        assert_eq!(result_event.signature_id, Some("sig-789".to_string()));
        assert_eq!(
            result_event.signature_name,
            Some("HTTP GET Request".to_string())
        );
        assert_eq!(result_event.threat_name, Some("Test Threat".to_string()));
        assert_eq!(result_event.threat_category, Some("malware".to_string()));
        assert_eq!(result_event.severity, Some("medium".to_string())); // Should prefer cim_severity over severity
        assert_eq!(result_event.priority, Some("3".to_string()));

        // Verify Authentication Specific fields
        assert_eq!(result_event.auth_method, Some("LDAP".to_string()));
        assert_eq!(result_event.auth_app, Some("Web Portal".to_string()));
        assert_eq!(
            result_event.failure_reason,
            Some("Invalid credentials".to_string())
        );
        assert_eq!(result_event.session_id, Some("sess-abc123".to_string()));

        // Verify Application/Service Context fields
        assert_eq!(result_event.app_name, Some("Web Application".to_string()));
        assert_eq!(result_event.app_category, Some("Business".to_string()));
        assert_eq!(result_event.service_name, Some("nginx".to_string()));

        // Verify Email/Communication fields
        assert_eq!(
            result_event.email_sender,
            Some("sender@example.com".to_string())
        );
        assert_eq!(
            result_event.email_recipient,
            Some("recipient@example.com".to_string())
        );
        assert_eq!(
            result_event.email_subject,
            Some("Test Email Subject".to_string())
        );

        // Verify Additional Context fields
        assert_eq!(result_event.tags, Some("test,unit,cim".to_string()));
        assert_eq!(
            result_event.message,
            Some("CIM formatted message".to_string())
        ); // Should prefer cim_message over message
        assert_eq!(
            result_event.details,
            Some("{\"test\": \"data\"}".to_string())
        );

        println!("✅ All CIM field mappings verified successfully!");
    }

    /// Test fallback behavior when both CIM and legacy fields are available
    #[test]
    fn test_cim_field_fallback_behavior() {
        let kafka_msg = KafkaMessage {
            event_id: "fallback-test".to_string(),
            tenant_id: "tenant-A".to_string(),
            event_timestamp: 1640995200,
            source_type: "Syslog".to_string(),
            event_category: "Unknown".to_string(),
            event_outcome: "Unknown".to_string(),
            event_action: "Unknown".to_string(),
            is_threat: 0,
            source_ip: "192.168.1.100".to_string(),
            raw_event: "Fallback test log".to_string(),
        };

        let mut parsed_event = ParsedEvent::new();

        // Test protocol fallback: only legacy protocol is set
        parsed_event.protocol = Some("TCP".to_string());
        parsed_event.cim_protocol = None;

        // Test severity fallback: only legacy severity is set
        parsed_event.severity = Some("high".to_string());
        parsed_event.cim_severity = None;

        // Test message fallback: only legacy message is set
        parsed_event.message = Some("Legacy message".to_string());
        parsed_event.cim_message = None;

        let result_event = Event::from_kafka_and_parsed_with_cim(
            &kafka_msg,
            &parsed_event,
            "Test Source".to_string(),
            "Test Category".to_string(),
            "Test Outcome".to_string(),
            "Test Action".to_string(),
        );

        // Verify fallback behavior
        assert_eq!(result_event.protocol, Some("TCP".to_string()));
        assert_eq!(result_event.severity, Some("high".to_string()));
        assert_eq!(result_event.message, Some("Legacy message".to_string()));

        println!("✅ CIM field fallback behavior verified successfully!");
    }

    /// Test with empty ParsedEvent to ensure no panics occur
    #[test]
    fn test_empty_parsed_event_mapping() {
        let kafka_msg = KafkaMessage {
            event_id: "empty-test".to_string(),
            tenant_id: "tenant-A".to_string(),
            event_timestamp: 1640995200,
            source_ip: "192.168.1.100".to_string(),
            source_type: "Syslog".to_string(),
            raw_event: "Empty test log".to_string(),
            event_category: "Unknown".to_string(),
            event_outcome: "Unknown".to_string(),
            event_action: "Unknown".to_string(),
            is_threat: 0,
        };

        let parsed_event = ParsedEvent::new(); // All fields are None

        let result_event = Event::from_kafka_and_parsed_with_cim(
            &kafka_msg,
            &parsed_event,
            "Test Source".to_string(),
            "Test Category".to_string(),
            "Test Outcome".to_string(),
            "Test Action".to_string(),
        );

        // Verify basic fields are set from Kafka message
        assert_eq!(result_event.event_id, "empty-test");
        assert_eq!(result_event.tenant_id, "tenant-A");
        assert_eq!(result_event.source_ip, "192.168.1.100");

        // Verify all CIM fields are None (no panics)
        assert_eq!(result_event.user, None);
        assert_eq!(result_event.dest_ip, None);
        assert_eq!(result_event.vendor, None);
        assert_eq!(result_event.protocol, None);

        println!("✅ Empty ParsedEvent mapping verified successfully!");
    }
}
