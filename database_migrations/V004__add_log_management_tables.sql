-- V004: Log Management and Parsing tables
-- Creates log_sources, taxonomy_mappings, assets, and custom_parsers tables

-- Log sources table: Stores log source configurations for intelligent parsing
CREATE TABLE IF NOT EXISTS dev.log_sources (
    source_id String,
    tenant_id String,
    source_name String,
    source_type String,
    source_ip String,
    created_at UInt32
) ENGINE = MergeTree()
ORDER BY (tenant_id, source_ip);

-- Taxonomy mappings table: Stores rules for mapping raw logs to common event taxonomy
-- This is the CORRECT schema that matches the application code
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
    updated_at UInt32
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