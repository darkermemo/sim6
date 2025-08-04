# High Availability Deployment Guide

## Overview

This document outlines the High Availability (HA) architecture for the SIEM platform, ensuring resilience against component failures and providing seamless failover capabilities.

## Architecture Overview

```
                    ┌─────────────────┐
                    │   Load Balancer │
                    │    (HAProxy)    │
                    └─────────┬───────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
    ┌─────────▼─────┐ ┌─────────▼─────┐ ┌─────────▼─────┐
    │  siem_api_1   │ │  siem_api_2   │ │  siem_api_3   │
    │  (AZ-1)       │ │  (AZ-2)       │ │  (AZ-3)       │
    └───────────────┘ └───────────────┘ └───────────────┘
              │               │               │
              └───────────────┼───────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
    ┌─────────▼─────┐ ┌─────────▼─────┐ ┌─────────▼─────┐
    │ siem_ingestor │ │ siem_ingestor │ │ siem_ingestor │
    │     (AZ-1)    │ │     (AZ-2)    │ │     (AZ-3)    │
    └───────────────┘ └───────────────┘ └───────────────┘
              │               │               │
              └───────────────┼───────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Kafka Cluster   │
                    │   (3 brokers)     │
                    │   Cross-AZ        │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │ ClickHouse Cluster│
                    │   (3 replicas)    │
                    │   Cross-AZ        │
                    └───────────────────┘
```

## 1. Stateless Services High Availability

### 1.1 SIEM API (siem_api)

**Deployment Strategy:**
- Deploy 3 instances across different availability zones
- Each instance runs independently without shared state
- Load balancer distributes traffic using round-robin with health checks

**Configuration:**

```yaml
# docker-compose-ha.yml
version: '3.8'

services:
  siem_api_1:
    build: ./siem_api
    environment:
      - SERVER_ADDR=0.0.0.0:8080
      - DATABASE_URL=http://clickhouse-cluster:8123
      - KAFKA_BROKERS=kafka-1:9092,kafka-2:9092,kafka-3:9092
      - JWT_SECRET=${JWT_SECRET}
    ports:
      - "8081:8080"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      placement:
        constraints:
          - node.labels.zone == az-1

  siem_api_2:
    build: ./siem_api
    environment:
      - SERVER_ADDR=0.0.0.0:8080
      - DATABASE_URL=http://clickhouse-cluster:8123
      - KAFKA_BROKERS=kafka-1:9092,kafka-2:9092,kafka-3:9092
      - JWT_SECRET=${JWT_SECRET}
    ports:
      - "8082:8080"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      placement:
        constraints:
          - node.labels.zone == az-2

  siem_api_3:
    build: ./siem_api
    environment:
      - SERVER_ADDR=0.0.0.0:8080
      - DATABASE_URL=http://clickhouse-cluster:8123
      - KAFKA_BROKERS=kafka-1:9092,kafka-2:9092,kafka-3:9092
      - JWT_SECRET=${JWT_SECRET}
    ports:
      - "8083:8080"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      placement:
        constraints:
          - node.labels.zone == az-3
```

### 1.2 SIEM Ingestor (siem_ingestor)

**Deployment Strategy:**
- Deploy 3 instances for load distribution
- Each instance can process logs independently
- Automatic failover through load balancer

**Configuration:**

```yaml
  siem_ingestor_1:
    build: ./siem_ingestor
    environment:
      - SERVER_ADDR=0.0.0.0:8081
      - KAFKA_BROKERS=kafka-1:9092,kafka-2:9092,kafka-3:9092
    ports:
      - "8084:8081"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8081/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      placement:
        constraints:
          - node.labels.zone == az-1

  siem_ingestor_2:
    build: ./siem_ingestor
    environment:
      - SERVER_ADDR=0.0.0.0:8081
      - KAFKA_BROKERS=kafka-1:9092,kafka-2:9092,kafka-3:9092
    ports:
      - "8085:8081"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8081/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      placement:
        constraints:
          - node.labels.zone == az-2

  siem_ingestor_3:
    build: ./siem_ingestor
    environment:
      - SERVER_ADDR=0.0.0.0:8081
      - KAFKA_BROKERS=kafka-1:9092,kafka-2:9092,kafka-3:9092
    ports:
      - "8086:8081"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8081/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      placement:
        constraints:
          - node.labels.zone == az-3
```

### 1.3 Load Balancer Configuration (HAProxy)

```bash
# haproxy.cfg
global
    daemon
    log stdout local0
    maxconn 4096

defaults
    mode http
    log global
    option httplog
    option dontlognull
    timeout connect 5000ms
    timeout client 50000ms
    timeout server 50000ms

# SIEM API Load Balancer
frontend siem_api_frontend
    bind *:8080
    default_backend siem_api_backend

backend siem_api_backend
    balance roundrobin
    option httpchk GET /v1/health
    http-check expect status 200
    server api1 siem_api_1:8080 check inter 30s
    server api2 siem_api_2:8080 check inter 30s
    server api3 siem_api_3:8080 check inter 30s

# SIEM Ingestor Load Balancer
frontend siem_ingestor_frontend
    bind *:8081
    default_backend siem_ingestor_backend

backend siem_ingestor_backend
    balance roundrobin
    option httpchk GET /health
    http-check expect status 200
    server ingestor1 siem_ingestor_1:8081 check inter 30s
    server ingestor2 siem_ingestor_2:8081 check inter 30s
    server ingestor3 siem_ingestor_3:8081 check inter 30s

# Statistics
stats enable
stats uri /stats
stats refresh 30s
stats hide-version
```

## 2. Stateful Services High Availability

### 2.1 ClickHouse Cluster Configuration

**Setup:**
- 3-node ClickHouse cluster with replication
- Cross-availability zone deployment
- Automatic failover capabilities

```xml
<!-- clickhouse-cluster.xml -->
<yandex>
    <remote_servers>
        <siem_cluster>
            <shard>
                <replica>
                    <host>clickhouse-1</host>
                    <port>9000</port>
                </replica>
                <replica>
                    <host>clickhouse-2</host>
                    <port>9000</port>
                </replica>
                <replica>
                    <host>clickhouse-3</host>
                    <port>9000</port>
                </replica>
            </shard>
        </siem_cluster>
    </remote_servers>

    <zookeeper>
        <node>
            <host>zookeeper-1</host>
            <port>2181</port>
        </node>
        <node>
            <host>zookeeper-2</host>
            <port>2181</port>
        </node>
        <node>
            <host>zookeeper-3</host>
            <port>2181</port>
        </node>
    </zookeeper>

    <macros>
        <cluster>siem_cluster</cluster>
        <shard>01</shard>
        <replica>{hostname}</replica>
    </macros>
</yandex>
```

**Replicated Tables:**
```sql
-- Update existing tables to use replication
CREATE TABLE dev.events_replicated ON CLUSTER siem_cluster
(
    event_id String,
    tenant_id String,
    event_timestamp UInt32,
    source_ip String,
    source_type String,
    raw_event String,
    event_category String,
    event_outcome String,
    event_action String,
    is_threat UInt8
) 
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/events', '{replica}')
PARTITION BY toYYYYMM(toDateTime(event_timestamp))
ORDER BY (tenant_id, event_timestamp, event_id);

-- Migrate data from existing table
INSERT INTO dev.events_replicated SELECT * FROM dev.events;
```

### 2.2 Kafka Cluster Configuration

**Setup:**
- 3-broker Kafka cluster
- Replication factor of 3 for all topics
- Cross-AZ deployment

```properties
# kafka-cluster.properties
broker.id=1
listeners=PLAINTEXT://kafka-1:9092
advertised.listeners=PLAINTEXT://kafka-1:9092
zookeeper.connect=zookeeper-1:2181,zookeeper-2:2181,zookeeper-3:2181

# Replication settings
default.replication.factor=3
min.insync.replicas=2
unclean.leader.election.enable=false

# Log settings
log.dirs=/var/kafka-logs
num.partitions=6
log.retention.hours=168
log.segment.bytes=1073741824
```

**Topic Configuration:**
```bash
# Create replicated topics
kafka-topics.sh --create \
    --bootstrap-server kafka-1:9092,kafka-2:9092,kafka-3:9092 \
    --topic ingest-events \
    --partitions 6 \
    --replication-factor 3 \
    --config min.insync.replicas=2

kafka-topics.sh --create \
    --bootstrap-server kafka-1:9092,kafka-2:9092,kafka-3:9092 \
    --topic alerts \
    --partitions 3 \
    --replication-factor 3 \
    --config min.insync.replicas=2
```

### 2.3 ZooKeeper Ensemble

```properties
# zookeeper.properties
dataDir=/var/zookeeper
clientPort=2181
maxClientCnxns=60

# Cluster configuration
server.1=zookeeper-1:2888:3888
server.2=zookeeper-2:2888:3888
server.3=zookeeper-3:2888:3888

# Performance tuning
tickTime=2000
initLimit=10
syncLimit=5
```

## 3. Deployment Instructions

### 3.1 Prerequisites

1. **Infrastructure Requirements:**
   - 3 availability zones
   - Minimum 9 VMs (3 per AZ)
   - Load balancer (HAProxy or cloud equivalent)

2. **Network Configuration:**
   - VPC with subnets in each AZ
   - Security groups for inter-service communication
   - Health check endpoints accessible

### 3.2 Deployment Steps

```bash
#!/bin/bash
# deploy-ha.sh

# 1. Deploy ZooKeeper ensemble
docker-compose -f zookeeper-cluster.yml up -d

# 2. Deploy Kafka cluster
docker-compose -f kafka-cluster.yml up -d

# 3. Deploy ClickHouse cluster
docker-compose -f clickhouse-cluster.yml up -d

# 4. Initialize database schemas
clickhouse client --host clickhouse-1 --multiquery < database_setup_ha.sql

# 5. Deploy SIEM services
docker-compose -f siem-services-ha.yml up -d

# 6. Deploy load balancer
docker-compose -f haproxy.yml up -d

# 7. Verify deployment
./verify-ha-deployment.sh
```

### 3.3 Health Monitoring

```bash
#!/bin/bash
# health-check.sh

echo "Checking SIEM API cluster health..."
for i in {1..3}; do
    curl -f http://siem-api-$i:8080/v1/health || echo "API $i is down"
done

echo "Checking Ingestor cluster health..."
for i in {1..3}; do
    curl -f http://siem-ingestor-$i:8081/health || echo "Ingestor $i is down"
done

echo "Checking ClickHouse cluster health..."
for i in {1..3}; do
    clickhouse client --host clickhouse-$i --query "SELECT 1" || echo "ClickHouse $i is down"
done

echo "Checking Kafka cluster health..."
kafka-topics.sh --bootstrap-server kafka-1:9092,kafka-2:9092,kafka-3:9092 --list || echo "Kafka cluster is down"
```

## 4. Failover Procedures

### 4.1 Automatic Failover

- **Load Balancer:** Automatically removes unhealthy instances from rotation
- **Kafka:** Automatic leader election for partitions
- **ClickHouse:** Automatic replica promotion

### 4.2 Manual Failover

```bash
# Remove instance from load balancer
echo "disable server siem_api_backend/api1" | socat stdio /var/lib/haproxy/stats

# Add instance back to load balancer
echo "enable server siem_api_backend/api1" | socat stdio /var/lib/haproxy/stats
```

## 5. Monitoring and Alerting

### 5.1 Key Metrics

- Service health endpoints response time
- Load balancer backend status
- Kafka consumer lag
- ClickHouse replication lag
- Disk space and memory usage

### 5.2 Alert Thresholds

- Service response time > 5 seconds
- Any backend marked as DOWN
- Consumer lag > 1000 messages
- Replication lag > 60 seconds
- Disk usage > 80%

## 6. Scaling Procedures

### 6.1 Horizontal Scaling

```bash
# Add new API instance
docker-compose -f siem-services-ha.yml up -d --scale siem_api=4

# Update load balancer configuration
# Add new server to haproxy.cfg and reload
```

### 6.2 Vertical Scaling

- Update resource limits in docker-compose files
- Restart services with rolling updates to maintain availability

This HA deployment ensures:
- **Zero single points of failure**
- **Automatic failover capabilities**
- **Geographic distribution across availability zones**
- **Horizontal and vertical scaling capabilities**
- **Comprehensive health monitoring**