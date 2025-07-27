-- SIEM Database Setup for ClickHouse
-- This script creates the necessary tables for a multi-tenant SIEM system

-- Create the database if it doesn't exist
CREATE DATABASE IF NOT EXISTS dev;

-- Use the dev database
USE dev;

-- Events table: Stores all security events with tenant isolation and common taxonomy
CREATE TABLE IF NOT EXISTS dev.events (
    event_id String,
    tenant_id String, 
    event_timestamp UInt32,
    ingestion_timestamp UInt32,
    source_ip String,
    source_type LowCardinality(String),
    raw_event String,
    event_category LowCardinality(String),
    event_outcome LowCardinality(String),
    event_action LowCardinality(String),
    is_threat UInt8 DEFAULT 0,
    value Nullable(String),
    hour Nullable(UInt8),
    
    -- Parsing and ingestion metadata
    log_source_id Nullable(String),         -- Reference to log source
    parse_error_msg Nullable(String),       -- Error message if parsing failed
    parsing_status LowCardinality(String) DEFAULT 'success', -- 'success', 'partial', 'failed'
    alert_id Nullable(String),              -- Associated alert ID if this event triggered an alert
    alerts Nullable(String),                -- JSON array of alert IDs for this event
    
    -- Common Information Model (CIM) Fields
    -- Authentication Data Model
    user Nullable(String),                    -- Normalized username/user identity
    src_user Nullable(String),               -- Source user (for authentication events)
    dest_user Nullable(String),              -- Destination user (for authentication events)
    user_type Nullable(String),              -- User type: local, domain, service, etc.
    
    -- Network Traffic Data Model  
    dest_ip Nullable(String),                -- Destination IP address
    src_port Nullable(UInt16),               -- Source port number
    dest_port Nullable(UInt16),              -- Destination port number
    protocol Nullable(String),               -- Protocol (TCP, UDP, ICMP, etc.)
    bytes_in Nullable(UInt64),               -- Bytes received/inbound
    bytes_out Nullable(UInt64),              -- Bytes sent/outbound
    packets_in Nullable(UInt64),             -- Packets received/inbound
    packets_out Nullable(UInt64),            -- Packets sent/outbound
    duration Nullable(UInt32),               -- Connection/session duration in seconds
    transport Nullable(String),              -- Transport protocol details
    direction Nullable(String),              -- Traffic direction: inbound, outbound, lateral
    
    -- Endpoint Activity Data Model
    process_name Nullable(String),           -- Process/executable name
    parent_process Nullable(String),         -- Parent process name
    process_id Nullable(UInt32),             -- Process ID (PID)
    parent_process_id Nullable(UInt32),      -- Parent process ID (PPID)
    file_hash Nullable(String),              -- File hash (MD5, SHA1, SHA256)
    file_path Nullable(String),              -- Full file path
    file_name Nullable(String),              -- File name only
    file_size Nullable(UInt64),              -- File size in bytes
    command_line Nullable(String),           -- Full command line with arguments
    registry_key Nullable(String),           -- Registry key (Windows)
    registry_value Nullable(String),         -- Registry value (Windows)
    
    -- Web Traffic Data Model
    url Nullable(String),                    -- Full URL accessed
    uri_path Nullable(String),               -- URI path component
    uri_query Nullable(String),              -- URI query string
    http_method Nullable(String),            -- HTTP method (GET, POST, etc.)
    http_status_code Nullable(UInt16),       -- HTTP response status code
    http_user_agent Nullable(String),        -- User agent string
    http_referrer Nullable(String),          -- HTTP referrer
    http_content_type Nullable(String),      -- Content type
    http_content_length Nullable(UInt64),    -- Content length
    
    -- Device/Host Information
    src_host Nullable(String),               -- Source hostname
    dest_host Nullable(String),              -- Destination hostname
    device_type Nullable(String),            -- Device type: firewall, ids, endpoint, etc.
    vendor Nullable(String),                 -- Vendor name
    product Nullable(String),                -- Product name
    version Nullable(String),                -- Product version
    
    -- Geographic and Network Context
    src_country Nullable(String),            -- Source country
    dest_country Nullable(String),           -- Destination country
    src_zone Nullable(String),               -- Source network zone
    dest_zone Nullable(String),              -- Destination network zone
    interface_in Nullable(String),           -- Ingress interface
    interface_out Nullable(String),          -- Egress interface
    vlan_id Nullable(UInt16),                -- VLAN ID
    
    -- Security Context
    rule_id Nullable(String),                -- Security rule ID that triggered
    rule_name Nullable(String),              -- Security rule name
    policy_id Nullable(String),              -- Policy ID
    policy_name Nullable(String),            -- Policy name
    signature_id Nullable(String),           -- IDS/IPS signature ID
    signature_name Nullable(String),         -- IDS/IPS signature name
    threat_name Nullable(String),            -- Threat/malware name
    threat_category Nullable(String),        -- Threat category
    severity Nullable(String),               -- Event severity
    priority Nullable(String),               -- Event priority
    
    -- Authentication Specific
    auth_method Nullable(String),            -- Authentication method
    auth_app Nullable(String),               -- Authentication application
    failure_reason Nullable(String),         -- Authentication failure reason
    session_id Nullable(String),             -- Session identifier
    
    -- Application/Service Context
    app_name Nullable(String),               -- Application name
    app_category Nullable(String),           -- Application category
    service_name Nullable(String),           -- Service name
    
    -- Email/Communication (for email security events)
    email_sender Nullable(String),           -- Email sender
    email_recipient Nullable(String),        -- Email recipient
    email_subject Nullable(String),          -- Email subject
    
    -- Additional Context
    tags Nullable(String),                   -- Comma-separated tags
    message Nullable(String),                -- Human-readable message
    details Nullable(String),                -- Additional details in JSON format
    
    -- Custom Fields for Non-CIM Data
    custom_fields Map(String, String)       -- Arbitrary key-value pairs for non-standard fields
) ENGINE = MergeTree()
ORDER BY (tenant_id, event_timestamp);

-- Users table: Stores user accounts with tenant association
CREATE TABLE IF NOT EXISTS dev.users (
    user_id String,
    tenant_id String,
    email String,
    password_hash String,
    is_active UInt8 DEFAULT 1,
    created_at UInt32
) ENGINE = MergeTree()
ORDER BY (tenant_id, user_id);

-- Roles table: Defines available roles in the system
CREATE TABLE IF NOT EXISTS dev.roles (
    role_id String,
    role_name String,
    description String
) ENGINE = MergeTree()
ORDER BY role_id;

-- User roles table: Maps users to their roles (many-to-many relationship)
CREATE TABLE IF NOT EXISTS dev.user_roles (
    user_id String,
    tenant_id String,
    role_name String
) ENGINE = MergeTree()
ORDER BY (tenant_id, user_id);

-- Detection rules table: Stores custom detection rules per tenant
CREATE TABLE IF NOT EXISTS dev.rules (
    rule_id String,
    tenant_id String,
    rule_name String,
    rule_description String,
    rule_query String,
    is_active UInt8 DEFAULT 1,
    is_stateful UInt8 DEFAULT 0,
    stateful_config String DEFAULT '',
    engine_type String DEFAULT 'scheduled',
    created_at UInt32
) ENGINE = MergeTree()
ORDER BY (tenant_id, rule_id);

-- Alerts table: Stores triggered alerts from detection rules
CREATE TABLE IF NOT EXISTS dev.alerts (
    alert_id String,
    tenant_id String,
    rule_id String,
    rule_name String,
    event_id String,
    alert_timestamp UInt32,
    severity LowCardinality(String),
    status LowCardinality(String) DEFAULT 'open',
    created_at UInt32
) ENGINE = MergeTree()
ORDER BY (tenant_id, alert_timestamp);

-- Alert notes table: Stores notes and comments for alerts
CREATE TABLE IF NOT EXISTS dev.alert_notes (
    note_id String DEFAULT toString(generateUUIDv4()),
    alert_id String,
    tenant_id String,
    author String,
    content String,
    created_at UInt32 DEFAULT toUnixTimestamp(now())
) ENGINE = MergeTree()
ORDER BY (alert_id, created_at);

-- Cases table: Stores security investigation cases
CREATE TABLE IF NOT EXISTS dev.cases (
    case_id String DEFAULT toString(generateUUIDv4()),
    tenant_id String,
    title String,
    description String,
    priority String DEFAULT 'medium',
    status String DEFAULT 'open',
    assigned_to String DEFAULT '',
    created_by String,
    created_at UInt32 DEFAULT toUnixTimestamp(now()),
    updated_at UInt32 DEFAULT toUnixTimestamp(now()),
    tags Nullable(String),
    notes Nullable(String)
) ENGINE = MergeTree()
ORDER BY (tenant_id, created_at);

-- Case evidence table: Links alerts to cases (many-to-many relationship)
CREATE TABLE IF NOT EXISTS dev.case_evidence (
    case_id String,
    alert_id String,
    evidence_type String DEFAULT 'alert',
    added_by String,
    added_at UInt32 DEFAULT toUnixTimestamp(now())
) ENGINE = MergeTree()
ORDER BY case_id;

-- Tenants table: Stores tenant configurations for multi-tenancy
CREATE TABLE IF NOT EXISTS dev.tenants (
    tenant_id String,
    tenant_name String,
    status String DEFAULT 'active',
    is_active UInt8 DEFAULT 1,
    created_at UInt32
) ENGINE = MergeTree()
ORDER BY tenant_id;

-- Log sources table: Stores log source configurations for intelligent parsing
CREATE TABLE IF NOT EXISTS dev.log_sources (
    id String DEFAULT toString(generateUUIDv4()),  -- Primary key for log source
    source_id String,
    tenant_id String,
    source_name String,
    source_type String,
    source_ip String,
    created_at UInt32
) ENGINE = MergeTree()
ORDER BY (tenant_id, source_ip);

-- Taxonomy mappings table: Stores rules for mapping raw logs to common event taxonomy
CREATE TABLE IF NOT EXISTS dev.taxonomy_mappings (
    mapping_id String,
    tenant_id String,
    source_type String,
    field_to_check String,
    value_to_match String,
    event_category String,
    event_outcome String,
    event_action String,
    created_at UInt32
) ENGINE = MergeTree()
ORDER BY (tenant_id, source_type);

-- Assets table: Stores information about tenant assets for investigation context
CREATE TABLE IF NOT EXISTS dev.assets (
    asset_id String,
    tenant_id String,
    asset_name String,
    asset_ip String,
    asset_type String,
    criticality String,
    created_at UInt32,
    updated_at UInt32,
    agent_version Nullable(String),
    status Nullable(String),
    last_seen Nullable(UInt32),
    metrics_json Nullable(String),
    decommissioned UInt8 DEFAULT 0,
    policy_name Nullable(String),          -- Associated policy name
    os_type Nullable(String),
    os_version Nullable(String),
    architecture Nullable(String),
    tags Nullable(String)
) ENGINE = MergeTree()
ORDER BY (tenant_id, asset_ip);

-- Custom parsers table: Stores custom parsing rules for dynamic log parsing
CREATE TABLE IF NOT EXISTS dev.custom_parsers (
    parser_id String,
    tenant_id String,
    parser_name String,
    parser_type String,
    pattern String,
    created_at UInt32,
    updated_at UInt32
) ENGINE = MergeTree()
ORDER BY (tenant_id, parser_name);

-- Agent policies table: Stores agent configuration policies
CREATE TABLE IF NOT EXISTS dev.agent_policies (
    policy_id String,
    tenant_id String,
    policy_name String,
    config_json String,
    created_at UInt32,
    updated_at UInt32,
    asset_id Nullable(String)              -- Associated asset ID
) ENGINE = MergeTree()
ORDER BY (tenant_id, policy_id);

-- Agent assignments table: Maps policies to assets
CREATE TABLE IF NOT EXISTS dev.agent_assignments (
    asset_id String,
    policy_id String,
    created_at UInt32
) ENGINE = MergeTree()
ORDER BY asset_id;

-- Retention policies table: Stores data retention policies per tenant and source type
CREATE TABLE IF NOT EXISTS dev.retention_policies (
    policy_id String,
    tenant_id String,
    policy_name String,
    source_type_match String,
    retention_days UInt32,
    created_at UInt32,
    updated_at UInt32
) ENGINE = MergeTree()
ORDER BY (tenant_id, policy_id);

-- Audit log table: Stores audit trail for all administrative actions
CREATE TABLE IF NOT EXISTS dev.audit_logs (
    audit_id String,
    tenant_id String,
    user_id String,
    action String,
    details String,
    timestamp UInt32
) ENGINE = MergeTree()
ORDER BY (tenant_id, timestamp);

-- Threat intelligence table: Stores Indicators of Compromise (IOCs)
CREATE TABLE IF NOT EXISTS dev.threat_intel (
    ioc_id String,
    ioc_type LowCardinality(String),
    ioc_value String,
    ipv4 Nullable(String),
    source String,
    first_seen UInt32,
    created_at UInt32
) ENGINE = MergeTree()
ORDER BY (ioc_type, ioc_value);

-- Network flows table: Stores normalized network flow data from NetFlow/IPFIX collectors
CREATE TABLE IF NOT EXISTS dev.network_flows (
    flow_id String,
    tenant_id String,
    timestamp UInt32,
    source_ip String,
    destination_ip String,
    source_port UInt16,
    destination_port UInt16,
    protocol UInt8,
    bytes_in UInt64,
    bytes_out UInt64,
    packets_in UInt64,
    packets_out UInt64,
    collector_ip String,
    flow_start_time UInt32,
    flow_end_time UInt32,
    tcp_flags UInt8 DEFAULT 0,
    tos UInt8 DEFAULT 0,
    created_at UInt32
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(toDateTime(timestamp))
ORDER BY (tenant_id, timestamp, source_ip, destination_ip);

-- Insert default roles
INSERT INTO dev.roles (role_id, role_name, description) VALUES
('admin', 'Admin', 'Full system administration access'),
('analyst', 'Analyst', 'Security analysis and investigation'),
('viewer', 'Viewer', 'Read-only access to events and reports'),
('superadmin', 'SuperAdmin', 'Global system administration across tenants');

-- Insert default tenants
INSERT INTO dev.tenants (tenant_id, tenant_name, is_active, created_at) VALUES
('tenant-A', 'Organization A', 1, toUnixTimestamp(now())),
('tenant-B', 'Organization B', 1, toUnixTimestamp(now()));

-- Insert default users for testing
INSERT INTO dev.users (user_id, tenant_id, email, password_hash, is_active, created_at) VALUES
('alice', 'tenant-A', 'alice@orga.com', 'hashed_password_1', 1, toUnixTimestamp(now())),
('bob', 'tenant-A', 'bob@orga.com', 'hashed_password_2', 1, toUnixTimestamp(now())),
('charlie', 'tenant-A', 'charlie@orga.com', 'hashed_password_3', 1, toUnixTimestamp(now())),
('david', 'tenant-B', 'david@orgb.com', 'hashed_password_4', 1, toUnixTimestamp(now())),
('superadmin', 'global', 'admin@system.com', 'hashed_password_super', 1, toUnixTimestamp(now()));

-- Assign roles to users
INSERT INTO dev.user_roles (user_id, tenant_id, role_name) VALUES
('alice', 'tenant-A', 'Admin'),
('bob', 'tenant-A', 'Analyst'),
('charlie', 'tenant-A', 'Viewer'),
('david', 'tenant-B', 'Admin'),
('superadmin', 'global', 'SuperAdmin');

-- Cloud API Sources table: Stores configurations for cloud API polling
CREATE TABLE IF NOT EXISTS dev.cloud_api_sources (
    source_id String,
    tenant_id String,
    platform LowCardinality(String),        -- 'Microsoft365', 'AzureAD', 'GCP', 'AWS', etc.
    source_name String,                     -- Human-readable name for the source
    api_credentials String,                 -- Encrypted credentials blob
    polling_interval_minutes UInt16 DEFAULT 15,  -- How often to poll (in minutes)
    last_polled_timestamp UInt32 DEFAULT 0, -- Unix timestamp of last successful poll
    is_enabled UInt8 DEFAULT 1,            -- Enable/disable polling for this source
    created_at UInt32,
    updated_at UInt32,
    error_count UInt32 DEFAULT 0,          -- Track consecutive errors
    last_error String DEFAULT '',          -- Last error message if any
    next_poll_time UInt32 DEFAULT 0        -- Next scheduled poll time
) ENGINE = MergeTree()
ORDER BY (tenant_id, platform, source_id);

-- Agent updates table: Stores available agent updates for auto-update functionality
CREATE TABLE IF NOT EXISTS dev.agent_updates (
    update_id String,
    version String,                        -- Version string (e.g., "1.2.3")
    supported_os LowCardinality(String),   -- "windows", "linux", "macos"
    supported_arch LowCardinality(String), -- "x86_64", "aarch64"
    download_url String,                   -- URL to download the update
    checksum String,                       -- SHA256 checksum for verification
    release_notes String DEFAULT '',       -- Optional release notes
    is_enabled UInt8 DEFAULT 1,           -- Enable/disable this update
    release_date UInt32,                   -- Release timestamp
    created_at UInt32
) ENGINE = MergeTree()
ORDER BY (supported_os, supported_arch, release_date);

-- Behavioral baselines table: Stores UEBA behavioral baselines for users and entities
CREATE TABLE IF NOT EXISTS dev.behavioral_baselines (
    baseline_id String,                    -- UUID for the baseline record
    tenant_id String,                      -- Tenant isolation
    entity_id String,                      -- Username, IP, hostname, etc.
    entity_type LowCardinality(String),    -- "user", "server", "workstation", etc.
    metric String,                         -- Behavior metric name
    baseline_value_avg Float64,            -- Average value of the behavior
    baseline_value_stddev Float64,         -- Standard deviation of the behavior
    sample_count UInt32,                   -- Number of data points used for calculation
    calculation_period_days UInt32,        -- Period used for calculation (e.g., 30 days)
    confidence_score Float64,              -- Confidence in the baseline (0.0-1.0)
    last_updated UInt32,                   -- Unix timestamp of last update
    created_at UInt32                      -- Unix timestamp of creation
) ENGINE = MergeTree()
PARTITION BY (tenant_id, entity_type)
ORDER BY (tenant_id, entity_type, entity_id, metric);

-- UEBA anomalies table: Stores detected behavioral anomalies
CREATE TABLE IF NOT EXISTS dev.ueba_anomalies (
    anomaly_id String,                     -- UUID for the anomaly
    tenant_id String,                      -- Tenant isolation
    entity_id String,                      -- Entity that exhibited anomalous behavior
    entity_type LowCardinality(String),    -- Type of entity
    metric String,                         -- Behavior metric that was anomalous
    baseline_value Float64,                -- Expected baseline value
    observed_value Float64,                -- Actual observed value
    deviation_score Float64,               -- Standard deviations from baseline
    severity LowCardinality(String),       -- "Low", "Medium", "High", "Critical"
    detection_timestamp UInt32,            -- When the anomaly was detected
    related_events Array(String),          -- Event IDs that contributed to anomaly
    status LowCardinality(String) DEFAULT 'open', -- "open", "investigating", "closed"
    created_at UInt32
) ENGINE = MergeTree()
PARTITION BY (tenant_id, toYYYYMM(toDateTime(detection_timestamp)))
ORDER BY (tenant_id, detection_timestamp, entity_id);

-- Create optimization settings
OPTIMIZE TABLE dev.events;
OPTIMIZE TABLE dev.users;
OPTIMIZE TABLE dev.roles;
OPTIMIZE TABLE dev.user_roles;
OPTIMIZE TABLE dev.rules;
OPTIMIZE TABLE dev.alerts;
OPTIMIZE TABLE dev.cases;
OPTIMIZE TABLE dev.case_evidence;
OPTIMIZE TABLE dev.tenants;
OPTIMIZE TABLE dev.log_sources;
OPTIMIZE TABLE dev.taxonomy_mappings;
OPTIMIZE TABLE dev.assets;
OPTIMIZE TABLE dev.custom_parsers;
OPTIMIZE TABLE dev.agent_policies;
OPTIMIZE TABLE dev.agent_assignments;
OPTIMIZE TABLE dev.retention_policies;
OPTIMIZE TABLE dev.audit_logs;
OPTIMIZE TABLE dev.threat_intel;
OPTIMIZE TABLE dev.cloud_api_sources;
OPTIMIZE TABLE dev.agent_updates;
OPTIMIZE TABLE dev.behavioral_baselines;
OPTIMIZE TABLE dev.ueba_anomalies;