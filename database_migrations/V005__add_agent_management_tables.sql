-- V005: Agent Management and Policy tables
-- Creates agent_policies, agent_assignments, retention_policies, and agent_updates tables

-- Agent policies table: Stores agent configuration policies
CREATE TABLE IF NOT EXISTS dev.agent_policies (
    policy_id String,
    tenant_id String,
    policy_name String,
    config_json String,
    created_at UInt32,
    updated_at UInt32
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