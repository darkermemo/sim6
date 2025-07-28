# Deployment Mode: Docker-Free

This SIEM system is designed to run in a **Docker-free environment** with all services compiled and executed as native system processes.

## Architecture Overview

- **No Docker, Docker Compose, or container runtime is used**
- All services are compiled and run as native Linux/macOS binaries
- ClickHouse, ingestion server, rule engine, and UI run as native system processes
- Services communicate directly via localhost networking

## Service Components

### Native Processes
- **ClickHouse**: Native daemon process (`clickhouse server --daemon`)
- **Ingestion Server**: Rust binary (`./target/release/ingestion_server`)
- **SIEM API**: Rust binary (`cargo run --release` in `siem_api/`)
- **SIEM Consumer**: Rust binary (`cargo run --release` in `siem_consumer/`)
- **SIEM Ingestor**: Rust binary (`cargo run --release` in `siem_ingestor/`)
- **SIEM UI**: Node.js development server (`npm run dev` in `siem_ui/`)
- **Kafka**: Native Java process

### Process Management
- Services are started via shell scripts (`start_siem_system.sh`)
- Process monitoring via `monitor_and_restart.sh`
- Health checks via `system_health_check.sh`
- All processes run in background with `nohup`

## Benefits of Docker-Free Deployment

1. **Performance**: No container overhead
2. **Simplicity**: Direct process management
3. **Resource Efficiency**: Lower memory and CPU usage
4. **Development Speed**: Faster compilation and startup times
5. **Debugging**: Direct access to processes and logs

## Service Discovery

- **ClickHouse**: `localhost:8123` (HTTP), `localhost:9000` (Native)
- **SIEM API**: `localhost:8080`
- **SIEM UI**: `localhost:3004`
- **Kafka**: `localhost:9092`
- **Ingestion Server**: `localhost:8080/ingest/<tenant>`

## Startup Sequence

1. Verify Kafka is running
2. Verify ClickHouse is running
3. Start SIEM Ingestor
4. Start SIEM Consumer
5. Start SIEM API
6. Start SIEM UI
7. Generate JWT tokens
8. Run health checks

## Monitoring

The system includes comprehensive monitoring without Docker dependencies:

- Process status checks via `pgrep`
- Service connectivity tests via `curl`
- Automatic restart capabilities
- Log aggregation in `/Users/yasseralmohammed/sim6/logs/`

## Docker References

While Docker configurations exist in the codebase for alternative deployment scenarios (HA, DR), the current operational mode is **Docker-free**. Any Docker-related warnings can be safely ignored as they are not required for normal operation.

## Troubleshooting

If you see Docker-related warnings:
- These are expected and can be ignored
- The system is designed to work without Docker
- All functionality is available through native processes

For service issues, use:
```bash
./system_health_check.sh    # Check all services
./monitor_and_restart.sh &   # Auto-restart failed services
```