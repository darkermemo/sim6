# SIEM ClickHouse Search Service

A high-performance search service for SIEM log data using ClickHouse as the backend database.

## Features

- **High Performance**: Optimized for handling millions of log events with sub-second query response times
- **Advanced Search**: Support for complex queries, filters, aggregations, and full-text search
- **Security**: Multi-tenant isolation, JWT authentication, rate limiting, and audit logging
- **Scalability**: Connection pooling, query optimization, and horizontal scaling support
- **Monitoring**: Prometheus metrics, health checks, and performance tracking
- **Caching**: Redis-based result caching for improved performance

## Prerequisites

### System Requirements
- Rust 1.75 or later
- ClickHouse Server 23.0 or later
- Redis Server 6.0 or later
- 4GB+ RAM (8GB+ recommended for production)
- SSD storage for optimal performance

### Installing Dependencies

#### macOS (using Homebrew)
```bash
# Install ClickHouse
brew install clickhouse

# Install Redis
brew install redis

# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

#### Ubuntu/Debian
```bash
# Install ClickHouse
sudo apt-get install -y apt-transport-https ca-certificates dirmngr
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 8919F6BD2B48D754
echo "deb https://packages.clickhouse.com/deb stable main" | sudo tee /etc/apt/sources.list.d/clickhouse.list
sudo apt-get update
sudo apt-get install -y clickhouse-server clickhouse-client

# Install Redis
sudo apt-get install -y redis-server

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

#### CentOS/RHEL
```bash
# Install ClickHouse
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://packages.clickhouse.com/rpm/clickhouse.repo
sudo yum install -y clickhouse-server clickhouse-client

# Install Redis
sudo yum install -y redis

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

## Quick Start

### 1. Start Required Services

#### Start ClickHouse
```bash
# macOS
brew services start clickhouse

# Linux (systemd)
sudo systemctl start clickhouse-server
sudo systemctl enable clickhouse-server

# Manual start
sudo -u clickhouse clickhouse-server --config-file=/etc/clickhouse-server/config.xml
```

#### Start Redis
```bash
# macOS
brew services start redis

# Linux (systemd)
sudo systemctl start redis
sudo systemctl enable redis

# Manual start
redis-server
```

### 2. Configure ClickHouse

Create the SIEM database and user:

```bash
# Connect to ClickHouse
clickhouse-client
```

```sql
-- Create database
CREATE DATABASE IF NOT EXISTS siem;

-- Create user (replace with secure password)
CREATE USER IF NOT EXISTS siem_user IDENTIFIED BY 'secure_password_here';
GRANT ALL ON siem.* TO siem_user;

-- Use the database
USE siem;

-- Create the events table
CREATE TABLE IF NOT EXISTS events (
    event_id String,
    event_timestamp DateTime64(3),
    tenant_id String,
    event_category String,
    event_action String,
    event_outcome Nullable(String),
    source_ip Nullable(String),
    destination_ip Nullable(String),
    user_id Nullable(String),
    user_name Nullable(String),
    severity Nullable(String),
    message Nullable(String),
    raw_event String,
    metadata String,
    created_at DateTime64(3) DEFAULT now64()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_timestamp)
ORDER BY (tenant_id, event_timestamp, event_category)
SETTINGS index_granularity = 8192;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_source_ip ON events (source_ip) TYPE bloom_filter GRANULARITY 1;
CREATE INDEX IF NOT EXISTS idx_destination_ip ON events (destination_ip) TYPE bloom_filter GRANULARITY 1;
CREATE INDEX IF NOT EXISTS idx_user_id ON events (user_id) TYPE bloom_filter GRANULARITY 1;
CREATE INDEX IF NOT EXISTS idx_event_action ON events (event_action) TYPE bloom_filter GRANULARITY 1;

-- Create materialized view for aggregations
CREATE MATERIALIZED VIEW IF NOT EXISTS events_hourly_stats
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (tenant_id, hour, event_category, event_outcome)
AS SELECT
    tenant_id,
    toStartOfHour(event_timestamp) as hour,
    event_category,
    event_outcome,
    count() as event_count
FROM events
GROUP BY tenant_id, hour, event_category, event_outcome;
```

### 3. Build and Run the Service

```bash
# Navigate to the service directory
cd siem_clickhouse_search

# Build the service
cargo build --release

# Copy and configure the service
cp config.toml.example config.toml

# Edit configuration (update database credentials, etc.)
vim config.toml

# Run the service
cargo run --release
```

### 4. Verify Installation

```bash
# Check service health
curl http://localhost:8080/health

# Check service status
curl http://localhost:8080/status

# Test search (requires authentication)
curl -X POST http://localhost:8080/api/v1/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "query": "event_category:security",
    "time_range": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-12-31T23:59:59Z"
    },
    "pagination": {
      "offset": 0,
      "limit": 10
    }
  }'
```

## Configuration

### Environment Variables

Key environment variables you can set:

```bash
# Database
export CLICKHOUSE_URL="http://localhost:8123"
export CLICKHOUSE_USERNAME="siem_user"
export CLICKHOUSE_PASSWORD="secure_password_here"
export CLICKHOUSE_DATABASE="siem"

# Redis
export REDIS_URL="redis://localhost:6379"

# Security
export JWT_SECRET="your-super-secret-jwt-key-here"
export RATE_LIMIT_REQUESTS_PER_MINUTE="1000"

# Server
export SERVER_HOST="0.0.0.0"
export SERVER_PORT="8080"
```

### Configuration File

Edit `config.toml` to customize:

- Database connection settings
- Security and authentication
- Performance tuning
- Caching behavior
- Monitoring settings

## API Documentation

### Authentication

All API endpoints require JWT authentication:

```bash
Authorization: Bearer <your-jwt-token>
```

### Search Endpoints

#### POST /api/v1/search
Perform advanced search with filters, aggregations, and sorting.

#### GET /api/v1/search
Simple search with query parameters.

#### GET /api/v1/search/suggestions
Get search suggestions and auto-completion.

### Management Endpoints

#### GET /health
Health check endpoint.

#### GET /status
Detailed service status.

#### GET /metrics
Prometheus metrics.

#### GET /api/v1/schema
Get database schema information.

## Performance Tuning

### ClickHouse Optimization

1. **Memory Settings** (in `/etc/clickhouse-server/config.xml`):
```xml
<max_memory_usage>8000000000</max_memory_usage>
<max_bytes_before_external_group_by>4000000000</max_bytes_before_external_group_by>
```

2. **Storage Configuration**:
```xml
<storage_configuration>
    <disks>
        <default>
            <path>/var/lib/clickhouse/</path>
        </default>
        <ssd>
            <path>/ssd/clickhouse/</path>
        </ssd>
    </disks>
</storage_configuration>
```

3. **Query Performance**:
- Use appropriate partition keys
- Create proper indexes
- Optimize ORDER BY clauses
- Use materialized views for aggregations

### Service Configuration

Optimize `config.toml` settings:

```toml
[database.pool]
max_size = 20
min_idle = 5
max_lifetime_seconds = 3600

[search.performance]
max_concurrent_queries = 10
query_timeout_seconds = 60
max_result_size = 10000

[cache]
enable = true
ttl_seconds = 300
max_size_mb = 512
```

## Monitoring

### Prometheus Metrics

The service exposes metrics at `/metrics`:

- `clickhouse_queries_total` - Total number of queries
- `clickhouse_query_duration_seconds` - Query execution time
- `clickhouse_cache_hits_total` - Cache hit count
- `clickhouse_errors_total` - Error count

### Health Checks

- `/health` - Basic health check
- `/status` - Detailed status with dependencies

### Logging

Logs are structured JSON format. Configure log level:

```bash
export RUST_LOG="info,siem_clickhouse_search=debug"
```

## Security

### JWT Configuration

1. Generate a secure JWT secret:
```bash
openssl rand -base64 32
```

2. Configure token validation:
```toml
[security.jwt]
secret = "your-generated-secret"
expiration_hours = 24
issuer = "siem-search-service"
```

### Rate Limiting

Configure per-tenant rate limits:

```toml
[security.rate_limiting]
enable = true
requests_per_minute = 1000
burst_size = 100
```

### Audit Logging

Enable audit logging for compliance:

```toml
[security.audit]
enable = true
log_file = "/var/log/siem-search-audit.log"
log_level = "info"
```

## Development

### Running Tests

```bash
# Unit tests
cargo test

# Integration tests (requires running ClickHouse and Redis)
cargo test --features integration

# Load tests
cargo test --release load_test
```

### Development Mode

```bash
# Run with auto-reload
cargo watch -x run

# Run with debug logging
RUST_LOG=debug cargo run
```

### Code Quality

```bash
# Format code
cargo fmt

# Lint code
cargo clippy

# Security audit
cargo audit
```

## Production Deployment

### System Service

Create a systemd service file `/etc/systemd/system/siem-clickhouse-search.service`:

```ini
[Unit]
Description=SIEM ClickHouse Search Service
After=network.target clickhouse-server.service redis.service
Requires=clickhouse-server.service redis.service

[Service]
Type=simple
User=siem
Group=siem
WorkingDirectory=/opt/siem-clickhouse-search
ExecStart=/opt/siem-clickhouse-search/target/release/siem_clickhouse_search
Restart=always
RestartSec=5
Environment=RUST_LOG=info
EnvironmentFile=/etc/siem-clickhouse-search/environment

[Install]
WantedBy=multi-user.target
```

### Process Management

```bash
# Enable and start service
sudo systemctl enable siem-clickhouse-search
sudo systemctl start siem-clickhouse-search

# Check status
sudo systemctl status siem-clickhouse-search

# View logs
sudo journalctl -u siem-clickhouse-search -f
```

### Backup and Recovery

1. **ClickHouse Backup**:
```bash
# Create backup
clickhouse-backup create

# Restore backup
clickhouse-backup restore <backup-name>
```

2. **Configuration Backup**:
```bash
# Backup configuration
cp -r /etc/siem-clickhouse-search /backup/config/
```

## Troubleshooting

### Common Issues

1. **Connection Refused**:
   - Check if ClickHouse and Redis are running
   - Verify connection settings in config.toml
   - Check firewall settings

2. **Slow Queries**:
   - Review query patterns
   - Check ClickHouse system.query_log
   - Optimize table structure and indexes

3. **Memory Issues**:
   - Increase ClickHouse memory limits
   - Reduce query result size limits
   - Enable query result streaming

4. **Authentication Errors**:
   - Verify JWT secret configuration
   - Check token expiration
   - Review audit logs

### Debug Mode

```bash
# Enable debug logging
RUST_LOG=debug cargo run

# Enable ClickHouse query logging
echo "SET send_logs_level = 'debug'" | clickhouse-client
```

### Performance Analysis

```bash
# Check ClickHouse performance
clickhouse-client --query="SELECT * FROM system.query_log ORDER BY event_time DESC LIMIT 10"

# Monitor resource usage
top -p $(pgrep siem_clickhouse_search)
```

## Support

For issues and questions:

1. Check the troubleshooting section
2. Review logs for error messages
3. Verify configuration settings
4. Test with minimal data set

## License

This project is licensed under the MIT License.