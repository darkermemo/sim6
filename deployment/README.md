# SIEM System Deployment

This directory contains all the necessary files to deploy the SIEM system as production system services, independent of the IDE.

## Overview

The deployment package converts the SIEM services from development mode (IDE terminals with `cargo run`) to production system services using systemd.

## Services

The following services will be deployed:

1. **siem-api** - Main REST API service
2. **siem-consumer** - Event consumer (Kafka → ClickHouse)
3. **siem-schema-validator** - Schema validation service
4. **siem-ui** - Frontend web interface

## Directory Structure

```
deployment/
├── README.md                 # This file
├── systemd/                  # Systemd service files
│   ├── siem-api.service
│   ├── siem-consumer.service
│   ├── siem-schema-validator.service
│   └── siem-ui.service
├── config/                   # Configuration templates
│   ├── siem.env             # Environment variables
│   └── siem.conf            # Service configuration
├── scripts/                  # Deployment and management scripts
│   ├── build.sh             # Build release binaries
│   ├── install.sh           # Install services
│   ├── uninstall.sh         # Remove services
│   ├── start-services.sh    # Start all services
│   ├── stop-services.sh     # Stop all services
│   └── status.sh            # Check service status
└── bin/                      # Compiled binaries (created during build)
    ├── siem_api
    ├── siem_consumer
    └── siem_schema_validator
```

## Quick Start

1. **Build the services:**
   ```bash
   cd deployment
   sudo ./scripts/build.sh
   ```

2. **Install the services:**
   ```bash
   sudo ./scripts/install.sh
   ```

3. **Start all services:**
   ```bash
   sudo ./scripts/start-services.sh
   ```

4. **Check status:**
   ```bash
   ./scripts/status.sh
   ```

5. **Stop services (when needed):**
   ```bash
   sudo ./scripts/stop-services.sh
   ```

## Configuration

Edit `config/siem.env` to customize:
- Database URLs
- Kafka brokers
- Service ports
- Log levels

## Service Management

### Management Scripts

The deployment includes convenient management scripts:

```bash
# Start all services in correct order
sudo ./scripts/start-services.sh

# Stop all services
sudo ./scripts/stop-services.sh

# Force stop services (if needed)
sudo ./scripts/stop-services.sh --force

# Stop and disable services
sudo ./scripts/stop-services.sh --disable

# Check comprehensive status
./scripts/status.sh

# Check specific components
./scripts/status.sh services    # Service details only
./scripts/status.sh api         # API health checks
./scripts/status.sh ui          # UI status
./scripts/status.sh logs        # Recent logs
./scripts/status.sh resources   # System resources
```

### Manual systemctl Commands

You can also manage services individually:

```bash
# Start/stop individual services
sudo systemctl start siem-api
sudo systemctl stop siem-consumer

# Enable/disable auto-start on boot
sudo systemctl enable siem-api
sudo systemctl disable siem-ui

# View logs
journalctl -u siem-api -f
journalctl -u siem-consumer --since "1 hour ago"

# Check status
systemctl status siem-*
```

## Security

- Services run as dedicated `siem` user (not root)
- Binaries installed in `/opt/siem/bin/`
- Configuration in `/etc/siem/`
- Logs in `/var/log/siem/`
- Data in `/var/lib/siem/`

## Troubleshooting

1. **Service fails to start:**
   ```bash
   journalctl -u <service-name> -n 50
   ```

2. **Check dependencies:**
   ```bash
   systemctl list-dependencies siem-api
   ```

3. **Verify configuration:**
   ```bash
   sudo -u siem /opt/siem/bin/siem_api --help
   ```

## Uninstall

To remove all services and return to development mode:

```bash
sudo ./scripts/uninstall.sh
```

This will stop and disable all services, remove systemd files, but preserve configuration and data.