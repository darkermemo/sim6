# 🚨 IMMEDIATE ACTION PLAN - Fix 99.94% Data Loss

## Priority Order (Do These NOW)

### 1️⃣ **[CRITICAL] Apply Schema Fix - Stop Data Loss**

**Time Required**: 15 minutes

```bash
# Step 1: Backup current consumer
cp siem_consumer/src/models.rs siem_consumer/src/models.rs.backup

# Step 2: Apply the fix (choose one):

# Option A: Quick fix - Add default to timestamp field
# Edit siem_consumer/src/models.rs line 122-123:
#[serde(alias = "timestamp", default = "default_timestamp")]
pub event_timestamp: u32,

# Option B: Debug first - Add to process_message function:
error!("Payload sample: {}", &payload_str[..500.min(payload_str.len())]);

# Step 3: Rebuild and restart
cd siem_consumer
cargo build --release
systemctl restart siem-consumer  # or your restart command

# Step 4: Verify fix is working
curl -s localhost:3001/metrics | jq .
# Watch for PARSED to increase
```

### 2️⃣ **[URGENT] Security Fix - h2 Vulnerability**

**Time Required**: 5 minutes

```bash
# Run the security fix script
chmod +x security_fix_h2.sh
./security_fix_h2.sh

# Or manually:
cargo update -p h2
cargo audit
```

### 3️⃣ **[HIGH] Implement Dead Letter Queue**

**Time Required**: 30 minutes

```bash
# Step 1: Create DLQ topic in Kafka
kafka-topics --create \
  --bootstrap-server localhost:9092 \
  --topic dead-letter-queue \
  --partitions 3 \
  --replication-factor 1

# Step 2: Add DLQ code to consumer
# Copy the dead_letter_queue_implementation.rs code

# Step 3: Update main.rs to use DLQ
# Initialize DLQ in main()
let dlq = DeadLetterQueue::new(&config.kafka_brokers, "dead-letter-queue")?;

# Step 4: Restart consumer
cargo build --release && restart
```

## Monitoring Commands

### Real-time Success Rate
```bash
# Run continuous monitoring
python3 siem_metrics_monitor.py --continuous 5

# Or one-shot check
watch -n 1 'curl -s localhost:3001/metrics | jq .'
```

### Check ClickHouse Data
```bash
# Verify events are being written
clickhouse client --query "
  SELECT 
    count() as total,
    max(event_timestamp) as latest_event,
    now() - toDateTime(max(event_timestamp)) as seconds_behind
  FROM dev.events
  WHERE event_timestamp > now() - INTERVAL 1 HOUR
"
```

### Monitor Consumer Logs
```bash
# Watch for errors
journalctl -u siem-consumer -f | grep -E "(ERROR|WARN|Successfully)"

# Or if using file logs
tail -f /var/log/siem-consumer.log | grep -E "(Failed to deserialize|Successfully parsed)"
```

## Quick Validation

After applying fixes, you should see:

✅ **PARSED** metric increasing (target: >99% of PROCESSED)
✅ **Success Rate** > 99% (was 0.06%)
✅ **No more** "Failed to deserialize" errors in logs
✅ **ClickHouse** receiving steady stream of events

## If Schema Fix Doesn't Work

1. **Dump actual message format**:
```bash
kafkacat -C -b localhost:9092 -t ingest-events -c 1 | jq .
```

2. **Compare with expected format**:
```rust
// Expected
{
  "event_id": "...",
  "tenant_id": "...",
  "event_timestamp": 1234567890,  // or "timestamp"
  "source_ip": "...",
  "raw_event": "..."
}
```

3. **Apply emergency fix**:
```rust
// In process_message, replace strict parsing:
let json: serde_json::Value = serde_json::from_str(payload_str)?;
let kafka_msg = KafkaMessage {
    event_id: json["event_id"].as_str().unwrap_or("unknown").to_string(),
    tenant_id: json["tenant_id"].as_str().unwrap_or("unknown").to_string(),
    event_timestamp: json.get("timestamp")
        .or(json.get("event_timestamp"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32,
    // ... other fields
};
```

## Success Criteria

You'll know it's fixed when:

| Metric | Before | After |
|--------|--------|-------|
| Success Rate | 0.06% | >99% |
| PARSED/hr | ~50 | >50,000 |
| Errors in logs | Constant | Rare |
| DLQ messages | N/A | <1% |

## Next Steps (After Fix)

1. Set up alerts for success rate < 95%
2. Create Grafana dashboard for metrics
3. Implement schema evolution strategy
4. Add integration tests with various message formats
5. Document the message format for producers

---

**Remember**: The system is working correctly except for the schema mismatch. Once you fix that, everything else should flow smoothly!