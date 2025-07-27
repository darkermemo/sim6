# SIEM Agent: Architecture & Operational Plan

## Executive Summary

This document outlines the comprehensive architectural and operational plan for enhancing the existing SIEM Agent into a modern, high-performance, cross-platform log collection agent. The current implementation provides a solid foundation with file tailing, Windows Event Collection, on-disk buffering, and basic remote configuration capabilities. This plan details the enhancements needed to achieve full central management, secure auto-updates, fleet monitoring, and production-ready deployment.

## Current Implementation Analysis

### Existing Capabilities ✅

**Core Infrastructure:**
- ✅ Rust-based implementation with async/await using Tokio
- ✅ Cross-platform support (Windows and Unix-like systems)
- ✅ On-disk buffering using Sled database for lossless log collection
- ✅ File tailing with position tracking and log rotation handling
- ✅ Windows Event Collection via native Windows APIs
- ✅ HTTP-based log forwarding with retry logic
- ✅ Basic remote configuration via API endpoints
- ✅ Auto-update mechanism with checksum verification
- ✅ Graceful shutdown and signal handling

**Data Collection:**
- ✅ File monitoring with `notify` crate for efficient change detection
- ✅ Windows Event Log collection using Windows APIs
- ✅ Structured log entries with metadata (timestamp, source, type)
- ✅ Batch processing for efficient network utilization

**Configuration & Management:**
- ✅ YAML-based local configuration
- ✅ Remote configuration fetching from API
- ✅ Asset ID and Agent Key authentication
- ✅ Environment variable support for credentials

### Architecture Gaps to Address

1. **Fleet Management & Monitoring**
   - Missing heartbeat mechanism
   - No centralized agent status visibility
   - Limited health metrics collection

2. **Enhanced Security**
   - Basic authentication (needs enhancement)
   - Missing certificate-based authentication
   - No request signing or advanced security features

3. **Deployment & Installation**
   - Missing automated installation scripts
   - No service management integration
   - Limited packaging for different platforms

4. **Configuration Management**
   - Basic policy support (needs enhancement)
   - Missing configuration validation
   - No configuration rollback mechanism

## Enhanced Architecture Design

### 1. Core Architectural Principles

#### Lightweight & Performant
- **Memory Footprint**: Target <50MB RAM usage under normal operation
- **CPU Usage**: <5% CPU utilization during peak log collection
- **Disk I/O**: Optimized buffering with configurable flush intervals
- **Network Efficiency**: Compression and batching for minimal bandwidth usage

#### Resilient & Lossless
- **On-Disk Buffering**: Enhanced Sled-based storage with configurable retention
- **Position Tracking**: Persistent file position storage with atomic updates
- **Network Resilience**: Exponential backoff with jitter for retry logic
- **Graceful Degradation**: Continue operation during partial failures

#### Secure by Default
- **TLS 1.3**: All communications encrypted with modern cipher suites
- **Mutual Authentication**: Certificate-based agent authentication
- **Request Signing**: HMAC-SHA256 signing for API requests
- **Secure Updates**: Code signing verification for all updates

#### Centrally Managed
- **Policy-Driven**: All configuration via centralized policies
- **Real-Time Updates**: Configuration changes applied within minutes
- **Fleet Visibility**: Comprehensive agent status and health monitoring
- **Remote Diagnostics**: Ability to retrieve logs and metrics remotely

### 2. Enhanced Data Collection Architecture

#### File Tailing Module (Enhanced)
```rust
// Enhanced file tailing with advanced features
pub struct EnhancedFileTailer {
    file_configs: Vec<FileConfig>,
    position_tracker: Arc<PositionTracker>,
    buffer_manager: Arc<BufferManager>,
    metrics_collector: Arc<MetricsCollector>,
}

pub struct FileConfig {
    pub path: PathBuf,
    pub log_type: String,
    pub encoding: String,           // UTF-8, UTF-16, etc.
    pub multiline_pattern: Option<Regex>,
    pub exclude_patterns: Vec<Regex>,
    pub max_line_length: usize,
    pub rotation_detection: RotationMethod,
}

pub enum RotationMethod {
    Inode,      // Unix-style inode tracking
    Size,       // Size-based detection
    Timestamp,  // Modification time
    Hybrid,     // Combination approach
}
```

#### Windows Event Collection Module (Enhanced)
```rust
// Enhanced Windows Event Collection
pub struct EnhancedWindowsCollector {
    subscriptions: HashMap<String, EventSubscription>,
    filter_manager: Arc<EventFilterManager>,
    buffer_manager: Arc<BufferManager>,
    metrics_collector: Arc<MetricsCollector>,
}

pub struct EventSubscription {
    pub channel: String,
    pub query: String,              // XPath query for filtering
    pub bookmark: Option<String>,   // Resume point for reliability
    pub batch_size: usize,
    pub max_latency: Duration,
}

pub struct EventFilterManager {
    pub include_event_ids: HashSet<u32>,
    pub exclude_event_ids: HashSet<u32>,
    pub severity_filter: SeverityLevel,
    pub custom_filters: Vec<EventFilter>,
}
```

### 3. Configuration Management Architecture

#### Policy-Based Configuration
```rust
// Enhanced configuration structure
#[derive(Serialize, Deserialize, Clone)]
pub struct AgentPolicy {
    pub policy_id: String,
    pub version: u64,
    pub effective_date: DateTime<Utc>,
    pub expiry_date: Option<DateTime<Utc>>,
    
    // Data collection configuration
    pub file_collection: FileCollectionPolicy,
    pub windows_events: WindowsEventPolicy,
    
    // Agent behavior
    pub forwarding: ForwardingPolicy,
    pub buffering: BufferingPolicy,
    pub monitoring: MonitoringPolicy,
    
    // Security settings
    pub security: SecurityPolicy,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct FileCollectionPolicy {
    pub files: Vec<FileConfig>,
    pub global_settings: FileGlobalSettings,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ForwardingPolicy {
    pub ingestor_url: String,
    pub batch_size: usize,
    pub max_batch_delay: Duration,
    pub compression: CompressionType,
    pub retry_policy: RetryPolicy,
}
```

#### Configuration API Endpoints
```
# Agent Configuration Management
GET  /v1/agents/{asset_id}/policy          # Get current policy
POST /v1/agents/{asset_id}/policy/validate # Validate policy before apply
PUT  /v1/agents/{asset_id}/policy          # Update policy
GET  /v1/agents/{asset_id}/policy/history  # Policy change history

# Agent Registration & Authentication
POST /v1/agents/register                   # Initial agent registration
POST /v1/agents/authenticate               # Renew authentication tokens
GET  /v1/agents/{asset_id}/certificates    # Download client certificates
```

### 4. Fleet Management & Monitoring

#### Heartbeat & Health Monitoring
```rust
// Enhanced heartbeat with comprehensive metrics
#[derive(Serialize, Deserialize)]
pub struct AgentHeartbeat {
    pub agent_id: String,
    pub timestamp: DateTime<Utc>,
    pub version: String,
    pub uptime_seconds: u64,
    
    // System metrics
    pub system_info: SystemInfo,
    pub resource_usage: ResourceUsage,
    
    // Agent-specific metrics
    pub collection_stats: CollectionStats,
    pub buffer_stats: BufferStats,
    pub forwarding_stats: ForwardingStats,
    
    // Health status
    pub status: AgentStatus,
    pub last_error: Option<ErrorInfo>,
    pub warnings: Vec<WarningInfo>,
}

#[derive(Serialize, Deserialize)]
pub struct CollectionStats {
    pub files_monitored: usize,
    pub events_collected_last_hour: u64,
    pub bytes_collected_last_hour: u64,
    pub collection_errors_last_hour: u32,
    pub windows_channels_active: usize,
}

#[derive(Serialize, Deserialize)]
pub struct BufferStats {
    pub pending_logs_count: u64,
    pub buffer_size_bytes: u64,
    pub oldest_log_age_seconds: u64,
    pub buffer_utilization_percent: f32,
}
```

#### Fleet Management API
```
# Fleet Monitoring
POST /v1/agents/heartbeat                  # Agent heartbeat submission
GET  /v1/fleet/status                      # Overall fleet status
GET  /v1/fleet/agents                      # List all agents with status
GET  /v1/fleet/agents/{asset_id}/details   # Detailed agent information
GET  /v1/fleet/agents/{asset_id}/logs      # Agent's own logs
GET  /v1/fleet/agents/{asset_id}/metrics   # Historical metrics

# Fleet Operations
POST /v1/fleet/agents/{asset_id}/restart   # Remote restart command
POST /v1/fleet/agents/{asset_id}/update    # Force update check
POST /v1/fleet/agents/bulk/policy          # Bulk policy updates
```

### 5. Security Architecture

#### Authentication & Authorization
```rust
// Enhanced security configuration
#[derive(Serialize, Deserialize, Clone)]
pub struct SecurityPolicy {
    pub authentication: AuthenticationConfig,
    pub encryption: EncryptionConfig,
    pub access_control: AccessControlConfig,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AuthenticationConfig {
    pub method: AuthMethod,
    pub certificate_path: Option<PathBuf>,
    pub key_path: Option<PathBuf>,
    pub ca_bundle_path: PathBuf,
    pub token_refresh_interval: Duration,
}

#[derive(Serialize, Deserialize, Clone)]
pub enum AuthMethod {
    ApiKey,
    Certificate,
    Hybrid,  // API key + certificate
}
```

#### Request Signing
```rust
// HMAC-SHA256 request signing
pub struct RequestSigner {
    secret_key: Vec<u8>,
}

impl RequestSigner {
    pub fn sign_request(&self, method: &str, path: &str, body: &[u8], timestamp: u64) -> String {
        let message = format!("{}\n{}\n{}\n{}", method, path, timestamp, 
                             base64::encode(body));
        let signature = hmac_sha256(&self.secret_key, message.as_bytes());
        base64::encode(signature)
    }
}
```

### 6. Deployment & Installation

#### Installation Package Structure
```
siem_agent_installer/
├── bin/
│   ├── siem_agent_linux_x64
│   ├── siem_agent_linux_arm64
│   ├── siem_agent_windows_x64.exe
│   └── siem_agent_darwin_x64
├── scripts/
│   ├── install.sh              # Linux/macOS installer
│   ├── install.ps1             # Windows installer
│   ├── uninstall.sh            # Linux/macOS uninstaller
│   └── uninstall.ps1           # Windows uninstaller
├── config/
│   ├── systemd/
│   │   └── siem-agent.service  # systemd service definition
│   ├── windows/
│   │   └── service.xml         # Windows service definition
│   └── templates/
│       └── bootstrap.yaml      # Bootstrap configuration template
└── docs/
    ├── README.md
    ├── INSTALLATION.md
    └── TROUBLESHOOTING.md
```

#### Enhanced Installation Script (Linux)
```bash
#!/bin/bash
# install.sh - Enhanced SIEM Agent installer

set -euo pipefail

# Configuration
AGENT_USER="siem-agent"
AGENT_GROUP="siem-agent"
INSTALL_DIR="/opt/siem-agent"
CONFIG_DIR="/etc/siem-agent"
DATA_DIR="/var/lib/siem-agent"
LOG_DIR="/var/log/siem-agent"
SERVICE_NAME="siem-agent"

# Functions
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" >&2
}

check_prerequisites() {
    # Check for root privileges
    if [[ $EUID -ne 0 ]]; then
        log "ERROR: This script must be run as root"
        exit 1
    fi
    
    # Check for required commands
    for cmd in systemctl curl; do
        if ! command -v "$cmd" &> /dev/null; then
            log "ERROR: Required command '$cmd' not found"
            exit 1
        fi
    done
}

create_user() {
    if ! id "$AGENT_USER" &>/dev/null; then
        log "Creating user: $AGENT_USER"
        useradd --system --shell /bin/false --home-dir "$DATA_DIR" \
                --create-home --user-group "$AGENT_USER"
    fi
}

install_binary() {
    local arch
    arch=$(uname -m)
    
    case "$arch" in
        x86_64) binary="siem_agent_linux_x64" ;;
        aarch64) binary="siem_agent_linux_arm64" ;;
        *) log "ERROR: Unsupported architecture: $arch"; exit 1 ;;
    esac
    
    log "Installing binary: $binary"
    install -m 755 "bin/$binary" "$INSTALL_DIR/siem-agent"
}

setup_directories() {
    log "Setting up directories"
    
    for dir in "$INSTALL_DIR" "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR"; do
        mkdir -p "$dir"
    done
    
    chown -R "$AGENT_USER:$AGENT_GROUP" "$DATA_DIR" "$LOG_DIR"
    chmod 750 "$DATA_DIR" "$LOG_DIR"
    chmod 755 "$CONFIG_DIR"
}

install_service() {
    log "Installing systemd service"
    
    cp "config/systemd/siem-agent.service" "/etc/systemd/system/"
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
}

configure_agent() {
    log "Configuring agent"
    
    # Prompt for configuration
    read -p "Enter Asset ID: " asset_id
    read -s -p "Enter Agent Key: " agent_key
    echo
    read -p "Enter API URL [https://your-siem.com/api]: " api_url
    api_url=${api_url:-"https://your-siem.com/api"}
    
    # Create bootstrap configuration
    cat > "$CONFIG_DIR/bootstrap.yaml" <<EOF
asset_id: "$asset_id"
agent_key: "$agent_key"
api_url: "$api_url"
use_local_config: false
enable_auto_update: true
update_check_interval_hours: 24
EOF
    
    chmod 600 "$CONFIG_DIR/bootstrap.yaml"
    chown "$AGENT_USER:$AGENT_GROUP" "$CONFIG_DIR/bootstrap.yaml"
}

start_service() {
    log "Starting SIEM Agent service"
    systemctl start "$SERVICE_NAME"
    
    # Wait for service to start
    sleep 5
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log "SUCCESS: SIEM Agent installed and started successfully"
        log "Service status: $(systemctl is-active $SERVICE_NAME)"
        log "Logs: journalctl -u $SERVICE_NAME -f"
    else
        log "ERROR: Service failed to start. Check logs: journalctl -u $SERVICE_NAME"
        exit 1
    fi
}

# Main installation flow
main() {
    log "Starting SIEM Agent installation"
    
    check_prerequisites
    create_user
    setup_directories
    install_binary
    install_service
    configure_agent
    start_service
    
    log "Installation completed successfully"
}

main "$@"
```

### 7. Auto-Update Architecture

#### Enhanced Update Mechanism
```rust
// Enhanced update system with rollback capability
pub struct UpdateManager {
    current_version: String,
    update_config: UpdateConfig,
    backup_manager: BackupManager,
    signature_verifier: SignatureVerifier,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct UpdateConfig {
    pub auto_update_enabled: bool,
    pub check_interval: Duration,
    pub update_window: Option<TimeWindow>,
    pub rollback_timeout: Duration,
    pub max_download_size: u64,
}

#[derive(Serialize, Deserialize)]
pub struct UpdateInfo {
    pub version: String,
    pub download_url: String,
    pub checksum: String,
    pub signature: String,           // Digital signature
    pub release_notes: Option<String>,
    pub critical: bool,              // Force immediate update
    pub rollback_version: Option<String>,
}

impl UpdateManager {
    pub async fn check_and_apply_updates(&self) -> Result<()> {
        let update_info = self.check_for_updates().await?;
        
        if let Some(update) = update_info {
            if update.critical || self.is_in_update_window() {
                self.apply_update(update).await?
            }
        }
        
        Ok(())
    }
    
    async fn apply_update(&self, update: UpdateInfo) -> Result<()> {
        // 1. Download update
        let update_data = self.download_update(&update).await?;
        
        // 2. Verify signature and checksum
        self.verify_update(&update_data, &update)?;
        
        // 3. Create backup
        let backup_path = self.backup_manager.create_backup().await?;
        
        // 4. Apply update atomically
        self.atomic_update(&update_data).await?;
        
        // 5. Restart and verify
        self.restart_and_verify(&backup_path).await?;
        
        Ok(())
    }
}
```

### 8. Performance & Monitoring

#### Metrics Collection
```rust
// Comprehensive metrics collection
#[derive(Serialize, Deserialize)]
pub struct AgentMetrics {
    pub timestamp: DateTime<Utc>,
    
    // System metrics
    pub cpu_usage_percent: f32,
    pub memory_usage_bytes: u64,
    pub disk_usage_bytes: u64,
    pub network_bytes_sent: u64,
    pub network_bytes_received: u64,
    
    // Collection metrics
    pub files_monitored: usize,
    pub events_per_second: f32,
    pub bytes_per_second: f32,
    pub collection_latency_ms: f32,
    
    // Buffer metrics
    pub buffer_size_bytes: u64,
    pub buffer_utilization: f32,
    pub oldest_buffered_log_age: Duration,
    
    // Error metrics
    pub errors_last_hour: u32,
    pub warnings_last_hour: u32,
    pub last_error_timestamp: Option<DateTime<Utc>>,
}

pub struct MetricsCollector {
    metrics_history: VecDeque<AgentMetrics>,
    collection_interval: Duration,
}

impl MetricsCollector {
    pub async fn collect_metrics(&mut self) -> AgentMetrics {
        let system_metrics = self.collect_system_metrics().await;
        let collection_metrics = self.collect_collection_metrics().await;
        let buffer_metrics = self.collect_buffer_metrics().await;
        
        AgentMetrics {
            timestamp: Utc::now(),
            ..system_metrics
            ..collection_metrics
            ..buffer_metrics
        }
    }
}
```

## Implementation Roadmap

### Phase 1: Core Enhancements (Weeks 1-2)
1. **Enhanced Configuration Management**
   - Implement policy-based configuration
   - Add configuration validation
   - Create configuration API endpoints

2. **Fleet Management Foundation**
   - Implement heartbeat mechanism
   - Add comprehensive metrics collection
   - Create fleet management API

### Phase 2: Security & Authentication (Weeks 3-4)
1. **Enhanced Security**
   - Implement certificate-based authentication
   - Add request signing
   - Enhance TLS configuration

2. **Secure Updates**
   - Add digital signature verification
   - Implement rollback mechanism
   - Add update scheduling

### Phase 3: Deployment & Operations (Weeks 5-6)
1. **Installation & Packaging**
   - Create installation scripts
   - Build platform-specific packages
   - Add service management

2. **Monitoring & Diagnostics**
   - Implement comprehensive logging
   - Add performance monitoring
   - Create diagnostic tools

### Phase 4: Advanced Features (Weeks 7-8)
1. **Enhanced Data Collection**
   - Add multiline log support
   - Implement advanced filtering
   - Add compression and optimization

2. **Fleet Operations**
   - Add remote diagnostics
   - Implement bulk operations
   - Create alerting system

## Testing Strategy

### Unit Testing
- **Coverage Target**: >90% code coverage
- **Test Categories**: Core logic, error handling, edge cases
- **Mock Services**: API endpoints, file systems, Windows APIs

### Integration Testing
- **End-to-End Scenarios**: Full agent lifecycle testing
- **Platform Testing**: Windows, Linux, macOS
- **Network Testing**: Various network conditions and failures

### Performance Testing
- **Load Testing**: High-volume log collection scenarios
- **Resource Testing**: Memory and CPU usage under stress
- **Endurance Testing**: Long-running stability tests

### Security Testing
- **Authentication Testing**: Various auth scenarios and failures
- **Encryption Testing**: TLS configuration and certificate validation
- **Update Security**: Signature verification and rollback testing

## Deployment Considerations

### System Requirements

**Minimum Requirements:**
- **CPU**: 1 core, 1 GHz
- **Memory**: 128 MB RAM
- **Disk**: 500 MB free space
- **Network**: Outbound HTTPS (port 443)

**Recommended Requirements:**
- **CPU**: 2 cores, 2 GHz
- **Memory**: 256 MB RAM
- **Disk**: 2 GB free space (for buffering)
- **Network**: Stable internet connection

### Platform Support

**Tier 1 Platforms (Full Support):**
- Windows Server 2019/2022
- Windows 10/11
- Ubuntu 20.04/22.04 LTS
- CentOS/RHEL 8/9
- Amazon Linux 2

**Tier 2 Platforms (Best Effort):**
- macOS 11+
- Debian 11+
- SUSE Linux Enterprise

### Network Requirements

**Outbound Connections:**
- **API Endpoint**: HTTPS (443) for configuration and heartbeat
- **Ingestor Endpoint**: HTTPS (443) for log forwarding
- **Update Endpoint**: HTTPS (443) for agent updates

**Firewall Configuration:**
- No inbound ports required
- Outbound HTTPS to SIEM platform domains
- DNS resolution for platform endpoints

## Operational Procedures

### Agent Lifecycle Management

1. **Installation**
   - Download installer package
   - Run installation script with admin privileges
   - Provide Asset ID and Agent Key
   - Verify successful startup

2. **Configuration Updates**
   - Update policy via SIEM platform UI
   - Agent automatically fetches new configuration
   - Validate configuration and apply changes
   - Monitor for successful application

3. **Monitoring & Maintenance**
   - Monitor agent status via fleet management UI
   - Review heartbeat and metrics data
   - Investigate alerts and warnings
   - Perform routine health checks

4. **Updates & Patches**
   - Automatic update checks and downloads
   - Staged rollout for critical updates
   - Rollback capability for failed updates
   - Manual update triggers if needed

5. **Decommissioning**
   - Remove agent from fleet management
   - Run uninstall script
   - Clean up configuration and data
   - Revoke agent credentials

### Troubleshooting Guide

**Common Issues:**

1. **Agent Not Starting**
   - Check service status: `systemctl status siem-agent`
   - Review logs: `journalctl -u siem-agent -f`
   - Verify configuration file syntax
   - Check file permissions and ownership

2. **Configuration Not Loading**
   - Verify network connectivity to API endpoint
   - Check Asset ID and Agent Key validity
   - Review API response in logs
   - Test manual configuration fetch

3. **Logs Not Forwarding**
   - Check ingestor endpoint connectivity
   - Review buffer status and disk space
   - Verify log file permissions
   - Check for authentication issues

4. **High Resource Usage**
   - Review monitored file count and sizes
   - Check for log rotation issues
   - Analyze buffer utilization
   - Consider adjusting batch sizes

**Diagnostic Commands:**
```bash
# Service status
sudo systemctl status siem-agent

# View logs
sudo journalctl -u siem-agent -f

# Check configuration
sudo /opt/siem-agent/siem-agent --validate-config

# Test connectivity
sudo /opt/siem-agent/siem-agent --test-connection

# View metrics
sudo /opt/siem-agent/siem-agent --show-metrics
```

## Success Metrics

### Performance Metrics
- **Resource Usage**: <50MB RAM, <5% CPU under normal load
- **Collection Latency**: <1 second from log generation to buffering
- **Forwarding Latency**: <30 seconds from buffering to SIEM platform
- **Reliability**: >99.9% uptime, zero data loss

### Operational Metrics
- **Deployment Time**: <10 minutes for standard installation
- **Configuration Update Time**: <5 minutes for policy changes
- **Fleet Visibility**: Real-time status for all agents
- **Update Success Rate**: >99% successful auto-updates

### Security Metrics
- **Authentication**: 100% authenticated communications
- **Encryption**: All data in transit encrypted with TLS 1.3
- **Update Security**: 100% signature-verified updates
- **Audit Trail**: Complete audit log for all agent operations

## Conclusion

This architectural plan provides a comprehensive roadmap for enhancing the existing SIEM Agent into a production-ready, enterprise-grade log collection solution. The plan builds upon the solid foundation already in place while addressing the key requirements for central management, security, scalability, and operational excellence.

The phased implementation approach ensures steady progress while maintaining system stability. The focus on security, performance, and operational simplicity will result in a robust agent that meets the demanding requirements of modern security operations centers.

Key success factors include:
- Leveraging existing Rust-based architecture for performance and safety
- Implementing comprehensive testing and validation procedures
- Providing clear deployment and operational documentation
- Maintaining backward compatibility during the enhancement process
- Ensuring seamless integration with existing SIEM platform components

The resulting agent will serve as a cornerstone for reliable, secure, and scalable log collection across diverse enterprise environments.