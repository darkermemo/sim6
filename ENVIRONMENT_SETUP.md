# SIEM System Environment Setup Guide

This guide explains how to configure the environment variables for the SIEM system.

## Quick Start

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit the `.env` file with your specific configuration:
   ```bash
   nano .env  # or use your preferred editor
   ```

3. Update the security-related variables (see [Security Configuration](#security-configuration))

## Environment Files

- **`.env`** - Your local environment configuration (not committed to git)
- **`.env.example`** - Template file showing all available options
- **`.gitignore`** - Ensures `.env` files are not committed to version control

## Core Configuration Sections

### Database Configuration

#### ClickHouse (Primary Data Store)
```bash
CLICKHOUSE_URL=http://localhost:8123          # HTTP interface
CLICKHOUSE_TCP_URL=tcp://localhost:9000/default  # Native TCP interface
CLICKHOUSE_DATABASE=dev                       # Database name
CLICKHOUSE_USER=default                       # Username
CLICKHOUSE_PASSWORD=                          # Password (empty for default)
```

#### PostgreSQL (Metadata Store)
```bash
DATABASE_URL=postgres://clickvisual:clickvisual@localhost:5432/clickvisual
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=clickvisual
POSTGRES_PASSWORD=clickvisual
POSTGRES_DB=clickvisual
```

### API Configuration

```bash
API_URL=http://localhost:8080                 # Main API endpoint
API_PORT=8080                                 # API server port
INGESTOR_URL=http://localhost:8081           # Data ingestor endpoint
INGESTOR_PORT=8081                           # Ingestor port
```

### Security Configuration

⚠️ **IMPORTANT**: Change these values in production!

```bash
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRATION_HOURS=24

# Admin Access
ADMIN_TOKEN=admin-token-12345-change-in-production
ADMIN_TOKEN_DURATION_HOURS=1

# Agent Authentication
AGENT_API_KEY=agent-api-key-12345-change-in-production

# Session Management
SESSION_SECRET=your-session-secret-change-in-production
SESSION_TIMEOUT_MINUTES=60
```

### Kafka Configuration

```bash
KAFKA_BROKERS=localhost:9092
KAFKA_BOOTSTRAP_SERVERS=localhost:9092

# Topics
KAFKA_EVENTS_TOPIC=siem_events
KAFKA_ALERTS_TOPIC=siem_alerts
KAFKA_LOGS_TOPIC=siem_logs

# Consumer Groups
KAFKA_CONSUMER_GROUP=siem_clickhouse_writer
KAFKA_CONSUMER_GROUP_ALERTS=siem_alert_processor
```

### UI Configuration

```bash
VITE_PORT=3001                               # UI development server port
VITE_API_BASE=http://localhost:8080          # API base URL for UI
```

## Environment-Specific Configurations

### Development Environment

```bash
ENVIRONMENT=development
DEBUG=true
RUST_LOG=info
ENABLE_TLS=false
DRY_RUN=false
```

### Production Environment

```bash
ENVIRONMENT=production
DEBUG=false
RUST_LOG=warn
ENABLE_TLS=true
DRY_RUN=false

# Use strong, randomly generated secrets
JWT_SECRET=<strong-random-secret>
ADMIN_TOKEN=<strong-random-token>
AGENT_API_KEY=<strong-random-key>
SESSION_SECRET=<strong-random-secret>

# Restrict CORS to your domain
CORS_ALLOWED_ORIGINS=https://yourdomain.com

# Enable SSL/TLS
SSL_CERT_PATH=/opt/siem/certs/server.crt
SSL_KEY_PATH=/opt/siem/certs/server.key
```

## Service Dependencies

Before starting the SIEM system, ensure these services are running:

### Required Services

1. **ClickHouse** (ports 8123, 9000)
   ```bash
   # Check if ClickHouse is running
   curl http://localhost:8123/ping
   ```

2. **PostgreSQL** (port 5432)
   ```bash
   # Check if PostgreSQL is running
   pg_isready -h localhost -p 5432
   ```

3. **Kafka** (port 9092)
   ```bash
   # Check if Kafka is running
   nc -zv localhost 9092
   ```

### Optional Services

4. **Redis** (port 6379) - for caching
   ```bash
   redis-cli ping
   ```

5. **Prometheus** (port 9090) - for monitoring
6. **Grafana** (port 3000) - for dashboards

## Port Configuration

| Service | Default Port | Environment Variable | Description |
|---------|--------------|---------------------|-------------|
| API Server | 8080 | `API_PORT` | Main REST API |
| Ingestor | 8081 | `INGESTOR_PORT` | Data ingestion service |
| UI Dev Server | 3001 | `VITE_PORT` | React development server |
| ClickHouse HTTP | 8123 | - | ClickHouse HTTP interface |
| ClickHouse TCP | 9000 | - | ClickHouse native protocol |
| PostgreSQL | 5432 | `POSTGRES_PORT` | Metadata database |
| Kafka | 9092 | - | Message broker |
| Redis | 6379 | - | Cache (optional) |
| Prometheus | 9090 | `PROMETHEUS_PORT` | Metrics (optional) |
| Grafana | 3000 | `GRAFANA_PORT` | Dashboards (optional) |

## Validation

After configuring your environment, validate the setup:

```bash
# Check environment variables are loaded
echo $API_URL
echo $CLICKHOUSE_URL
echo $KAFKA_BROKERS

# Test database connections
curl $CLICKHOUSE_URL/ping
psql $DATABASE_URL -c "SELECT 1;"

# Test API endpoints
curl $API_URL/health
curl $INGESTOR_URL/health
```

## Troubleshooting

### Common Issues

1. **Service Connection Errors**
   - Verify services are running on expected ports
   - Check firewall settings
   - Validate connection strings

2. **Authentication Failures**
   - Ensure JWT_SECRET is consistent across services
   - Verify ADMIN_TOKEN is correctly set
   - Check token expiration settings

3. **Database Connection Issues**
   - Verify database credentials
   - Check database exists and is accessible
   - Ensure proper network connectivity

4. **Kafka Connection Problems**
   - Verify Kafka brokers are running
   - Check topic existence
   - Validate consumer group permissions

### Debug Commands

```bash
# Check all environment variables
env | grep -E '(CLICKHOUSE|KAFKA|API|JWT|ADMIN)'

# Test service connectivity
telnet localhost 8080  # API
telnet localhost 8081  # Ingestor
telnet localhost 8123  # ClickHouse HTTP
telnet localhost 9092  # Kafka

# Check service logs
tail -f api.log
tail -f ingestor.log
tail -f consumer.log
```

## Security Best Practices

1. **Never commit `.env` files** - They're already in `.gitignore`
2. **Use strong, unique secrets** for production
3. **Rotate credentials regularly**
4. **Enable TLS in production** (`ENABLE_TLS=true`)
5. **Restrict CORS origins** to your actual domains
6. **Use environment-specific configurations**
7. **Consider using a secrets management system** for production

## Additional Resources

- [Deployment Guide](DEPLOYMENT_MODE.md)
- [Production Guide](PRODUCTION_GUIDE.md)
- [High Availability Setup](HA_DEPLOYMENT_GUIDE.md)
- [Disaster Recovery](DR_RUNBOOK.md)