DROP TABLE IF EXISTS dev.events;

CREATE TABLE IF NOT EXISTS dev.events (
    event_id String,
    tenant_id String, 
    event_timestamp UInt32,
    source_ip String,
    source_type LowCardinality(String),
    raw_event String,
    event_category LowCardinality(String),
    event_outcome LowCardinality(String),
    event_action LowCardinality(String),
    is_threat UInt8 DEFAULT 0,
    
    -- Common Information Model (CIM) Fields
    -- Authentication Data Model
    user Nullable(String),
    src_user Nullable(String),
    dest_user Nullable(String),
    user_type Nullable(String),
    
    -- Network Traffic Data Model  
    dest_ip Nullable(String),
    src_port Nullable(UInt16),
    dest_port Nullable(UInt16),
    protocol Nullable(String),
    bytes_in Nullable(UInt64),
    bytes_out Nullable(UInt64),
    packets_in Nullable(UInt64),
    packets_out Nullable(UInt64),
    duration Nullable(UInt32),
    transport Nullable(String),
    direction Nullable(String),
    
    -- Endpoint Activity Data Model
    process_name Nullable(String),
    parent_process Nullable(String),
    process_id Nullable(UInt32),
    parent_process_id Nullable(UInt32),
    file_hash Nullable(String),
    file_path Nullable(String),
    file_name Nullable(String),
    file_size Nullable(UInt64),
    command_line Nullable(String),
    registry_key Nullable(String),
    registry_value Nullable(String),
    
    -- Web Traffic Data Model
    url Nullable(String),
    uri_path Nullable(String),
    uri_query Nullable(String),
    http_method Nullable(String),
    http_status_code Nullable(UInt16),
    http_user_agent Nullable(String),
    http_referrer Nullable(String),
    http_content_type Nullable(String),
    http_content_length Nullable(UInt64),
    
    -- Device/Host Information
    src_host Nullable(String),
    dest_host Nullable(String),
    device_type Nullable(String),
    vendor Nullable(String),
    product Nullable(String),
    version Nullable(String),
    
    -- Geographic and Network Context
    src_country Nullable(String),
    dest_country Nullable(String),
    src_zone Nullable(String),
    dest_zone Nullable(String),
    interface_in Nullable(String),
    interface_out Nullable(String),
    vlan_id Nullable(UInt16),
    
    -- Security Context
    rule_id Nullable(String),
    rule_name Nullable(String),
    policy_id Nullable(String),
    policy_name Nullable(String),
    signature_id Nullable(String),
    signature_name Nullable(String),
    threat_name Nullable(String),
    threat_category Nullable(String),
    severity Nullable(String),
    priority Nullable(String),
    
    -- Authentication Specific
    auth_method Nullable(String),
    auth_app Nullable(String),
    failure_reason Nullable(String),
    session_id Nullable(String),
    
    -- Application/Service Context
    app_name Nullable(String),
    app_category Nullable(String),
    service_name Nullable(String),
    
    -- Email/Communication
    email_sender Nullable(String),
    email_recipient Nullable(String),
    email_subject Nullable(String),
    
    -- Additional Context
    tags Nullable(String),
    message Nullable(String),
    details Nullable(String),
    
    -- Custom Fields
    custom_fields Map(String, String)
) ENGINE = MergeTree()
ORDER BY (tenant_id, event_timestamp);