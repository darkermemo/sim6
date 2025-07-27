# Phase 10.1: Stateful Rule Engine Implementation Summary

## Objective Achieved ✅
Successfully implemented a stateful rule engine that supports attack sequence detection over time using Redis for state management.

## Key Features Implemented

### 1. Database Schema Updates ✅
- **Location**: `database_setup.sql` (lines 147-154)
- **Changes**: Added `is_stateful` and `stateful_config` columns to `dev.rules` table
```sql
CREATE TABLE IF NOT EXISTS dev.rules (
    rule_id String,
    tenant_id String,
    rule_name String,
    rule_description String,
    rule_query String,
    is_active UInt8 DEFAULT 1,
    is_stateful UInt8 DEFAULT 0,        -- ✅ NEW
    stateful_config String DEFAULT '',  -- ✅ NEW
    created_at UInt32
) ENGINE = MergeTree()
ORDER BY (tenant_id, rule_id);
```

### 2. API Models Updated ✅
- **Location**: `siem_api/src/models.rs` & `siem_api/src/rule_handlers.rs`
- **Features**:
  - `StatefulConfig` struct with configurable parameters
  - Updated `Rule` struct with stateful fields
  - API endpoints support stateful rule creation

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StatefulConfig {
    pub key_prefix: String,        // Redis key prefix
    pub aggregate_on: Vec<String>, // Fields to aggregate on
    pub threshold: u32,            // Count threshold
    pub window_seconds: u32,       // Time window
}
```

### 3. Redis Integration ✅
- **Dependency**: Redis crate with async support in `siem_rule_engine/Cargo.toml`
- **Connection**: Automatic Redis connection with health checking
- **Operations**: INCR, EXPIRE, DEL commands for state management

### 4. Stateful Rule Engine Logic ✅
- **Location**: `siem_rule_engine/src/main.rs`
- **Key Features**:

#### Dynamic Key Construction
```rust
fn build_redis_key(&self, config: &StatefulConfig, tenant_id: &str, event_data: &serde_json::Value) -> String {
    let mut key = config.key_prefix.clone();
    key.push(':');
    key.push_str(tenant_id);
    
    // Add values from aggregate_on fields
    for field in &config.aggregate_on {
        key.push(':');
        if let Some(value) = event_data.get(field).and_then(|v| v.as_str()) {
            key.push_str(value);
        } else {
            key.push_str("unknown");
        }
    }
    
    key
}
```

#### Stateful Processing Logic
1. **Rule Detection**: Checks `is_stateful == 1` for stateful rules
2. **Configuration Parsing**: Deserializes `stateful_config` JSON
3. **Event Processing**: For each matching event:
   - Constructs dynamic Redis key based on aggregation fields
   - Increments counter with `INCR`
   - Sets expiry on first increment with `EXPIRE`
   - Checks if threshold exceeded
   - Generates alert if threshold breached
   - Deletes key after alert to reset

#### Alert Generation
```rust
if current_count > config.threshold as i32 {
    // Create alert
    let alert = Alert { /* ... */ };
    alerts.push(alert);
    
    // Reset counter after alert
    let _: Option<i32> = conn.del(&redis_key)?;
}
```

## Verification and Testing

### 1. Manual Redis Tests ✅
- **Script**: `manual_stateful_test.sh`
- **Results**: All Redis operations working correctly
- **Features Tested**:
  - Key increment and expiry
  - Threshold detection
  - Key isolation by IP
  - Automatic cleanup

### 2. Direct Database Tests ✅
- **Script**: `test_stateful_rule_direct.sh`
- **Results**: End-to-end stateful rule processing verified
- **Features Tested**:
  - Rule creation with stateful config
  - Event processing and Redis state tracking
  - Threshold-based alert generation

### 3. Comprehensive Test Suite ✅
- **Script**: `test_stateful_rule_engine_comprehensive.sh`
- **Coverage**: Full API and rule engine integration testing

## Example Stateful Rule Configuration

### Brute Force Detection Rule
```json
{
    "rule_name": "Stateful Brute Force Detection",
    "description": "Detects brute force attacks using stateful tracking",
    "query": "SELECT source_ip, event_id, raw_event FROM dev.events WHERE event_outcome = 'Failure' AND tenant_id = 'tenant-A'",
    "is_stateful": 1,
    "stateful_config": {
        "key_prefix": "brute_force",
        "aggregate_on": ["source_ip"],
        "threshold": 5,
        "window_seconds": 600
    }
}
```

### Generated Redis Key Structure
```
brute_force:tenant-A:192.168.1.100
```

## Redis Operations Flow

1. **Event Matches Rule**: SQL query returns events
2. **Key Construction**: `{key_prefix}:{tenant_id}:{aggregation_values}`
3. **Counter Increment**: `INCR key` (atomic operation)
4. **Expiry Setting**: `EXPIRE key window_seconds` (on first increment)
5. **Threshold Check**: If count > threshold, generate alert
6. **Cleanup**: `DEL key` after alert to reset counter

## Performance Features

### Efficient State Management
- **Atomic Operations**: Uses Redis INCR for thread-safe counting
- **Automatic Expiry**: Keys auto-expire after time window
- **Memory Efficient**: Only active attack patterns consume memory
- **Scalable**: Supports multiple tenants and attack types

### Rule Engine Optimization
- **Separate Processing**: Stateful vs stateless rule paths
- **Configurable Intervals**: Rule engine runs every 2 minutes (configurable)
- **Error Handling**: Continues processing other rules if one fails

## Production Readiness

### Monitoring and Logging
- **Redis Health**: Connection monitoring with reconnection
- **Rule Execution**: Detailed logging of rule processing
- **Alert Generation**: Comprehensive alert metadata
- **State Tracking**: Redis key TTL and value monitoring

### Security Features
- **Tenant Isolation**: Keys include tenant_id for separation
- **Input Validation**: JSON config validation and sanitization
- **Resource Limits**: Configurable time windows prevent memory leaks

## System Integration

### Components Working Together
1. **SIEM API**: Creates and manages stateful rules
2. **Rule Engine**: Processes rules and maintains Redis state
3. **Redis**: Provides distributed state storage
4. **ClickHouse**: Stores events, rules, and generated alerts

### Data Flow
```
Events → ClickHouse → Rule Engine → Redis (state) → Alerts → ClickHouse
```

## Success Metrics ✅

- ✅ **Redis Integration**: Successfully connected and operational
- ✅ **Stateful Rules**: Can create rules with configurable thresholds
- ✅ **Dynamic Keys**: Proper key construction based on event fields
- ✅ **Threshold Detection**: Accurate counting and alert generation
- ✅ **Time Windows**: Automatic expiry and cleanup working
- ✅ **Multi-Tenant**: Proper tenant isolation in Redis keys
- ✅ **Alert Generation**: Alerts created when thresholds exceeded
- ✅ **State Reset**: Keys properly deleted after alerts

## Example Use Cases Now Supported

1. **Brute Force Detection**: 5+ failed logins from same IP in 10 minutes
2. **Suspicious File Access**: 10+ file access attempts in 5 minutes
3. **Network Scanning**: 20+ port connections from same source in 1 minute
4. **Failed Authentication Patterns**: Cross-service authentication failures

## Future Enhancements Possible

- **Complex Aggregations**: Multi-field aggregation keys
- **Sliding Windows**: More sophisticated time window logic
- **Threshold Decay**: Gradual threshold reduction over time
- **Cross-Tenant Patterns**: Global attack pattern detection

---

**Phase 10.1 Status**: ✅ **COMPLETE**

The stateful rule engine is fully implemented and operational, providing the SIEM with advanced attack sequence detection capabilities using Redis for distributed state management. 