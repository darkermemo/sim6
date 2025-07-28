# SIEM System Management Guide

> 📖 **Deployment Mode**: This system runs in Docker-free mode. See [DEPLOYMENT_MODE.md](./DEPLOYMENT_MODE.md) for architecture details.

## Quick Start

### Start the entire SIEM system:
```bash
./start_siem_system.sh
```

### Monitor and auto-restart services:
```bash
./monitor_and_restart.sh &
```

### Check system health:
```bash
./system_health_check.sh
```

### Generate fresh JWT token:
```bash
./generate_fresh_token.sh
```

## Service URLs

- **SIEM UI**: http://localhost:3004/
- **SIEM API**: http://localhost:8080/
- **ClickHouse**: http://localhost:8123/
- **Kafka**: localhost:9092

## Components

### Core Services
1. **Kafka** - Message broker for event streaming
2. **ClickHouse** - Database for event storage
3. **SIEM Ingestor** - Receives and processes incoming events
4. **SIEM Consumer** - Consumes events from Kafka and stores in ClickHouse
5. **SIEM API** - REST API for event queries and management
6. **SIEM UI** - Web interface for viewing and analyzing events

### Management Scripts
- `start_siem_system.sh` - Starts all services in correct order
- `monitor_and_restart.sh` - Monitors services and restarts if they crash
- `system_health_check.sh` - Checks status of all components
- `generate_fresh_token.sh` - Generates new JWT tokens

## Troubleshooting

### Common Issues

1. **UI shows authentication errors**
   - Run: `./generate_fresh_token.sh`
   - Refresh browser

2. **Services not starting**
   - Check if Kafka and ClickHouse are running
   - Run: `./start_siem_system.sh`

3. **Connection lost errors**
   - Run: `./monitor_and_restart.sh &` to enable auto-restart
   - Check logs in `/Users/yasseralmohammed/sim6/logs/`

4. **No recent events**
   - Check if SIEM Consumer is running
   - Verify Kafka has messages: `kafka-console-consumer --bootstrap-server localhost:9092 --topic ingest-events --from-beginning --max-messages 5`

### Log Files
- SIEM API: `/Users/yasseralmohammed/sim6/logs/siem_api.log`
- SIEM Consumer: `/Users/yasseralmohammed/sim6/logs/siem_consumer.log`
- SIEM Ingestor: `/Users/yasseralmohammed/sim6/logs/siem_ingestor.log`
- SIEM UI: `/Users/yasseralmohammed/sim6/logs/siem_ui.log`
- Monitor: `/Users/yasseralmohammed/sim6/monitor.log`
- Startup: `/Users/yasseralmohammed/sim6/startup.log`

## Permanent Uptime Setup

1. Start the monitoring service:
   ```bash
   cd /Users/yasseralmohammed/sim6
   ./monitor_and_restart.sh &
   ```

2. The monitor will:
   - Check all services every 30 seconds
   - Automatically restart crashed services
   - Refresh JWT tokens hourly
   - Log all activities

3. To stop monitoring:
   ```bash
   kill $(cat /Users/yasseralmohammed/sim6/monitor.pid)
   ```

## Security Notes

- JWT tokens expire after 1 hour
- The system automatically refreshes tokens when monitoring is enabled
- Default credentials are for development only
- All services run on localhost for security

## Performance

- The system processes events in real-time
- ClickHouse provides fast analytical queries
- Kafka ensures reliable message delivery
- Auto-restart prevents service downtime