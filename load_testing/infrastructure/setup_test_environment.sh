#!/bin/bash

# SIEM Load Testing Environment Setup Script
# Sets up the 5-node dedicated VM environment for production-scale load testing
# This script must be run on each VM with the appropriate node type

set -euo pipefail

# Configuration
NODE_TYPE="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/siem_setup.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging function
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        INFO)  echo -e "${BLUE}[INFO]${NC}  ${timestamp} - $message" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC}  ${timestamp} - $message" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} ${timestamp} - $message" ;;
        SUCCESS) echo -e "${GREEN}[SUCCESS]${NC} ${timestamp} - $message" ;;
    esac
    
    echo "${timestamp} [${level}] $message" | sudo tee -a "$LOG_FILE" >/dev/null
}

# Validate environment
validate_environment() {
    log INFO "Validating environment for node type: $NODE_TYPE"
    
    # Check if running as root or with sudo
    if [[ $EUID -ne 0 ]]; then
        log ERROR "This script must be run as root or with sudo"
        exit 1
    fi
    
    # Check VM specifications
    CPU_COUNT=$(nproc)
    MEMORY_GB=$(free -g | awk '/^Mem:/{print $2}')
    
    case $NODE_TYPE in
        "clickhouse")
            MIN_CPU=8; MIN_MEMORY=32 ;;
        "siem-api"|"siem-consumer"|"siem-ingestor"|"kafka"|"load-generator")
            MIN_CPU=4; MIN_MEMORY=16 ;;
        *)
            log ERROR "Invalid node type: $NODE_TYPE"
            log INFO "Valid types: clickhouse, siem-api, siem-consumer, siem-ingestor, kafka, load-generator"
            exit 1 ;;
    esac
    
    if [[ $CPU_COUNT -lt $MIN_CPU ]]; then
        log WARN "CPU count ($CPU_COUNT) is below recommended minimum ($MIN_CPU) for $NODE_TYPE"
    fi
    
    if [[ $MEMORY_GB -lt $MIN_MEMORY ]]; then
        log WARN "Memory ($MEMORY_GB GB) is below recommended minimum ($MIN_MEMORY GB) for $NODE_TYPE"
    fi
    
    log SUCCESS "Environment validation completed"
}

# Install common dependencies
install_common_dependencies() {
    log INFO "Installing common dependencies..."
    
    # Update system
    apt-get update && apt-get upgrade -y
    
    # Install essential packages
    apt-get install -y \
        curl \
        wget \
        git \
        build-essential \
        pkg-config \
        libssl-dev \
        htop \
        iotop \
        netstat-ss \
        tcpdump \
        jq \
        netcat-openbsd \
        prometheus-node-exporter \
        systemd \
        rsyslog
    
    # Install Rust (required for SIEM services)
    if ! command -v rustc >/dev/null; then
        log INFO "Installing Rust..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source ~/.cargo/env
        echo 'source ~/.cargo/env' >> ~/.bashrc
    fi
    
    # Start node exporter for monitoring
    systemctl enable prometheus-node-exporter
    systemctl start prometheus-node-exporter
    
    log SUCCESS "Common dependencies installed"
}

# Setup ClickHouse node
setup_clickhouse_node() {
    log INFO "Setting up ClickHouse database node..."
    
    # Install ClickHouse
    curl -fsSL 'https://packages.clickhouse.com/rpm/lts/repodata/repomd.xml.key' | gpg --dearmor -o /usr/share/keyrings/clickhouse-keyring.gpg
    echo "deb [signed-by=/usr/share/keyrings/clickhouse-keyring.gpg] https://packages.clickhouse.com/deb stable main" | tee /etc/apt/sources.list.d/clickhouse.list
    apt-get update
    
    # Install ClickHouse server
    DEBIAN_FRONTEND=noninteractive apt-get install -y clickhouse-server clickhouse-client
    
    # Configure ClickHouse for performance
    cat > /etc/clickhouse-server/config.d/performance.xml << 'EOF'
<clickhouse>
    <max_connections>4096</max_connections>
    <keep_alive_timeout>3</keep_alive_timeout>
    <max_concurrent_queries>1000</max_concurrent_queries>
    <uncompressed_cache_size>8589934592</uncompressed_cache_size>
    <mark_cache_size>5368709120</mark_cache_size>
    <max_table_size_to_drop>0</max_table_size_to_drop>
    <max_partition_size_to_drop>0</max_partition_size_to_drop>
    
    <!-- Performance settings for load testing -->
    <profiles>
        <load_test>
            <max_memory_usage>20000000000</max_memory_usage>
            <use_uncompressed_cache>1</use_uncompressed_cache>
            <load_balancing>random</load_balancing>
            <max_execution_time>300</max_execution_time>
        </load_test>
    </profiles>
    
    <!-- Network settings -->
    <listen_host>0.0.0.0</listen_host>
    <http_port>8123</http_port>
    <tcp_port>9000</tcp_port>
</clickhouse>
EOF

    # Start ClickHouse
    systemctl enable clickhouse-server
    systemctl start clickhouse-server
    
    # Wait for ClickHouse to start
    sleep 10
    
    # Initialize database
    if [[ -f "${SCRIPT_DIR}/../../database_setup.sql" ]]; then
        log INFO "Initializing SIEM database schema..."
        clickhouse client --multiquery < "${SCRIPT_DIR}/../../database_setup.sql"
    fi
    
    log SUCCESS "ClickHouse node setup completed"
}

# Setup Kafka node
setup_kafka_node() {
    log INFO "Setting up Kafka messaging node..."
    
    # Install Java (required for Kafka)
    apt-get install -y openjdk-11-jdk
    
    # Download and install Kafka
    KAFKA_VERSION="2.13-3.5.0"
    cd /opt
    wget "https://downloads.apache.org/kafka/3.5.0/kafka_${KAFKA_VERSION}.tgz"
    tar -xzf "kafka_${KAFKA_VERSION}.tgz"
    mv "kafka_${KAFKA_VERSION}" kafka
    chown -R kafka:kafka /opt/kafka
    
    # Create kafka user
    useradd -r -s /bin/false kafka || true
    
    # Configure Kafka for high performance
    cat > /opt/kafka/config/server.properties << 'EOF'
broker.id=1
listeners=PLAINTEXT://0.0.0.0:9092
advertised.listeners=PLAINTEXT://KAFKA_NODE_IP:9092
num.network.threads=8
num.io.threads=16
socket.send.buffer.bytes=102400
socket.receive.buffer.bytes=102400
socket.request.max.bytes=104857600
log.dirs=/opt/kafka/kafka-logs
num.partitions=8
num.recovery.threads.per.data.dir=2
offsets.topic.replication.factor=1
transaction.state.log.replication.factor=1
transaction.state.log.min.isr=1
log.retention.hours=24
log.retention.bytes=10737418240
log.segment.bytes=1073741824
log.retention.check.interval.ms=300000
zookeeper.connect=localhost:2181
zookeeper.connection.timeout.ms=18000
group.initial.rebalance.delay.ms=0
EOF

    # Replace KAFKA_NODE_IP with actual IP
    KAFKA_IP=$(hostname -I | awk '{print $1}')
    sed -i "s/KAFKA_NODE_IP/$KAFKA_IP/g" /opt/kafka/config/server.properties
    
    # Create systemd services
    cat > /etc/systemd/system/zookeeper.service << 'EOF'
[Unit]
Description=Apache Zookeeper
Requires=network.target remote-fs.target
After=network.target remote-fs.target

[Service]
Type=simple
User=kafka
ExecStart=/opt/kafka/bin/zookeeper-server-start.sh /opt/kafka/config/zookeeper.properties
ExecStop=/opt/kafka/bin/zookeeper-server-stop.sh
Restart=on-abnormal

[Install]
WantedBy=multi-user.target
EOF

    cat > /etc/systemd/system/kafka.service << 'EOF'
[Unit]
Description=Apache Kafka
Requires=zookeeper.service
After=zookeeper.service

[Service]
Type=simple
User=kafka
ExecStart=/opt/kafka/bin/kafka-server-start.sh /opt/kafka/config/server.properties
ExecStop=/opt/kafka/bin/kafka-server-stop.sh
Restart=on-abnormal

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable zookeeper kafka
    systemctl start zookeeper
    sleep 10
    systemctl start kafka
    
    # Create the ingest-events topic
    sleep 15
    /opt/kafka/bin/kafka-topics.sh --create --topic ingest-events --bootstrap-server localhost:9092 --partitions 8 --replication-factor 1
    
    log SUCCESS "Kafka node setup completed"
}

# Setup SIEM service node (API, Consumer, Ingestor)
setup_siem_service_node() {
    local service_type=$1
    log INFO "Setting up SIEM $service_type service node..."
    
    # Install Redis (used by rule engine)
    if [[ "$service_type" == "rule-engine" ]]; then
        apt-get install -y redis-server
        systemctl enable redis-server
        systemctl start redis-server
    fi
    
    # Clone SIEM repository (if not already present)
    if [[ ! -d "/opt/siem" ]]; then
        git clone https://github.com/your-org/siem.git /opt/siem || {
            log WARN "Git clone failed, assuming source code is already present"
            mkdir -p /opt/siem
            cp -r "${SCRIPT_DIR}/../../" /opt/siem/
        }
    fi
    
    cd "/opt/siem/siem_${service_type}"
    
    # Build the service
    log INFO "Building SIEM $service_type service..."
    cargo build --release
    
    # Create systemd service
    cat > "/etc/systemd/system/siem-${service_type}.service" << EOF
[Unit]
Description=SIEM ${service_type} Service
After=network.target

[Service]
Type=simple
User=siem
WorkingDirectory=/opt/siem/siem_${service_type}
ExecStart=/opt/siem/siem_${service_type}/target/release/siem_${service_type}
Restart=always
RestartSec=10

# Environment variables
Environment=RUST_LOG=info
Environment=DATABASE_URL=http://CLICKHOUSE_IP:8123
Environment=KAFKA_BROKERS=KAFKA_IP:9092
Environment=KAFKA_TOPIC=ingest-events

[Install]
WantedBy=multi-user.target
EOF

    # Create siem user
    useradd -r -s /bin/false siem || true
    chown -R siem:siem /opt/siem
    
    systemctl daemon-reload
    systemctl enable "siem-${service_type}"
    
    log SUCCESS "SIEM $service_type service node setup completed"
}

# Setup load generator node
setup_load_generator_node() {
    log INFO "Setting up load generator node..."
    
    # Install k6
    curl -s https://dl.k6.io/key.gpg | apt-key add -
    echo "deb https://dl.k6.io/deb stable main" | tee /etc/apt/sources.list.d/k6.list
    apt-get update
    apt-get install -y k6
    
    # Install Prometheus
    PROMETHEUS_VERSION="2.45.0"
    cd /opt
    wget "https://github.com/prometheus/prometheus/releases/download/v${PROMETHEUS_VERSION}/prometheus-${PROMETHEUS_VERSION}.linux-amd64.tar.gz"
    tar -xzf "prometheus-${PROMETHEUS_VERSION}.linux-amd64.tar.gz"
    mv "prometheus-${PROMETHEUS_VERSION}.linux-amd64" prometheus
    
    # Install Grafana
    wget -q -O - https://packages.grafana.com/gpg.key | apt-key add -
    echo "deb https://packages.grafana.com/oss/deb stable main" | tee /etc/apt/sources.list.d/grafana.list
    apt-get update
    apt-get install -y grafana
    
    # Copy load testing scripts
    mkdir -p /opt/load-testing
    cp -r "${SCRIPT_DIR}/../" /opt/load-testing/
    
    # Create systemd services for monitoring
    cat > /etc/systemd/system/prometheus.service << 'EOF'
[Unit]
Description=Prometheus
After=network.target

[Service]
Type=simple
User=prometheus
ExecStart=/opt/prometheus/prometheus --config.file=/opt/load-testing/monitoring/prometheus_config.yml --storage.tsdb.path=/var/lib/prometheus/
Restart=always

[Install]
WantedBy=multi-user.target
EOF

    # Create prometheus user
    useradd -r -s /bin/false prometheus || true
    mkdir -p /var/lib/prometheus
    chown -R prometheus:prometheus /opt/prometheus /var/lib/prometheus
    
    systemctl daemon-reload
    systemctl enable prometheus grafana-server
    systemctl start grafana-server
    
    log SUCCESS "Load generator node setup completed"
}

# Update IP addresses in configuration files
update_ip_addresses() {
    log INFO "Updating IP addresses in configuration files..."
    
    # Get node IPs (these should be provided as environment variables)
    CLICKHOUSE_IP="${CLICKHOUSE_IP:-127.0.0.1}"
    KAFKA_IP="${KAFKA_IP:-127.0.0.1}"
    API_IP="${API_IP:-127.0.0.1}"
    INGESTOR_IP="${INGESTOR_IP:-127.0.0.1}"
    
    log INFO "Using IP addresses:"
    log INFO "  ClickHouse: $CLICKHOUSE_IP"
    log INFO "  Kafka: $KAFKA_IP"
    log INFO "  API: $API_IP"
    log INFO "  Ingestor: $INGESTOR_IP"
    
    # Update service configurations
    find /etc/systemd/system -name "siem-*.service" -exec sed -i "s/CLICKHOUSE_IP/$CLICKHOUSE_IP/g" {} \;
    find /etc/systemd/system -name "siem-*.service" -exec sed -i "s/KAFKA_IP/$KAFKA_IP/g" {} \;
    
    systemctl daemon-reload
}

# Main installation function
main() {
    if [[ -z "$NODE_TYPE" ]]; then
        echo "Usage: $0 <node-type>"
        echo "Node types: clickhouse, kafka, siem-api, siem-consumer, siem-ingestor, load-generator"
        exit 1
    fi
    
    log INFO "Starting SIEM Load Testing Environment Setup"
    log INFO "Node type: $NODE_TYPE"
    
    validate_environment
    install_common_dependencies
    
    case $NODE_TYPE in
        "clickhouse")
            setup_clickhouse_node
            ;;
        "kafka")
            setup_kafka_node
            ;;
        "siem-api")
            setup_siem_service_node "api"
            ;;
        "siem-consumer")
            setup_siem_service_node "consumer"
            ;;
        "siem-ingestor")
            setup_siem_service_node "ingestor"
            ;;
        "load-generator")
            setup_load_generator_node
            ;;
        *)
            log ERROR "Unknown node type: $NODE_TYPE"
            exit 1
            ;;
    esac
    
    update_ip_addresses
    
    log SUCCESS "🎯 Node setup completed successfully!"
    log INFO "📋 Next steps:"
    log INFO "  1. Update IP addresses: export CLICKHOUSE_IP=<ip> KAFKA_IP=<ip> etc."
    log INFO "  2. Start services: systemctl start siem-$NODE_TYPE"
    log INFO "  3. Verify services: systemctl status siem-$NODE_TYPE"
    log INFO "  4. Check logs: journalctl -u siem-$NODE_TYPE -f"
}

main "$@"