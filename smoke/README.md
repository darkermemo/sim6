# SIEM Pipeline Smoke Test

This is an end-to-end smoke test that validates the entire SIEM pipeline:

```
Kafka → siem_consumer → ClickHouse → siem_api → /api/v1/events/search
```

## What it tests

1. **Infrastructure readiness**: ClickHouse and Kafka health checks
2. **Event ingestion**: Produces a test event to Kafka
3. **Data processing**: Verifies `siem_consumer` writes to ClickHouse
4. **API functionality**: Confirms `siem_api` can query and return events

## Prerequisites

- Docker and Docker Compose
- Rust toolchain
- The `siem_consumer` and `siem_api` binaries built

## Quick start

```bash
# From project root
./scripts/run-smoke-test.sh
```

## Manual execution

```bash
# 1. Start services
docker-compose -f scripts/docker-test.yml up -d

# 2. Run smoke test
cd smoke
cargo run

# 3. Cleanup
docker-compose -f scripts/docker-test.yml down
```

## Test flow

1. Sets environment variables for ClickHouse and Kafka
2. Waits for ClickHouse (`http://localhost:8123/ping`) and Kafka readiness
3. Spawns `siem_consumer` and `siem_api` as child processes
4. Produces a JSON event with unique `event_id` to Kafka topic `siem_events`
5. Polls ClickHouse `dev.events` table until the event appears
6. Queries `/api/v1/events/search` API and verifies the event is returned
7. Terminates child processes

## Configuration

- **ClickHouse**: `localhost:8123`, database `dev`, table `dev.events`
- **Kafka**: `localhost:9092`, topic `siem_events`
- **API**: `localhost:3000`

## Expected output

```
✅ pipeline smoke test passed
```

If any step fails, the test will exit with an error message indicating where the pipeline broke.