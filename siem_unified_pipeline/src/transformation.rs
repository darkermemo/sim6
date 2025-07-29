use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn, error, debug};
use serde::{Deserialize, Serialize};
use regex::Regex;
use chrono::{DateTime, Utc};

use crate::config::{PipelineConfig, TransformationStep};
use crate::error::{Result, PipelineError};
use crate::pipeline::{PipelineEvent, ProcessingStage};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransformationStats {
    pub pipeline_name: String,
    pub events_processed: u64,
    pub events_failed: u64,
    pub events_dropped: u64,
    pub processing_time_ms: f64,
    pub last_processed: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone)]
pub struct ParsedEvent {
    pub timestamp: DateTime<Utc>,
    pub severity: String,
    pub facility: String,
    pub hostname: String,
    pub process: String,
    pub message: String,
    pub fields: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct EnrichmentData {
    pub geo_location: Option<GeoLocation>,
    pub threat_intel: Option<ThreatIntel>,
    pub asset_info: Option<AssetInfo>,
    pub user_info: Option<UserInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeoLocation {
    pub country: String,
    pub city: String,
    pub latitude: f64,
    pub longitude: f64,
    pub asn: Option<String>,
    pub organization: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreatIntel {
    pub is_malicious: bool,
    pub threat_type: Option<String>,
    pub confidence: f64,
    pub source: String,
    pub last_seen: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetInfo {
    pub asset_id: String,
    pub asset_type: String,
    pub owner: String,
    pub criticality: String,
    pub location: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub user_id: String,
    pub username: String,
    pub department: String,
    pub role: String,
    pub risk_score: f64,
}

pub struct TransformationManager {
    config: PipelineConfig,
    stats: Arc<RwLock<HashMap<String, TransformationStats>>>,
    parsers: HashMap<String, Box<dyn EventParser + Send + Sync>>,
    enrichers: HashMap<String, Box<dyn EventEnricher + Send + Sync>>,
    filters: HashMap<String, Box<dyn EventFilter + Send + Sync>>,
    normalizers: HashMap<String, Box<dyn EventNormalizer + Send + Sync>>,
}

#[async_trait::async_trait]
pub trait EventParser: Send + Sync {
    async fn parse(&self, event: &mut PipelineEvent) -> Result<ParsedEvent>;
    fn name(&self) -> &str;
}

#[async_trait::async_trait]
pub trait EventEnricher: Send + Sync {
    async fn enrich(&self, event: &mut PipelineEvent, _parsed: &ParsedEvent) -> Result<EnrichmentData>;
    fn name(&self) -> &str;
}

#[async_trait::async_trait]
pub trait EventFilter: Send + Sync {
    async fn should_process(&self, event: &PipelineEvent, parsed: &ParsedEvent) -> Result<bool>;
    fn name(&self) -> &str;
}

#[async_trait::async_trait]
pub trait EventNormalizer: Send + Sync {
    async fn normalize(&self, _event: &mut PipelineEvent, _parsed: &ParsedEvent, _enrichment: &EnrichmentData) -> Result<()>;
    fn name(&self) -> &str;
}

// Built-in parsers
pub struct SyslogParser {
    regex: Regex,
}

pub struct JsonParser;

pub struct CefParser {
    regex: Regex,
}

pub struct WindowsEventParser;

// Built-in enrichers
pub struct GeoIpEnricher {
    // In a real implementation, this would contain GeoIP database
}

pub struct ThreatIntelEnricher {
    // In a real implementation, this would connect to threat intel feeds
}

pub struct AssetEnricher {
    assets: HashMap<String, AssetInfo>,
}

pub struct UserEnricher {
    users: HashMap<String, UserInfo>,
}

// Built-in filters
pub struct SeverityFilter {
    min_severity: String,
}

pub struct SourceFilter {
    allowed_sources: Vec<String>,
}

pub struct RegexFilter {
    pattern: Regex,
    field: String,
}

// Built-in normalizers
pub struct CommonEventFormatNormalizer;

pub struct ElasticCommonSchemaNormalizer;

impl TransformationManager {
    pub async fn new(config: &PipelineConfig) -> Result<Self> {
        info!("Initializing transformation manager");
        
        let mut manager = TransformationManager {
            config: config.clone(),
            stats: Arc::new(RwLock::new(HashMap::new())),
            parsers: HashMap::new(),
            enrichers: HashMap::new(),
            filters: HashMap::new(),
            normalizers: HashMap::new(),
        };
        
        // Register built-in parsers
        manager.register_parser(Box::new(SyslogParser::new()?));
        manager.register_parser(Box::new(JsonParser));
        manager.register_parser(Box::new(CefParser::new()?));
        manager.register_parser(Box::new(WindowsEventParser));
        
        // Register built-in enrichers
        manager.register_enricher(Box::new(GeoIpEnricher::new()));
        manager.register_enricher(Box::new(ThreatIntelEnricher::new()));
        manager.register_enricher(Box::new(AssetEnricher::new()));
        manager.register_enricher(Box::new(UserEnricher::new()));
        
        // Register built-in filters
        manager.register_filter(Box::new(SeverityFilter::new("info")));
        manager.register_filter(Box::new(SourceFilter::new(vec![])));
        
        // Register built-in normalizers
        manager.register_normalizer(Box::new(CommonEventFormatNormalizer));
        manager.register_normalizer(Box::new(ElasticCommonSchemaNormalizer));
        
        // Initialize stats for each transformation pipeline
        {
            let mut stats_guard = manager.stats.write().await;
            for pipeline_name in config.transformations.keys() {
                stats_guard.insert(pipeline_name.clone(), TransformationStats {
                    pipeline_name: pipeline_name.clone(),
                    events_processed: 0,
                    events_failed: 0,
                    events_dropped: 0,
                    processing_time_ms: 0.0,
                    last_processed: None,
                });
            }
        }
        
        Ok(manager)
    }
    
    pub fn register_parser(&mut self, parser: Box<dyn EventParser + Send + Sync>) {
        let name = parser.name().to_string();
        self.parsers.insert(name, parser);
    }
    
    pub fn register_enricher(&mut self, enricher: Box<dyn EventEnricher + Send + Sync>) {
        let name = enricher.name().to_string();
        self.enrichers.insert(name, enricher);
    }
    
    pub fn register_filter(&mut self, filter: Box<dyn EventFilter + Send + Sync>) {
        let name = filter.name().to_string();
        self.filters.insert(name, filter);
    }
    
    pub fn register_normalizer(&mut self, normalizer: Box<dyn EventNormalizer + Send + Sync>) {
        let name = normalizer.name().to_string();
        self.normalizers.insert(name, normalizer);
    }
    
    pub async fn process_event(&self, event: &mut PipelineEvent) -> Result<()> {
        let start_time = std::time::Instant::now();
        
        // Determine which transformation pipeline to use
        let pipeline_name = self.determine_pipeline(event)?;
        let pipeline_config = self.config.transformations.get(&pipeline_name)
            .ok_or_else(|| PipelineError::not_found(format!("Transformation pipeline '{}' not found", pipeline_name)))?;
        
        debug!("Processing event {} with pipeline: {}", event.id, pipeline_name);
        
        // Execute transformation steps
        let mut _parsed_event = None;
        let mut enrichment_data = EnrichmentData {
            geo_location: None,
            threat_intel: None,
            asset_info: None,
            user_info: None,
        };
        
        for step in &pipeline_config.steps {
            match step {
                TransformationStep::Parse { parser, .. } => {
                    if let Some(parser_impl) = self.parsers.get(parser) {
                        match parser_impl.parse(event).await {
                            Ok(parsed) => {
                                debug!("Event {} parsed successfully with {}", event.id, parser);
                                event.processing_stage = ProcessingStage::Parsed;
                                _parsed_event = Some(parsed);
                            }
                            Err(e) => {
                                error!("Parsing failed for event {} with {}: {}", event.id, parser, e);
                                self.increment_failed_count(&pipeline_name).await;
                                return Err(e);
                            }
                        }
                    } else {
                        return Err(PipelineError::not_found(format!("Parser '{}' not found", parser)));
                    }
                }
                TransformationStep::Enrich { enricher, .. } => {
                    if let Some(ref _parsed) = _parsed_event {
                        if let Some(enricher_impl) = self.enrichers.get(enricher) {
                            match enricher_impl.enrich(event, _parsed).await {
                                Ok(enrichment) => {
                                    debug!("Event {} enriched successfully with {}", event.id, enricher);
                                    event.processing_stage = ProcessingStage::Enriched;
                                    
                                    // Merge enrichment data
                                    if enrichment.geo_location.is_some() {
                                        enrichment_data.geo_location = enrichment.geo_location;
                                    }
                                    if enrichment.threat_intel.is_some() {
                                        enrichment_data.threat_intel = enrichment.threat_intel;
                                    }
                                    if enrichment.asset_info.is_some() {
                                        enrichment_data.asset_info = enrichment.asset_info;
                                    }
                                    if enrichment.user_info.is_some() {
                                        enrichment_data.user_info = enrichment.user_info;
                                    }
                                }
                                Err(e) => {
                                    warn!("Enrichment failed for event {} with {}: {}", event.id, enricher, e);
                                    // Enrichment failures are not fatal
                                }
                            }
                        }
                    }
                }
                TransformationStep::Filter { condition, action: _ } => {
                    if let Some(ref _parsed) = _parsed_event {
                        // For now, implement a simple condition check
                        // In a real implementation, this would parse and evaluate the condition
                        let should_process = true; // Placeholder logic
                        
                        if !should_process {
                            debug!("Event {} filtered out by condition: {}", event.id, condition);
                            event.processing_stage = ProcessingStage::Filtered;
                            self.increment_dropped_count(&pipeline_name).await;
                            return Err(PipelineError::validation("Event filtered out"));
                        }
                        debug!("Event {} passed filter condition: {}", event.id, condition);
                    }
                }
                TransformationStep::Map { field_mappings } => {
                    debug!("Applying field mappings: {:?}", field_mappings);
                    // Field mapping implementation would go here
                    // For now, just log that we're applying mappings
                    for (source_field, target_field) in field_mappings {
                        debug!("Mapping field {} to {}", source_field, target_field);
                        // In a real implementation, this would copy/transform field values
                    }
                }
                TransformationStep::Normalize { schema, .. } => {
                    if let Some(ref parsed) = _parsed_event {
                        if let Some(normalizer_impl) = self.normalizers.get(schema) {
                            match normalizer_impl.normalize(event, parsed, &enrichment_data).await {
                                Ok(_) => {
                                    debug!("Event {} normalized successfully with {}", event.id, schema);
                                    event.processing_stage = ProcessingStage::Normalized;
                                }
                                Err(e) => {
                                    error!("Normalization failed for event {} with {}: {}", event.id, schema, e);
                                    self.increment_failed_count(&pipeline_name).await;
                                    return Err(e);
                                }
                            }
                        }
                    }
                }
                TransformationStep::Aggregate { window, .. } => {
                    debug!("Applying aggregation with window: {}", window);
                    // Aggregation implementation would go here
                    // For now, just log that we're applying aggregation
                }
                TransformationStep::Custom { plugin, .. } => {
                    debug!("Applying custom plugin: {}", plugin);
                    // Custom plugin implementation would go here
                    // For now, just log that we're applying a custom plugin
                }
            }
        }
        
        let processing_time = start_time.elapsed().as_millis() as f64;
        self.update_stats(&pipeline_name, processing_time).await;
        
        debug!("Event {} transformation completed in {:.2}ms", event.id, processing_time);
        Ok(())
    }
    
    fn determine_pipeline(&self, event: &PipelineEvent) -> Result<String> {
        // Simple pipeline selection based on source
        // In a real implementation, this could be more sophisticated
        let _source_type = event.metadata.get("source_type").unwrap_or(&"default".to_string());
        
        // For now, just use the first available pipeline or default
        if let Some((pipeline_name, _)) = self.config.transformations.iter().next() {
            return Ok(pipeline_name.clone());
        }
        
        // Default pipeline
        Ok("default".to_string())
    }
    
    async fn update_stats(&self, pipeline_name: &str, processing_time_ms: f64) {
        let mut stats_guard = self.stats.write().await;
        if let Some(stats) = stats_guard.get_mut(pipeline_name) {
            stats.events_processed += 1;
            stats.processing_time_ms = (stats.processing_time_ms + processing_time_ms) / 2.0; // Moving average
            stats.last_processed = Some(Utc::now());
        }
    }
    
    async fn increment_failed_count(&self, pipeline_name: &str) {
        let mut stats_guard = self.stats.write().await;
        if let Some(stats) = stats_guard.get_mut(pipeline_name) {
            stats.events_failed += 1;
        }
    }
    
    async fn increment_dropped_count(&self, pipeline_name: &str) {
        let mut stats_guard = self.stats.write().await;
        if let Some(stats) = stats_guard.get_mut(pipeline_name) {
            stats.events_dropped += 1;
        }
    }
    
    pub async fn get_stats(&self) -> HashMap<String, TransformationStats> {
        let stats_guard = self.stats.read().await;
        stats_guard.clone()
    }
    
    pub async fn get_health(&self) -> serde_json::Value {
        let stats = self.get_stats().await;
        
        let mut total_processed = 0;
        let mut total_failed = 0;
        let mut avg_processing_time = 0.0;
        let mut active_pipelines = 0;
        
        for pipeline_stats in stats.values() {
            total_processed += pipeline_stats.events_processed;
            total_failed += pipeline_stats.events_failed;
            avg_processing_time += pipeline_stats.processing_time_ms;
            
            if pipeline_stats.last_processed.is_some() {
                active_pipelines += 1;
            }
        }
        
        if !stats.is_empty() {
            avg_processing_time /= stats.len() as f64;
        }
        
        let error_rate = if total_processed > 0 {
            total_failed as f64 / total_processed as f64
        } else {
            0.0
        };
        
        let health_status = if error_rate < 0.05 {
            "healthy"
        } else if error_rate < 0.20 {
            "degraded"
        } else {
            "unhealthy"
        };
        
        serde_json::json!({
            "status": health_status,
            "total_processed": total_processed,
            "total_failed": total_failed,
            "error_rate": error_rate,
            "avg_processing_time_ms": avg_processing_time,
            "active_pipelines": active_pipelines,
            "pipelines": stats
        })
    }
    
    pub async fn reload_config(&self, _new_config: &PipelineConfig) -> Result<()> {
        info!("Reloading transformation configuration");
        // Implementation would update transformation pipelines
        Ok(())
    }
    
    pub async fn shutdown(&self) -> Result<()> {
        info!("Shutting down transformation manager");
        Ok(())
    }
}

// Parser implementations
impl SyslogParser {
    pub fn new() -> Result<Self> {
        let regex = Regex::new(r"^<(\d+)>(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+(\S+):\s*(.*)$")
            .map_err(|e| PipelineError::parsing(format!("Invalid syslog regex: {}", e)))?;
        
        Ok(SyslogParser { regex })
    }
}

#[async_trait::async_trait]
impl EventParser for SyslogParser {
    async fn parse(&self, event: &mut PipelineEvent) -> Result<ParsedEvent> {
        let raw_message = event.data["raw_message"].as_str()
            .ok_or_else(|| PipelineError::parsing("No raw_message field found"))?;
        
        if let Some(captures) = self.regex.captures(raw_message) {
            let priority = captures.get(1).unwrap().as_str().parse::<u32>()
                .map_err(|e| PipelineError::parsing(format!("Invalid priority: {}", e)))?;
            
            let facility = (priority >> 3).to_string();
            let severity = match priority & 7 {
                0 => "emergency",
                1 => "alert",
                2 => "critical",
                3 => "error",
                4 => "warning",
                5 => "notice",
                6 => "info",
                7 => "debug",
                _ => "unknown",
            }.to_string();
            
            let timestamp_str = captures.get(2).unwrap().as_str();
            let hostname = captures.get(3).unwrap().as_str().to_string();
            let process = captures.get(4).unwrap().as_str().to_string();
            let message = captures.get(5).unwrap().as_str().to_string();
            
            // Parse timestamp (simplified)
            let timestamp = Utc::now(); // In real implementation, parse the actual timestamp
            
            let mut fields = HashMap::new();
            fields.insert("priority".to_string(), serde_json::Value::Number(priority.into()));
            fields.insert("raw_timestamp".to_string(), serde_json::Value::String(timestamp_str.to_string()));
            
            Ok(ParsedEvent {
                timestamp,
                severity,
                facility,
                hostname,
                process,
                message,
                fields,
            })
        } else {
            Err(PipelineError::parsing("Failed to parse syslog message"))
        }
    }
    
    fn name(&self) -> &str {
        "syslog"
    }
}

#[async_trait::async_trait]
impl EventParser for JsonParser {
    async fn parse(&self, event: &mut PipelineEvent) -> Result<ParsedEvent> {
        let raw_message = event.data["raw_message"].as_str()
            .ok_or_else(|| PipelineError::parsing("No raw_message field found"))?;
        
        let json_data: serde_json::Value = serde_json::from_str(raw_message)
            .map_err(|e| PipelineError::parsing(format!("Invalid JSON: {}", e)))?;
        
        let timestamp = Utc::now(); // Extract from JSON if available
        let severity = json_data["severity"].as_str().unwrap_or("info").to_string();
        let facility = json_data["facility"].as_str().unwrap_or("user").to_string();
        let hostname = json_data["hostname"].as_str().unwrap_or("unknown").to_string();
        let process = json_data["process"].as_str().unwrap_or("unknown").to_string();
        let message = json_data["message"].as_str().unwrap_or("").to_string();
        
        let fields = if let serde_json::Value::Object(map) = json_data {
            map.into_iter().collect()
        } else {
            HashMap::new()
        };
        
        Ok(ParsedEvent {
            timestamp,
            severity,
            facility,
            hostname,
            process,
            message,
            fields,
        })
    }
    
    fn name(&self) -> &str {
        "json"
    }
}

// Implement other parsers, enrichers, filters, and normalizers...
// (Abbreviated for brevity - full implementations would follow similar patterns)

impl CefParser {
    pub fn new() -> Result<Self> {
        let regex = Regex::new(r"^CEF:(\d+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)$")
            .map_err(|e| PipelineError::parsing(format!("Invalid CEF regex: {}", e)))?;
        
        Ok(CefParser { regex })
    }
}

#[async_trait::async_trait]
impl EventParser for CefParser {
    async fn parse(&self, _event: &mut PipelineEvent) -> Result<ParsedEvent> {
        // CEF parsing implementation
        Ok(ParsedEvent {
            timestamp: Utc::now(),
            severity: "info".to_string(),
            facility: "security".to_string(),
            hostname: "unknown".to_string(),
            process: "cef".to_string(),
            message: "CEF event".to_string(),
            fields: HashMap::new(),
        })
    }
    
    fn name(&self) -> &str {
        "cef"
    }
}

#[async_trait::async_trait]
impl EventParser for WindowsEventParser {
    async fn parse(&self, _event: &mut PipelineEvent) -> Result<ParsedEvent> {
        // Windows Event Log parsing implementation
        Ok(ParsedEvent {
            timestamp: Utc::now(),
            severity: "info".to_string(),
            facility: "windows".to_string(),
            hostname: "unknown".to_string(),
            process: "windows".to_string(),
            message: "Windows event".to_string(),
            fields: HashMap::new(),
        })
    }
    
    fn name(&self) -> &str {
        "windows"
    }
}

// Enricher implementations
impl Default for GeoIpEnricher {
    fn default() -> Self {
        Self::new()
    }
}

impl GeoIpEnricher {
    pub fn new() -> Self {
        GeoIpEnricher {}
    }
}

#[async_trait::async_trait]
impl EventEnricher for GeoIpEnricher {
    async fn enrich(&self, _event: &mut PipelineEvent, _parsed: &ParsedEvent) -> Result<EnrichmentData> {
        // GeoIP enrichment implementation
        Ok(EnrichmentData {
            geo_location: Some(GeoLocation {
                country: "Unknown".to_string(),
                city: "Unknown".to_string(),
                latitude: 0.0,
                longitude: 0.0,
                asn: None,
                organization: None,
            }),
            threat_intel: None,
            asset_info: None,
            user_info: None,
        })
    }
    
    fn name(&self) -> &str {
        "geoip"
    }
}

// Implement other components...
// (Additional implementations would follow similar patterns)

impl Default for ThreatIntelEnricher {
    fn default() -> Self {
        Self::new()
    }
}

impl ThreatIntelEnricher {
    pub fn new() -> Self {
        ThreatIntelEnricher {}
    }
}

#[async_trait::async_trait]
impl EventEnricher for ThreatIntelEnricher {
    async fn enrich(&self, _event: &mut PipelineEvent, _parsed: &ParsedEvent) -> Result<EnrichmentData> {
        Ok(EnrichmentData {
            geo_location: None,
            threat_intel: Some(ThreatIntel {
                is_malicious: false,
                threat_type: None,
                confidence: 0.0,
                source: "internal".to_string(),
                last_seen: None,
            }),
            asset_info: None,
            user_info: None,
        })
    }
    
    fn name(&self) -> &str {
        "threat_intel"
    }
}

impl Default for AssetEnricher {
    fn default() -> Self {
        Self::new()
    }
}

impl AssetEnricher {
    pub fn new() -> Self {
        AssetEnricher {
            assets: HashMap::new(),
        }
    }
}

#[async_trait::async_trait]
impl EventEnricher for AssetEnricher {
    async fn enrich(&self, _event: &mut PipelineEvent, _parsed: &ParsedEvent) -> Result<EnrichmentData> {
        Ok(EnrichmentData {
            geo_location: None,
            threat_intel: None,
            asset_info: None,
            user_info: None,
        })
    }
    
    fn name(&self) -> &str {
        "asset"
    }
}

impl Default for UserEnricher {
    fn default() -> Self {
        Self::new()
    }
}

impl UserEnricher {
    pub fn new() -> Self {
        UserEnricher {
            users: HashMap::new(),
        }
    }
}

#[async_trait::async_trait]
impl EventEnricher for UserEnricher {
    async fn enrich(&self, _event: &mut PipelineEvent, _parsed: &ParsedEvent) -> Result<EnrichmentData> {
        Ok(EnrichmentData {
            geo_location: None,
            threat_intel: None,
            asset_info: None,
            user_info: None,
        })
    }
    
    fn name(&self) -> &str {
        "user"
    }
}

// Filter implementations
impl SeverityFilter {
    pub fn new(min_severity: &str) -> Self {
        SeverityFilter {
            min_severity: min_severity.to_string(),
        }
    }
}

#[async_trait::async_trait]
impl EventFilter for SeverityFilter {
    async fn should_process(&self, _event: &PipelineEvent, _parsed: &ParsedEvent) -> Result<bool> {
        // Implement severity level comparison
        Ok(true)
    }
    
    fn name(&self) -> &str {
        "severity"
    }
}

impl SourceFilter {
    pub fn new(allowed_sources: Vec<String>) -> Self {
        SourceFilter { allowed_sources }
    }
}

#[async_trait::async_trait]
impl EventFilter for SourceFilter {
    async fn should_process(&self, event: &PipelineEvent, _parsed: &ParsedEvent) -> Result<bool> {
        if self.allowed_sources.is_empty() {
            return Ok(true);
        }
        
        Ok(self.allowed_sources.iter().any(|source| event.source.contains(source)))
    }
    
    fn name(&self) -> &str {
        "source"
    }
}

// Normalizer implementations
#[async_trait::async_trait]
impl EventNormalizer for CommonEventFormatNormalizer {
    async fn normalize(&self, _event: &mut PipelineEvent, _parsed: &ParsedEvent, _enrichment: &EnrichmentData) -> Result<()> {
        // Normalize to Common Event Format
        Ok(())
    }
    
    fn name(&self) -> &str {
        "cef"
    }
}

#[async_trait::async_trait]
impl EventNormalizer for ElasticCommonSchemaNormalizer {
    async fn normalize(&self, _event: &mut PipelineEvent, _parsed: &ParsedEvent, _enrichment: &EnrichmentData) -> Result<()> {
        // Normalize to Elastic Common Schema
        Ok(())
    }
    
    fn name(&self) -> &str {
        "ecs"
    }
}