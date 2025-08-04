# SIEM Development Guide

This guide provides everything you need to get the SIEM system running in development mode.

## Quick Start

```bash
# Clone and enter the project
cd /path/to/siem

# Start the entire system
./bin/dev-up

# If you see ✅, everything is working!
```

## What `bin/dev-up` Does

The `dev-up` script implements a **fail-fast** approach:

1. **Configuration Verification** - Validates all environment variables and config files
2. **Dependency Checking** - Ensures Rust, Node.js, and system tools are available
3. **Rust Verification** - Runs `cargo check`, `clippy`, and tests on all components
4. **Service Startup** - Starts all SIEM services in the correct order
5. **Integration Testing** - Verifies end-to-end functionality

If any step fails, the process stops immediately with a clear error message.

## System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   SIEM UI       │    │   SIEM API      │    │  ClickHouse     │
│   (React)       │◄──►│   (Rust)        │◄──►│  (Database)     │
│   Port: 3004    │    │   Port: 8080    │    │   Port: 8123    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐              │
         │              │  CH Ingestor    │              │
         └──────────────►│  (Rust)         │──────────────┘
                        │  Port: 8081     │
                        └─────────────────┘
                                 │
                        ┌─────────────────┐
                        │ Unified Pipeline│
                        │ (Rust)          │
                        │ Port: 8082      │
                        └─────────────────┘
```

## Components

### Core Services

- **SIEM API** (`siem_api`) - Main REST API server
- **ClickHouse Ingestor** (`siem_clickhouse_ingestion`) - Event ingestion service
- **Unified Pipeline** (`siem_unified_pipeline`) - Data processing pipeline
- **SIEM UI** (`siem_ui`) - React-based web interface

### Supporting Services

- **Consumer** (`siem_consumer`) - Kafka message consumer
- **Backup Manager** (`siem_backup_manager`) - Data backup service
- **Data Pruner** (`siem_data_pruner`) - Data lifecycle management
- **Threat Intel** (`siem_threat_intel`) - Threat intelligence integration
- **Search** (`siem_clickhouse_search`) - Advanced search capabilities

## Configuration

### Environment Files

- `config/dev.env` - Development configuration template
- `.env` - Active configuration (auto-created from dev.env)
- `config/required-vars.txt` - List of mandatory environment variables

### Key Configuration Variables

```bash
# Core System
PROJECT_ROOT=/path/to/siem
ENVIRONMENT=development

# Services
API_PORT=8080
INGESTOR_PORT=8081
PIPELINE_PORT=8082
UI_PORT=3004

# Database
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_DATABASE=dev

# Authentication (Development only!)
JWT_SECRET=dev-jwt-secret-key-change-in-production
ADMIN_TOKEN=dev-admin-token-12345-change-in-production
```

## Development Workflow

### Starting Development

```bash
# Full system startup with verification
make dev-up

# Quick start (skip some checks)
make quick-start

# Start individual components
make start-services
```

### During Development

```bash
# Check system status
make status

# View logs
make logs

# Run tests only
make test

# Verify Rust code
make verify-rust
```

### Stopping and Cleanup

```bash
# Stop all services
make stop

# Clean and reset
make clean

# Full reset (stops services, cleans logs, resets state)
make dev-reset
```

## Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Check what's using the port
lsof -i :8080

# Kill the process
kill <PID>

# Or use the reset command
make dev-reset
```

#### ClickHouse Not Running
```bash
# Start ClickHouse with Docker
docker run -d --name clickhouse-server \
  -p 8123:8123 -p 9000:9000 \
  clickhouse/clickhouse-server

# Or install locally (macOS)
brew install clickhouse
clickhouse-server
```

#### Missing Dependencies
```bash
# Check what's missing
make verify-deps

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Node.js
brew install node  # macOS
# or download from https://nodejs.org/
```

#### Configuration Issues
```bash
# Verify configuration
make verify-config

# Reset to defaults
cp config/dev.env .env
```

### Log Files

All logs are stored in `logs/` directory:

- `logs/api.log` - SIEM API logs
- `logs/ingestor.log` - ClickHouse Ingestor logs
- `logs/pipeline.log` - Unified Pipeline logs
- `logs/ui.log` - UI development server logs
- `logs/integration_report.txt` - Latest integration test results

### Service URLs

After successful startup:

- **SIEM UI**: http://localhost:3004
- **SIEM API**: http://localhost:8080
- **API Documentation**: http://localhost:8080/docs
- **ClickHouse Ingestor**: http://localhost:8081
- **Unified Pipeline**: http://localhost:8082
- **ClickHouse**: http://localhost:8123

## Development Tips

### Code Quality

```bash
# Run all Rust checks
cargo check --workspace
cargo clippy --workspace -- -D warnings
cargo test --workspace
cargo fmt --all

# Security audit
cargo audit
```

### Database Development

```bash
# Connect to ClickHouse
clickhouse-client

# Check tables
SHOW TABLES FROM dev;

# Query events
SELECT * FROM dev.events LIMIT 10;
```

### API Testing

```bash
# Health check
curl http://localhost:8080/health

# Dashboard data
curl http://localhost:8080/api/v1/dashboard

# Search events
curl "http://localhost:8080/api/v1/search?query=test"
```

### UI Development

```bash
# Start UI in development mode
cd siem_ui
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## Make Targets Reference

| Target | Description |
|--------|-------------|
| `dev-up` | Full development startup with verification |
| `quick-start` | Fast startup, minimal checks |
| `clean` | Clean logs and temporary files |
| `verify-config` | Validate configuration |
| `verify-deps` | Check system dependencies |
| `verify-rust` | Verify all Rust components |
| `start-services` | Start all SIEM services |
| `verify-integration` | Test end-to-end functionality |
| `test` | Run all tests |
| `status` | Show service status |
| `stop` | Stop all services |
| `logs` | Show recent logs |
| `dev-reset` | Full cleanup and reset |
| `help` | Show all available targets |

## Contributing

1. **Before making changes**: Run `make dev-up` to ensure everything works
2. **During development**: Use `make verify-rust` to check your code
3. **Before committing**: Run `make test` to ensure tests pass
4. **For new features**: Add appropriate tests and documentation

## Security Notes

⚠️ **Development Configuration Warning**

The development configuration includes default secrets and tokens that are **NOT SECURE**:

- `JWT_SECRET=dev-jwt-secret-key-change-in-production`
- `ADMIN_TOKEN=dev-admin-token-12345-change-in-production`

These are fine for development but **MUST** be changed for production deployment.

## Next Steps

- Read [ARCHITECTURE.md](docs/ARCHITECTURE.md) for system design details
- Check [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for common issues
- Review component-specific README files in each service directory