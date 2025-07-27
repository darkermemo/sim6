# SIEM Load Testing Deployment Guide

## Infrastructure Requirements (5-Node VM Setup)

⚠️ **Critical**: This load testing **cannot be performed on a developer laptop**. A dedicated, multi-node environment that mirrors production architecture is required.

### Required Virtual Machines

| Node | Specifications | Purpose | Software |
|------|---------------|---------|----------|
| **VM-1: ClickHouse** | 8 vCPU, 32GB RAM, SSD | Database | ClickHouse Server, Node Exporter |
| **VM-2: Kafka** | 4 vCPU, 16GB RAM, SSD | Message Streaming | Kafka, Zookeeper, Kafka Exporter |
| **VM-3: SIEM API** | 4 vCPU, 16GB RAM, SSD | REST API | siem_api service, Node Exporter |
| **VM-4: SIEM Consumer** | 4 vCPU, 16GB RAM, SSD | Event Processing | siem_consumer service, Node Exporter |
| **VM-5: Load Generator** | 4 vCPU, 16GB RAM, SSD | Testing & Monitoring | k6, Prometheus, Grafana |

**Optional Additional Nodes:**
- **VM-6: SIEM Ingestor** (4 vCPU, 16GB RAM) - Can be combined with Consumer node
- **VM-7: Rule Engine** (2 vCPU, 8GB RAM) - Can be combined with API node

## Pre-Deployment Checklist

### Network Requirements
- [ ] All VMs can communicate with each other
- [ ] Firewall rules configured for required ports
- [ ] DNS resolution or `/etc/hosts` entries configured
- [ ] NTP synchronization across all nodes

### Required Ports

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| ClickHouse | 8123 | HTTP | Database queries |
| ClickHouse | 9000 | TCP | Native protocol |
| Kafka | 9092 | TCP | Message streaming |
| Zookeeper | 2181 | TCP | Kafka coordination |
| SIEM API | 8080 | HTTP | REST API |
| SIEM Ingestor | 8081 | HTTP | Log ingestion |
| SIEM Ingestor | 5140 | UDP | Syslog ingestion |
| Prometheus | 9090 | HTTP | Metrics collection |
| Grafana | 3000 | HTTP | Dashboards |
| Node Exporter | 9100 | HTTP | System metrics |

## Step-by-Step Deployment

### Step 1: Prepare All VMs

On **each VM**, ensure Ubuntu 20.04+ or similar Linux distribution:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install basic dependencies
sudo apt install -y curl wget git build-essential pkg-config libssl-dev
```

### Step 2: Deploy ClickHouse Node (VM-1)

```bash
# Copy setup script to VM-1
scp load_testing/infrastructure/setup_test_environment.sh vm1:/tmp/

# SSH to VM-1
ssh vm1

# Run setup script
sudo /tmp/setup_test_environment.sh clickhouse

# Set environment variables for other nodes
export CLICKHOUSE_IP="<VM-1-IP-ADDRESS>"
```

**Verify ClickHouse:**
```bash
curl http://<VM-1-IP>:8123/?query=SELECT%201
# Should return: 1
```

### Step 3: Deploy Kafka Node (VM-2)

```bash
# Copy setup script to VM-2
scp load_testing/infrastructure/setup_test_environment.sh vm2:/tmp/

# SSH to VM-2
ssh vm2

# Run setup script
sudo /tmp/setup_test_environment.sh kafka

# Set environment variable
export KAFKA_IP="<VM-2-IP-ADDRESS>"
```

**Verify Kafka:**
```bash
/opt/kafka/bin/kafka-topics.sh --list --bootstrap-server <VM-2-IP>:9092
# Should show: ingest-events
```

### Step 4: Deploy SIEM API Node (VM-3)

```bash
# Copy SIEM source code to VM-3
scp -r siem_api vm3:/opt/

# Copy setup script to VM-3
scp load_testing/infrastructure/setup_test_environment.sh vm3:/tmp/

# SSH to VM-3
ssh vm3

# Set required environment variables
export CLICKHOUSE_IP="<VM-1-IP-ADDRESS>"
export KAFKA_IP="<VM-2-IP-ADDRESS>"

# Run setup script
sudo -E /tmp/setup_test_environment.sh siem-api

# Start the service
sudo systemctl start siem-api
```

**Verify SIEM API:**
```bash
curl http://<VM-3-IP>:8080/v1/health
# Should return: {"status":"healthy"}
```

### Step 5: Deploy SIEM Consumer Node (VM-4)

```bash
# Copy SIEM source code to VM-4
scp -r siem_consumer vm4:/opt/

# Copy setup script to VM-4
scp load_testing/infrastructure/setup_test_environment.sh vm4:/tmp/

# SSH to VM-4
ssh vm4

# Set required environment variables
export CLICKHOUSE_IP="<VM-1-IP-ADDRESS>"
export KAFKA_IP="<VM-2-IP-ADDRESS>"

# Run setup script
sudo -E /tmp/setup_test_environment.sh siem-consumer

# Start the service
sudo systemctl start siem-consumer
```

**Verify Consumer:**
```bash
sudo journalctl -u siem-consumer -f
# Should show: "Consumer started, waiting for messages..."
```

### Step 6: Deploy Load Generator Node (VM-5)

```bash
# Copy load testing framework to VM-5
scp -r load_testing vm5:/opt/

# Copy setup script to VM-5
scp load_testing/infrastructure/setup_test_environment.sh vm5:/tmp/

# SSH to VM-5
ssh vm5

# Set environment variables for all services
export CLICKHOUSE_IP="<VM-1-IP-ADDRESS>"
export KAFKA_IP="<VM-2-IP-ADDRESS>"
export API_IP="<VM-3-IP-ADDRESS>"
export INGESTOR_IP="<VM-4-IP-ADDRESS>"  # Or VM-3 if combined

# Run setup script
sudo -E /tmp/setup_test_environment.sh load-generator

# Start monitoring services
sudo systemctl start prometheus grafana-server
```

**Verify Monitoring:**
```bash
curl http://<VM-5-IP>:9090/-/healthy
curl http://<VM-5-IP>:3000/api/health
```

## Optional Services

### SIEM Ingestor (Separate Node)

If deploying ingestor on a separate VM:

```bash
# On VM-6 (or combine with consumer VM-4)
export KAFKA_IP="<VM-2-IP-ADDRESS>"
sudo -E /tmp/setup_test_environment.sh siem-ingestor
sudo systemctl start siem-ingestor
```

### SIEM Rule Engine (Separate Node)

If deploying rule engine on a separate VM:

```bash
# On VM-7 (or combine with API VM-3)
export CLICKHOUSE_IP="<VM-1-IP-ADDRESS>"
export API_IP="<VM-3-IP-ADDRESS>"
sudo -E /tmp/setup_test_environment.sh siem-rule-engine
sudo systemctl start siem-rule-engine
```

## Validation & Health Checks

### System Health Verification

Run this script from the load generator node to verify all services:

```bash
#!/bin/bash
# health_check.sh

CLICKHOUSE_IP="<VM-1-IP>"
KAFKA_IP="<VM-2-IP>"
API_IP="<VM-3-IP>"
INGESTOR_IP="<VM-4-IP>"

echo "🔍 Verifying SIEM Load Testing Infrastructure..."

# ClickHouse
echo -n "ClickHouse: "
if curl -s http://${CLICKHOUSE_IP}:8123/?query=SELECT%201 | grep -q "1"; then
    echo "✅ HEALTHY"
else
    echo "❌ FAILED"
fi

# Kafka
echo -n "Kafka: "
if timeout 10 /opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server ${KAFKA_IP}:9092 >/dev/null 2>&1; then
    echo "✅ HEALTHY"
else
    echo "❌ FAILED"
fi

# SIEM API
echo -n "SIEM API: "
if curl -s http://${API_IP}:8080/v1/health | grep -q "healthy"; then
    echo "✅ HEALTHY"
else
    echo "❌ FAILED"
fi

# SIEM Ingestor
echo -n "SIEM Ingestor: "
if curl -s http://${INGESTOR_IP}:8081/health | grep -q "healthy"; then
    echo "✅ HEALTHY"
else
    echo "❌ FAILED"
fi

echo "🎯 Infrastructure validation completed"
```

### Performance Baseline

Before load testing, establish baseline metrics:

```bash
# From load generator node
cd /opt/load-testing

# Run a quick baseline test
k6 run --duration 30s --vus 1 k6_tests/scenario1_ingestion_load.js
```

## Load Test Execution

### Quick Test Execution

```bash
# From VM-5 (Load Generator)
cd /opt/load-testing

# Set environment variables
export API_URL="http://<VM-3-IP>:8080"
export INGESTOR_URL="http://<VM-4-IP>:8081"
export CLICKHOUSE_URL="http://<VM-1-IP>:8123"

# Execute specific scenario
./scripts/execute_comprehensive_load_test.sh scenario1

# Execute all scenarios
./scripts/execute_comprehensive_load_test.sh all
```

### Monitoring During Tests

Access real-time monitoring:

- **Prometheus**: `http://<VM-5-IP>:9090`
- **Grafana**: `http://<VM-5-IP>:3000` (admin/admin)
- **System Metrics**: `http://<VM-X-IP>:9100/metrics` (each node)

## Troubleshooting

### Common Issues

1. **Service Won't Start**
   ```bash
   sudo journalctl -u <service-name> -f
   sudo systemctl status <service-name>
   ```

2. **Network Connectivity**
   ```bash
   telnet <target-ip> <port>
   nc -zv <target-ip> <port>
   ```

3. **Resource Constraints**
   ```bash
   htop
   iostat -x 1
   df -h
   ```

4. **Kafka Consumer Lag**
   ```bash
   /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server <KAFKA-IP>:9092 --describe --group siem_clickhouse_writer
   ```

### Performance Tuning

**ClickHouse Optimization:**
```sql
-- Run on ClickHouse node
OPTIMIZE TABLE dev.events;
SELECT count() FROM dev.events;
```

**Kafka Optimization:**
```bash
# Increase file descriptors
echo "fs.file-max = 100000" >> /etc/sysctl.conf
sysctl -p
```

## Security Considerations

### Firewall Configuration

```bash
# ClickHouse node
sudo ufw allow from <CONSUMER-IP> to any port 8123
sudo ufw allow from <API-IP> to any port 8123

# Kafka node  
sudo ufw allow from <API-IP> to any port 9092
sudo ufw allow from <CONSUMER-IP> to any port 9092
sudo ufw allow from <INGESTOR-IP> to any port 9092

# API node
sudo ufw allow 8080
sudo ufw allow from <LOAD-GEN-IP> to any port 8080

# Enable firewall
sudo ufw enable
```

### Monitoring Access

Restrict monitoring endpoints to load generator IP:
```bash
sudo ufw allow from <LOAD-GEN-IP> to any port 9100
sudo ufw allow from <LOAD-GEN-IP> to any port 9090
sudo ufw allow from <LOAD-GEN-IP> to any port 3000
```

## Expected Results

### Performance Targets

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| **Ingestion Rate** | 10,000+ EPS | System limit |
| **API Latency P95** | <500ms | <1000ms |
| **Error Rate** | 0% | <0.1% |
| **CPU Utilization** | <80% | <90% |
| **Memory Usage** | <80% | <90% |

### Success Criteria

- [ ] All 4 test scenarios complete successfully
- [ ] No service restarts during 2-hour combined test
- [ ] Data integrity: 100% of ingested events stored in ClickHouse
- [ ] Rule engine processes critical events within 5-minute cycles
- [ ] Monitoring dashboards show healthy metrics throughout test

---

**🎯 This deployment guide provides the foundation for production-scale SIEM load testing on dedicated virtual machine infrastructure.** 