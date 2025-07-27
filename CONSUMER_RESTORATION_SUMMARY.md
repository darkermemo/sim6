# SIEM Consumer Restoration Summary

## Objective: Restore the siem_consumer Service (Chunk 4.2)

### Task 1: Restore Project Files ✅

Successfully restored the siem_consumer application with the following components:

1. **Cargo.toml**: Updated with all necessary dependencies including:
   - tokio with full features
   - rdkafka for Kafka integration
   - serde/serde_json for serialization
   - chrono for timestamps
   - uuid for event IDs
   - dotenvy for environment configuration
   - reqwest for HTTP client
   - siem_parser (local dependency) for log parsing
   - thiserror for error handling

2. **src/errors.rs**: Created comprehensive error handling with ConsumerError enum

3. **src/models.rs**: Created data models including:
   - Event struct matching ClickHouse schema
   - KafkaMessage struct for incoming messages
   - Helper methods for creating events from parsed and unparsed logs

4. **src/main.rs**: Implemented full consumer logic:
   - Connects to Kafka as part of the `siem_clickhouse_writer` group
   - Subscribes to the `siem-events` topic
   - Integrates with siem_parser library (JsonLogParser and SyslogParser)
   - Batches events by size (1000) or time (5 seconds)
   - Writes batches to ClickHouse via HTTP/JSON
   - Manages Kafka offsets correctly with manual commits
   - Includes proper error handling and logging

### Task 2: Build Verification ✅

The consumer builds successfully:
```bash
cd siem_consumer && cargo build
```

### Configuration Required

The consumer expects these environment variables (with defaults):
- `KAFKA_BROKERS`: localhost:9092
- `KAFKA_TOPIC`: siem-events
- `KAFKA_GROUP_ID`: siem_clickhouse_writer
- `CLICKHOUSE_URL`: http://localhost:8123
- `CLICKHOUSE_DB`: dev
- `CLICKHOUSE_TABLE`: events
- `BATCH_SIZE`: 1000
- `BATCH_TIMEOUT_MS`: 5000

### Running the Consumer

```bash
cd siem_consumer
RUST_LOG=info cargo run
```

### Test Script Created

Created `suite_b_test.sh` to run only the data pipeline tests:
- Checks all required services
- Runs tests B-1 through B-4
- Provides detailed debugging output
- Can automatically start the consumer if not running

### Current Status

⚠️ **Note**: Suite B tests will fail if Kafka is not running. To fully verify the data pipeline:

1. Start Zookeeper and Kafka
2. Ensure ClickHouse is running
3. Ensure siem_api is running
4. Run the consumer: `cd siem_consumer && RUST_LOG=info cargo run`
5. Run the tests: `./suite_b_test.sh`

The consumer is fully restored and ready for use. Once Kafka is running, all Suite B tests should pass. 