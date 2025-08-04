# Disaster Recovery Runbook

## Overview

This document provides step-by-step procedures for recovering the SIEM platform from a complete disaster scenario where all infrastructure is lost and must be restored from backups.

## Prerequisites

### Required Information
- Latest backup metadata file
- Storage provider credentials
- Network configuration details
- DNS and certificate information
- Inventory of required infrastructure

### Required Tools
- `siem_backup_manager` binary
- ClickHouse client
- Docker and Docker Compose
- Terraform or cloud provider CLI tools
- Network access to backup storage

### Recovery Time Objectives (RTO)
- **Critical Services (API, Ingestor)**: 2 hours
- **Data Restore (ClickHouse)**: 4 hours  
- **Full Platform**: 6 hours
- **Agent Reconnection**: 30 minutes after platform restore

### Recovery Point Objectives (RPO)
- **Maximum Data Loss**: 24 hours (based on daily backup schedule)
- **Configuration Loss**: 0 (real-time replication)

## Phase 1: Infrastructure Preparation

### Step 1.1: Provision New Infrastructure

**Time Estimate**: 30-60 minutes

```bash
#!/bin/bash
# 1.1-provision-infrastructure.sh

# Set environment variables
export REGION="us-west-2"
export AZ_COUNT=3
export INSTANCE_TYPE="t3.large"
export VPC_CIDR="10.0.0.0/16"

# Provision VPC and networking
terraform init
terraform plan -out=disaster-recovery.plan
terraform apply disaster-recovery.plan

# Verify infrastructure
aws ec2 describe-instances --filters "Name=tag:Project,Values=siem-dr"
```

**Infrastructure Requirements:**
- 3 Availability Zones
- 9 EC2 instances (3 per AZ):
  - 3x ClickHouse nodes (c5.xlarge)
  - 3x Kafka brokers (m5.large)
  - 3x Application servers (t3.large)
- Load balancer (ALB or HAProxy)
- Storage volumes for data persistence

### Step 1.2: Configure Network Security

**Time Estimate**: 15 minutes

```bash
#!/bin/bash
# 1.2-configure-security.sh

# Security Groups
aws ec2 create-security-group --group-name siem-api-sg \
  --description "SIEM API Security Group"

aws ec2 authorize-security-group-ingress --group-name siem-api-sg \
  --protocol tcp --port 8080 --cidr 10.0.0.0/16

aws ec2 authorize-security-group-ingress --group-name siem-api-sg \
  --protocol tcp --port 22 --cidr 10.0.0.0/16

# ClickHouse Security Group
aws ec2 create-security-group --group-name siem-clickhouse-sg \
  --description "SIEM ClickHouse Security Group"

aws ec2 authorize-security-group-ingress --group-name siem-clickhouse-sg \
  --protocol tcp --port 8123 --cidr 10.0.0.0/16

aws ec2 authorize-security-group-ingress --group-name siem-clickhouse-sg \
  --protocol tcp --port 9000 --cidr 10.0.0.0/16

# Kafka Security Group
aws ec2 create-security-group --group-name siem-kafka-sg \
  --description "SIEM Kafka Security Group"

aws ec2 authorize-security-group-ingress --group-name siem-kafka-sg \
  --protocol tcp --port 9092 --cidr 10.0.0.0/16

aws ec2 authorize-security-group-ingress --group-name siem-kafka-sg \
  --protocol tcp --port 2181 --cidr 10.0.0.0/16
```

### Step 1.3: Install Base Software

**Time Estimate**: 20 minutes per node (can be parallelized)

```bash
#!/bin/bash
# 1.3-install-base-software.sh

# Run on all nodes
sudo apt-get update
sudo apt-get install -y docker.io docker-compose
sudo systemctl enable docker
sudo systemctl start docker

# Install monitoring tools
sudo apt-get install -y htop iotop netstat-nat tcpdump

# Configure log rotation
sudo tee /etc/logrotate.d/siem << EOF
/var/log/siem/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 siem siem
}
EOF
```

## Phase 2: Backup Recovery

### Step 2.1: Retrieve Backup Metadata

**Time Estimate**: 5 minutes

```bash
#!/bin/bash
# 2.1-retrieve-backup-metadata.sh

# Configure backup manager
cat > backup_config.toml << EOF
[storage]
type = "aws_s3"
bucket = "siem-disaster-recovery"
region = "us-west-2"
access_key_id = "${AWS_ACCESS_KEY_ID}"
secret_access_key = "${AWS_SECRET_ACCESS_KEY}"
prefix = "siem-backups"

[clickhouse]
host = "localhost"
port = 8123
database = "dev"
username = "default"
password = ""
backup_command = "clickhouse-backup"
backup_args = ["create", "--rbac", "--configs"]

metadata_path = "./backup_metadata"
EOF

# List available backups
siem_backup_manager --config backup_config.toml list-backups

# Get latest backup metadata
LATEST_BACKUP=$(siem_backup_manager --config backup_config.toml list-backups --latest)
echo "Latest backup: $LATEST_BACKUP"
export RESTORE_BACKUP_ID="$LATEST_BACKUP"
```

### Step 2.2: Download Backup Files

**Time Estimate**: 30-120 minutes (depends on backup size)

```bash
#!/bin/bash
# 2.2-download-backup-files.sh

# Create restore directory
mkdir -p /opt/siem-restore
cd /opt/siem-restore

# Download backup
siem_backup_manager --config backup_config.toml download-backup \
  --backup-id "$RESTORE_BACKUP_ID" \
  --destination ./

# Verify backup integrity
siem_backup_manager --config backup_config.toml verify-backup \
  --backup-id "$RESTORE_BACKUP_ID" \
  --local-path ./

# Extract backup
tar -xzf "${RESTORE_BACKUP_ID}.tar.gz"
cd "$RESTORE_BACKUP_ID"

echo "Backup downloaded and extracted successfully"
ls -la
```

## Phase 3: Service Restoration

### Step 3.1: Restore ZooKeeper Ensemble

**Time Estimate**: 15 minutes

```bash
#!/bin/bash
# 3.1-restore-zookeeper.sh

# Deploy ZooKeeper cluster
cat > zookeeper-cluster.yml << EOF
version: '3.8'

services:
  zookeeper-1:
    image: confluentinc/cp-zookeeper:7.4.0
    hostname: zookeeper-1
    ports:
      - "2181:2181"
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_SERVER_ID: 1
      ZOOKEEPER_SERVERS: zookeeper-1:2888:3888;zookeeper-2:2888:3888;zookeeper-3:2888:3888

  zookeeper-2:
    image: confluentinc/cp-zookeeper:7.4.0
    hostname: zookeeper-2
    ports:
      - "2182:2181"
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_SERVER_ID: 2
      ZOOKEEPER_SERVERS: zookeeper-1:2888:3888;zookeeper-2:2888:3888;zookeeper-3:2888:3888

  zookeeper-3:
    image: confluentinc/cp-zookeeper:7.4.0
    hostname: zookeeper-3
    ports:
      - "2183:2181"
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_SERVER_ID: 3
      ZOOKEEPER_SERVERS: zookeeper-1:2888:3888;zookeeper-2:2888:3888;zookeeper-3:2888:3888
EOF

# Start ZooKeeper cluster
docker-compose -f zookeeper-cluster.yml up -d

# Wait for cluster to be ready
sleep 30

# Verify ZooKeeper cluster health
for i in {1..3}; do
  echo "Testing ZooKeeper node $i..."
  echo ruok | nc localhost $((2180 + i))
done
```

### Step 3.2: Restore Kafka Cluster

**Time Estimate**: 20 minutes

```bash
#!/bin/bash
# 3.2-restore-kafka.sh

# Deploy Kafka cluster
cat > kafka-cluster.yml << EOF
version: '3.8'

services:
  kafka-1:
    image: confluentinc/cp-kafka:7.4.0
    hostname: kafka-1
    depends_on:
      - zookeeper-1
      - zookeeper-2
      - zookeeper-3
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper-1:2181,zookeeper-2:2181,zookeeper-3:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-1:9092
      KAFKA_DEFAULT_REPLICATION_FACTOR: 3
      KAFKA_MIN_INSYNC_REPLICAS: 2
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3

  kafka-2:
    image: confluentinc/cp-kafka:7.4.0
    hostname: kafka-2
    depends_on:
      - zookeeper-1
      - zookeeper-2
      - zookeeper-3
    ports:
      - "9093:9092"
    environment:
      KAFKA_BROKER_ID: 2
      KAFKA_ZOOKEEPER_CONNECT: zookeeper-1:2181,zookeeper-2:2181,zookeeper-3:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-2:9092
      KAFKA_DEFAULT_REPLICATION_FACTOR: 3
      KAFKA_MIN_INSYNC_REPLICAS: 2
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3

  kafka-3:
    image: confluentinc/cp-kafka:7.4.0
    hostname: kafka-3
    depends_on:
      - zookeeper-1
      - zookeeper-2
      - zookeeper-3
    ports:
      - "9094:9092"
    environment:
      KAFKA_BROKER_ID: 3
      KAFKA_ZOOKEEPER_CONNECT: zookeeper-1:2181,zookeeper-2:2181,zookeeper-3:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-3:9092
      KAFKA_DEFAULT_REPLICATION_FACTOR: 3
      KAFKA_MIN_INSYNC_REPLICAS: 2
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
EOF

# Start Kafka cluster
docker-compose -f kafka-cluster.yml up -d

# Wait for Kafka to be ready
sleep 60

# Create topics
kafka-topics.sh --create --bootstrap-server kafka-1:9092,kafka-2:9092,kafka-3:9092 \
  --topic ingest-events --partitions 6 --replication-factor 3 \
  --config min.insync.replicas=2

kafka-topics.sh --create --bootstrap-server kafka-1:9092,kafka-2:9092,kafka-3:9092 \
  --topic alerts --partitions 3 --replication-factor 3 \
  --config min.insync.replicas=2

# Verify topics
kafka-topics.sh --list --bootstrap-server kafka-1:9092,kafka-2:9092,kafka-3:9092
```

### Step 3.3: Restore ClickHouse Cluster

**Time Estimate**: 60-180 minutes (depends on data size)

```bash
#!/bin/bash
# 3.3-restore-clickhouse.sh

# Deploy ClickHouse cluster
cat > clickhouse-cluster.yml << EOF
version: '3.8'

services:
  clickhouse-1:
    image: clickhouse/clickhouse-server:23.3
    hostname: clickhouse-1
    ports:
      - "8123:8123"
      - "9000:9000"
    volumes:
      - ./clickhouse-config:/etc/clickhouse-server/config.d
      - clickhouse-1-data:/var/lib/clickhouse
    environment:
      CLICKHOUSE_DB: dev

  clickhouse-2:
    image: clickhouse/clickhouse-server:23.3
    hostname: clickhouse-2
    ports:
      - "8124:8123"
      - "9001:9000"
    volumes:
      - ./clickhouse-config:/etc/clickhouse-server/config.d
      - clickhouse-2-data:/var/lib/clickhouse
    environment:
      CLICKHOUSE_DB: dev

  clickhouse-3:
    image: clickhouse/clickhouse-server:23.3
    hostname: clickhouse-3
    ports:
      - "8125:8123"
      - "9002:9000"
    volumes:
      - ./clickhouse-config:/etc/clickhouse-server/config.d
      - clickhouse-3-data:/var/lib/clickhouse
    environment:
      CLICKHOUSE_DB: dev

volumes:
  clickhouse-1-data:
  clickhouse-2-data:
  clickhouse-3-data:
EOF

# Restore ClickHouse configuration
mkdir -p clickhouse-config
cp backup_data/config/clickhouse/*.xml clickhouse-config/

# Start ClickHouse cluster
docker-compose -f clickhouse-cluster.yml up -d

# Wait for ClickHouse to be ready
sleep 60

# Restore database schema
echo "Restoring database schema..."
cat backup_data/clickhouse/schema/database.json | jq -r '.data[].create_database_query' | \
  clickhouse client --host localhost --port 8123

# Restore table schemas
echo "Restoring table schemas..."
cat backup_data/clickhouse/schema/tables.json | jq -r '.data[].create_table_query' | \
  clickhouse client --host localhost --port 8123

# Restore data
echo "Restoring table data..."
for table_file in backup_data/clickhouse/data/*.native; do
  table_name=$(basename "$table_file" .native)
  echo "Restoring table: $table_name"
  
  clickhouse client --host localhost --port 8123 --database dev \
    --query "INSERT INTO $table_name FORMAT Native" < "$table_file"
done

# Verify data restoration
clickhouse client --host localhost --port 8123 --database dev \
  --query "SELECT table, count() FROM system.tables WHERE database = 'dev' GROUP BY table"
```

### Step 3.4: Restore SIEM Services

**Time Estimate**: 30 minutes

```bash
#!/bin/bash
# 3.4-restore-siem-services.sh

# Restore configuration files
mkdir -p /etc/siem
cp -r backup_data/config/* /etc/siem/

# Build and deploy SIEM services
cat > siem-services.yml << EOF
version: '3.8'

services:
  siem_api_1:
    build: ./siem_api
    environment:
      - SERVER_ADDR=0.0.0.0:8080
      - DATABASE_URL=http://clickhouse-1:8123
      - KAFKA_BROKERS=kafka-1:9092,kafka-2:9092,kafka-3:9092
      - JWT_SECRET=${JWT_SECRET}
    ports:
      - "8081:8080"
    depends_on:
      - clickhouse-1
      - kafka-1

  siem_api_2:
    build: ./siem_api
    environment:
      - SERVER_ADDR=0.0.0.0:8080
      - DATABASE_URL=http://clickhouse-2:8123
      - KAFKA_BROKERS=kafka-1:9092,kafka-2:9092,kafka-3:9092
      - JWT_SECRET=${JWT_SECRET}
    ports:
      - "8082:8080"
    depends_on:
      - clickhouse-2
      - kafka-2

  siem_api_3:
    build: ./siem_api
    environment:
      - SERVER_ADDR=0.0.0.0:8080
      - DATABASE_URL=http://clickhouse-3:8123
      - KAFKA_BROKERS=kafka-1:9092,kafka-2:9092,kafka-3:9092
      - JWT_SECRET=${JWT_SECRET}
    ports:
      - "8083:8080"
    depends_on:
      - clickhouse-3
      - kafka-3

  siem_ingestor_1:
    build: ./siem_ingestor
    environment:
      - SERVER_ADDR=0.0.0.0:8081
      - KAFKA_BROKERS=kafka-1:9092,kafka-2:9092,kafka-3:9092
    ports:
      - "8084:8081"

  siem_ingestor_2:
    build: ./siem_ingestor
    environment:
      - SERVER_ADDR=0.0.0.0:8081
      - KAFKA_BROKERS=kafka-1:9092,kafka-2:9092,kafka-3:9092
    ports:
      - "8085:8081"

  siem_ingestor_3:
    build: ./siem_ingestor
    environment:
      - SERVER_ADDR=0.0.0.0:8081
      - KAFKA_BROKERS=kafka-1:9092,kafka-2:9092,kafka-3:9092
    ports:
      - "8086:8081"

  siem_consumer:
    build: ./siem_consumer
    environment:
      - KAFKA_BROKERS=kafka-1:9092,kafka-2:9092,kafka-3:9092
      - DATABASE_URL=http://clickhouse-1:8123

  siem_rule_engine:
    build: ./siem_rule_engine
    environment:
      - DATABASE_URL=http://clickhouse-1:8123
      - API_URL=http://siem_api_1:8080
EOF

# Deploy SIEM services
docker-compose -f siem-services.yml up -d

# Wait for services to be ready
sleep 120

# Verify service health
curl -f http://localhost:8081/v1/health
curl -f http://localhost:8084/health
```

### Step 3.5: Configure Load Balancer

**Time Estimate**: 15 minutes

```bash
#!/bin/bash
# 3.5-configure-load-balancer.sh

# Install HAProxy
sudo apt-get install -y haproxy

# Restore HAProxy configuration
sudo cp backup_data/config/haproxy.cfg /etc/haproxy/haproxy.cfg

# Restart HAProxy
sudo systemctl restart haproxy
sudo systemctl enable haproxy

# Verify load balancer
curl -f http://localhost:8080/v1/health
curl -f http://localhost:8081/health
```

## Phase 4: Service State Restoration

### Step 4.1: Restore Redis State

**Time Estimate**: 10 minutes

```bash
#!/bin/bash
# 4.1-restore-redis.sh

# Start Redis
docker run -d --name redis-master -p 6379:6379 redis:7

# Wait for Redis to be ready
sleep 10

# Restore Redis data if backup exists
if [ -f backup_data/service_state/redis_dump.rdb ]; then
  docker cp backup_data/service_state/redis_dump.rdb redis-master:/data/dump.rdb
  docker restart redis-master
  sleep 10
fi

# Verify Redis
redis-cli ping
```

### Step 4.2: Restore Agent Configurations

**Time Estimate**: 15 minutes

```bash
#!/bin/bash
# 4.2-restore-agent-configs.sh

# Generate admin token for API access
python3 generate_admin_token.py > admin_token.txt
ADMIN_TOKEN=$(cat admin_token.txt)

# Restore agent policies from backup
if [ -d backup_data/config/agent_policies ]; then
  for policy_file in backup_data/config/agent_policies/*.json; do
    curl -X POST http://localhost:8080/v1/agents/policies \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d @"$policy_file"
  done
fi

# Restore asset configurations
if [ -d backup_data/config/assets ]; then
  for asset_file in backup_data/config/assets/*.json; do
    curl -X POST http://localhost:8080/v1/assets \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d @"$asset_file"
  done
fi

echo "Agent configurations restored"
```

## Phase 5: Verification and Testing

### Step 5.1: Health Check Verification

**Time Estimate**: 15 minutes

```bash
#!/bin/bash
# 5.1-verify-health.sh

echo "=== SIEM Platform Health Check ==="

# Test API endpoints
echo "Testing API endpoints..."
for port in 8081 8082 8083; do
  echo "API $port: $(curl -s http://localhost:$port/v1/health | jq -r .status)"
done

# Test Ingestor endpoints
echo "Testing Ingestor endpoints..."
for port in 8084 8085 8086; do
  echo "Ingestor $port: $(curl -s http://localhost:$port/health | jq -r .status)"
done

# Test ClickHouse cluster
echo "Testing ClickHouse cluster..."
for port in 8123 8124 8125; do
  echo "ClickHouse $port: $(clickhouse client --host localhost --port $port --query 'SELECT 1' 2>/dev/null && echo 'OK' || echo 'FAIL')"
done

# Test Kafka cluster
echo "Testing Kafka cluster..."
kafka-topics.sh --list --bootstrap-server localhost:9092,localhost:9093,localhost:9094

# Test data integrity
echo "Testing data integrity..."
RECORD_COUNT=$(clickhouse client --host localhost --port 8123 --database dev \
  --query "SELECT count() FROM events" 2>/dev/null)
echo "Events table records: $RECORD_COUNT"

# Test load balancer
echo "Testing load balancer..."
curl -f http://localhost:8080/v1/health
curl -f http://localhost:8081/health

echo "=== Health Check Complete ==="
```

### Step 5.2: End-to-End Testing

**Time Estimate**: 30 minutes

```bash
#!/bin/bash
# 5.2-end-to-end-test.sh

echo "=== End-to-End Testing ==="

# Generate test token
ADMIN_TOKEN=$(cat admin_token.txt)

# Test event ingestion
echo "Testing event ingestion..."
curl -X POST http://localhost:8080/v1/events \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "source_ip": "192.168.1.100",
      "raw_event": "Test event from disaster recovery verification"
    }]
  }'

# Wait for processing
sleep 10

# Verify event was stored
echo "Verifying event storage..."
clickhouse client --host localhost --port 8123 --database dev \
  --query "SELECT count() FROM events WHERE raw_event LIKE '%disaster recovery verification%'"

# Test agent config endpoint
echo "Testing agent configuration..."
curl -s http://localhost:8080/v1/agents/my_config \
  -H "X-Asset-ID: test-asset" \
  -H "X-Agent-Key: agent-api-key-12345"

# Test rule engine
echo "Testing rule engine..."
curl -X POST http://localhost:8080/v1/rules \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rule_name": "DR Test Rule",
    "description": "Test rule for disaster recovery verification",
    "query": "SELECT count() FROM events WHERE raw_event LIKE '\''%test%'\''"
  }'

echo "=== End-to-End Testing Complete ==="
```

## Phase 6: Agent Reconnection

### Step 6.1: Update DNS Records

**Time Estimate**: 10 minutes

```bash
#!/bin/bash
# 6.1-update-dns.sh

# Update DNS records to point to new infrastructure
# This step is cloud-provider specific

# Example for Route53
aws route53 change-resource-record-sets --hosted-zone-id Z123456789 \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "siem-api.company.com",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [{"Value": "NEW_LOAD_BALANCER_IP"}]
      }
    }]
  }'

# Verify DNS propagation
nslookup siem-api.company.com
```

### Step 6.2: Agent Reconnection Verification

**Time Estimate**: 30 minutes

```bash
#!/bin/bash
# 6.2-verify-agents.sh

echo "=== Agent Reconnection Verification ==="

# Monitor agent connections
echo "Monitoring agent connections..."
watch -n 5 'curl -s http://localhost:8080/v1/agents/status | jq -r ".connected_agents"'

# Check agent logs
echo "Checking for agent reconnections in logs..."
grep -i "agent.*connect" /var/log/siem/*.log

# Verify agent data ingestion
echo "Verifying agent data ingestion..."
INITIAL_COUNT=$(clickhouse client --host localhost --port 8123 --database dev \
  --query "SELECT count() FROM events")

sleep 300  # Wait 5 minutes

FINAL_COUNT=$(clickhouse client --host localhost --port 8123 --database dev \
  --query "SELECT count() FROM events")

NEW_EVENTS=$((FINAL_COUNT - INITIAL_COUNT))
echo "New events received from agents: $NEW_EVENTS"

echo "=== Agent Reconnection Verification Complete ==="
```

## Phase 7: Final Verification and Documentation

### Step 7.1: Complete System Verification

**Time Estimate**: 20 minutes

```bash
#!/bin/bash
# 7.1-complete-verification.sh

echo "=== Complete System Verification ==="

# Performance benchmarks
echo "Running performance benchmarks..."
ab -n 1000 -c 10 http://localhost:8080/v1/health

# Data consistency checks
echo "Performing data consistency checks..."
for table in events alerts rules assets; do
  COUNT=$(clickhouse client --host localhost --port 8123 --database dev \
    --query "SELECT count() FROM $table" 2>/dev/null || echo "0")
  echo "$table: $COUNT records"
done

# Security verification
echo "Verifying security configurations..."
curl -s http://localhost:8080/v1/events \
  -H "Content-Type: application/json" \
  -d '{"test": "unauthorized"}' | grep -q "Unauthorized" && echo "Security: OK"

# Backup verification
echo "Verifying backup functionality..."
siem_backup_manager --config backup_config.toml --immediate --dry-run

echo "=== Complete System Verification Complete ==="
```

### Step 7.2: Recovery Documentation

**Time Estimate**: 15 minutes

```bash
#!/bin/bash
# 7.2-document-recovery.sh

# Create recovery report
cat > recovery_report.md << EOF
# Disaster Recovery Report

**Recovery Date**: $(date)
**Recovery Duration**: X hours Y minutes
**Backup Used**: $RESTORE_BACKUP_ID
**Data Loss**: X hours (from backup timestamp to incident)

## Services Restored
- [x] ClickHouse Cluster (3 nodes)
- [x] Kafka Cluster (3 brokers)
- [x] SIEM API (3 instances)
- [x] SIEM Ingestor (3 instances)
- [x] SIEM Consumer
- [x] SIEM Rule Engine
- [x] Load Balancer
- [x] Agent Configurations

## Post-Recovery Actions Completed
- [x] Health checks passed
- [x] End-to-end testing successful
- [x] Agent reconnection verified
- [x] DNS updated
- [x] Performance benchmarks acceptable
- [x] Security configurations verified

## Issues Encountered
(Document any issues encountered during recovery)

## Lessons Learned
(Document improvements for future recovery procedures)

## Next Steps
- [ ] Update backup retention policy
- [ ] Enhance monitoring
- [ ] Schedule DR drill review
EOF

echo "Recovery documentation created: recovery_report.md"
```

## Recovery Validation Checklist

- [ ] Infrastructure provisioned and configured
- [ ] Network security properly configured
- [ ] ZooKeeper ensemble healthy (3 nodes)
- [ ] Kafka cluster operational (3 brokers)
- [ ] ClickHouse cluster restored (3 replicas)
- [ ] All SIEM services running and healthy
- [ ] Load balancer configured and operational
- [ ] Service state restored (Redis, configurations)
- [ ] Agent policies and assets restored
- [ ] End-to-end functionality verified
- [ ] Agent reconnection successful
- [ ] DNS records updated
- [ ] Performance benchmarks acceptable
- [ ] Security configurations verified
- [ ] Backup functionality operational
- [ ] Recovery documentation completed

## Emergency Contacts

- **SIEM Team Lead**: [Name] - [Phone] - [Email]
- **Infrastructure Team**: [Name] - [Phone] - [Email]
- **Security Team**: [Name] - [Phone] - [Email]
- **Cloud Provider Support**: [Support Number]
- **Backup Storage Provider**: [Support Number]

## Escalation Procedures

1. **Level 1**: SIEM Team attempts recovery
2. **Level 2**: Infrastructure Team assists with infrastructure issues
3. **Level 3**: Vendor support engaged for complex issues
4. **Level 4**: Management notification for extended outages

## Post-Recovery Monitoring

- Monitor system performance for 48 hours
- Verify backup schedule resumes automatically
- Check agent connection stability
- Review logs for any anomalies
- Schedule post-incident review meeting