# SIEM System Architecture

This document describes the high-level architecture and design principles of the SIEM (Security Information and Event Management) system.

## Overview

The SIEM system is a distributed, microservices-based security platform built with Rust and React. It provides real-time security event ingestion, processing, storage, and analysis capabilities.

## Design Principles

### 1. Fail-Fast Philosophy
- **Early Detection**: System validates configuration and dependencies before startup
- **Immediate Feedback**: Clear error messages when something goes wrong
- **Graceful Degradation**: Services can operate independently when possible

### 2. Self-Documenting
- **Configuration as Code**: All settings are version-controlled
- **Automated Documentation**: System generates its own status reports
- **Clear Interfaces**: Well-defined APIs and data contracts

### 3. Scalability
- **Horizontal Scaling**: Services can be replicated across multiple instances
- **Asynchronous Processing**: Event-driven architecture with message queues
- **Efficient Storage**: ClickHouse for high-performance analytics

### 4. Security
- **Defense in Depth**: Multiple layers of security controls
- **Least Privilege**: Services run with minimal required permissions
- **Audit Trail**: All actions are logged and traceable

## System Components

### Core Services

```
┌─────────────────────────────────────────────────────────────────┐
│                        SIEM System                             │
├─────────────────────────────────────────────────────────────────┤
│  Frontend Layer                                                 │
│  ┌─────────────────┐                                           │
│  │   SIEM UI       │  React-based web interface                │
│  │   (React/TS)    │  Port: 3004                               │
│  └─────────────────┘                                           │
├─────────────────────────────────────────────────────────────────┤
│  API Layer                                                      │
│  ┌─────────────────┐                                           │
│  │   SIEM API      │  REST API server                          │
│  │   (Rust)        │  Port: 8080                               │
│  └─────────────────┘                                           │
├─────────────────────────────────────────────────────────────────┤
│  Processing Layer                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ CH Ingestor     │  │ Unified Pipeline│  │ Consumer        │ │
│  │ (Rust)          │  │ (Rust)          │  │ (Rust)          │ │
│  │ Port: 8081      │  │ Port: 8082      │  │ Background      │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  Storage Layer                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ ClickHouse      │  │ PostgreSQL      │  │ Redis           │ │
│  │ (Events)        │  │ (Metadata)      │  │ (Cache/Session) │ │
│  │ Port: 8123      │  │ Port: 5432      │  │ Port: 6379      │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  Message Queue                                                  │
│  ┌─────────────────┐                                           │
│  │ Apache Kafka    │  Event streaming and message queuing      │
│  │ Port: 9092      │                                           │
│  └─────────────────┘                                           │
└─────────────────────────────────────────────────────────────────┘
```

### Service Descriptions

#### SIEM UI (`siem_ui`)
- **Technology**: React with TypeScript, Vite
- **Purpose**: Web-based user interface for security analysts
- **Features**:
  - Real-time dashboard
  - Event search and filtering
  - Alert management
  - System configuration

#### SIEM API (`siem_api`)
- **Technology**: Rust with Axum web framework
- **Purpose**: Main REST API server
- **Features**:
  - Authentication and authorization
  - Event querying and aggregation
  - Dashboard data endpoints
  - System health monitoring

#### ClickHouse Ingestor (`siem_clickhouse_ingestion`)
- **Technology**: Rust with ClickHouse client
- **Purpose**: High-performance event ingestion
- **Features**:
  - Batch processing for efficiency
  - Schema validation
  - Rate limiting
  - Error handling and retry logic

#### Unified Pipeline (`siem_unified_pipeline`)
- **Technology**: Rust
- **Purpose**: Event processing and enrichment
- **Features**:
  - Data normalization
  - Event correlation
  - Rule engine integration
  - Output routing

#### Consumer (`siem_consumer`)
- **Technology**: Rust with Kafka client
- **Purpose**: Kafka message consumption
- **Features**:
  - Reliable message processing
  - Dead letter queue handling
  - Offset management
  - Backpressure handling

### Supporting Services

#### Backup Manager (`siem_backup_manager`)
- **Purpose**: Data backup and recovery
- **Features**:
  - Scheduled backups
  - Incremental backup support
  - Compression and encryption
  - Restore capabilities

#### Data Pruner (`siem_data_pruner`)
- **Purpose**: Data lifecycle management
- **Features**:
  - Automated data retention
  - Archive old events
  - Storage optimization
  - Compliance support

#### Threat Intel (`siem_threat_intel`)
- **Purpose**: Threat intelligence integration
- **Features**:
  - IOC (Indicator of Compromise) feeds
  - Threat data enrichment
  - Risk scoring
  - External API integration

#### Search Service (`siem_clickhouse_search`)
- **Purpose**: Advanced search capabilities
- **Features**:
  - Complex query optimization
  - Full-text search
  - Aggregation queries
  - Search result caching

## Data Flow

### Event Ingestion Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Agents    │───►│   Kafka     │───►│  Consumer   │───►│ ClickHouse  │
│  (External) │    │  (Queue)    │    │ (Process)   │    │ (Storage)   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                           │                   │
                           ▼                   ▼
                   ┌─────────────┐    ┌─────────────┐
                   │ Ingestor    │    │ Pipeline    │
                   │ (Direct)    │    │ (Enrich)    │
                   └─────────────┘    └─────────────┘
```

### Query Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   SIEM UI   │───►│  SIEM API   │───►│   Search    │───►│ ClickHouse  │
│  (Request)  │    │ (Validate)  │    │ (Optimize)  │    │ (Execute)   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       ▲                   │                   │                   │
       │                   ▼                   ▼                   ▼
       │           ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
       └───────────│   Redis     │    │ Aggregator  │    │   Results   │
                   │  (Cache)    │    │ (Process)   │    │ (Return)    │
                   └─────────────┘    └─────────────┘    └─────────────┘
```

## Database Schema

### ClickHouse (Primary Event Storage)

```sql
-- Main events table
CREATE TABLE dev.events (
    id UUID DEFAULT generateUUIDv4(),
    timestamp DateTime64(3),
    source LowCardinality(String),
    event_type LowCardinality(String),
    severity LowCardinality(String),
    message String,
    raw_data String,
    metadata Map(String, String),
    processed_at DateTime64(3) DEFAULT now64(),
    INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 8192,
    INDEX idx_source source TYPE bloom_filter GRANULARITY 8192,
    INDEX idx_event_type event_type TYPE bloom_filter GRANULARITY 8192
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, source, event_type)
TTL timestamp + INTERVAL 90 DAY;

-- Aggregated statistics
CREATE TABLE dev.event_stats (
    date Date,
    hour UInt8,
    source LowCardinality(String),
    event_type LowCardinality(String),
    count UInt64,
    severity_counts Map(String, UInt64)
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, hour, source, event_type);
```

### PostgreSQL (Metadata Storage)

```sql
-- User management
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'analyst',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alert rules
CREATE TABLE alert_rules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    query TEXT NOT NULL,
    severity VARCHAR(50) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System configuration
CREATE TABLE system_config (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## API Design

### REST API Endpoints

#### Authentication
```
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/refresh
GET  /api/v1/auth/me
```

#### Events
```
GET    /api/v1/events              # List events with filtering
GET    /api/v1/events/{id}         # Get specific event
POST   /api/v1/events/search       # Advanced search
GET    /api/v1/events/stats        # Event statistics
```

#### Dashboard
```
GET    /api/v1/dashboard           # Dashboard data
GET    /api/v1/dashboard/kpis      # Key performance indicators
GET    /api/v1/dashboard/charts    # Chart data
```

#### Alerts
```
GET    /api/v1/alerts              # List alerts
POST   /api/v1/alerts              # Create alert rule
PUT    /api/v1/alerts/{id}         # Update alert rule
DELETE /api/v1/alerts/{id}         # Delete alert rule
```

#### System
```
GET    /health                     # Health check
GET    /metrics                    # Prometheus metrics
GET    /api/v1/system/status       # System status
GET    /api/v1/system/config       # System configuration
```

### Data Models

#### Event Model
```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct Event {
    pub id: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub source: String,
    pub event_type: String,
    pub severity: Severity,
    pub message: String,
    pub raw_data: Option<String>,
    pub metadata: HashMap<String, String>,
    pub processed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum Severity {
    Critical,
    High,
    Medium,
    Low,
    Info,
}
```

#### Dashboard Model
```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct DashboardData {
    pub kpis: KpiData,
    pub recent_events: Vec<Event>,
    pub top_sources: Vec<SourceCount>,
    pub severity_distribution: HashMap<String, u64>,
    pub timeline_data: Vec<TimelinePoint>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KpiData {
    pub total_events: u64,
    pub events_last_hour: u64,
    pub critical_alerts: u64,
    pub active_sources: u64,
}
```

## Security Architecture

### Authentication & Authorization

1. **JWT-based Authentication**
   - Stateless token-based auth
   - Configurable expiration
   - Refresh token support

2. **Role-based Access Control (RBAC)**
   - Admin: Full system access
   - Analyst: Read/write access to events and alerts
   - Viewer: Read-only access

3. **API Key Authentication**
   - For service-to-service communication
   - Agent authentication
   - Rate limiting per key

### Data Security

1. **Encryption**
   - TLS for all network communication
   - Encryption at rest for sensitive data
   - Secure key management

2. **Input Validation**
   - Schema validation for all inputs
   - SQL injection prevention
   - XSS protection

3. **Audit Logging**
   - All API calls logged
   - User action tracking
   - System event logging

## Performance Considerations

### Scalability Patterns

1. **Horizontal Scaling**
   - Stateless services
   - Load balancer support
   - Database sharding

2. **Caching Strategy**
   - Redis for session data
   - Query result caching
   - Static asset caching

3. **Asynchronous Processing**
   - Kafka for event streaming
   - Background job processing
   - Non-blocking I/O

### Performance Optimizations

1. **Database Optimizations**
   - Proper indexing strategy
   - Partitioning by time
   - Data compression

2. **Query Optimizations**
   - Query result pagination
   - Efficient aggregations
   - Connection pooling

3. **Resource Management**
   - Memory usage monitoring
   - CPU usage optimization
   - Disk I/O optimization

## Monitoring & Observability

### Metrics

1. **System Metrics**
   - CPU, memory, disk usage
   - Network I/O
   - Service availability

2. **Application Metrics**
   - Request latency
   - Error rates
   - Throughput

3. **Business Metrics**
   - Events per second
   - Alert generation rate
   - User activity

### Logging

1. **Structured Logging**
   - JSON format
   - Consistent log levels
   - Correlation IDs

2. **Log Aggregation**
   - Centralized log collection
   - Log rotation
   - Long-term storage

3. **Log Analysis**
   - Error pattern detection
   - Performance analysis
   - Security monitoring

### Health Checks

1. **Service Health**
   - HTTP health endpoints
   - Database connectivity
   - External service checks

2. **System Health**
   - Resource utilization
   - Service dependencies
   - Data flow validation

## Deployment Architecture

### Development Environment

```
┌─────────────────────────────────────────────────────────────────┐
│                    Development Machine                         │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ SIEM UI     │  │ SIEM API    │  │ Ingestor    │            │
│  │ npm run dev │  │ cargo run   │  │ cargo run   │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ ClickHouse  │  │ PostgreSQL  │  │ Redis       │            │
│  │ (Docker)    │  │ (Docker)    │  │ (Docker)    │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

### Production Environment

```
┌─────────────────────────────────────────────────────────────────┐
│                      Load Balancer                             │
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────────┐
│                   Application Tier                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ SIEM UI     │  │ SIEM API    │  │ Ingestor    │            │
│  │ (Multiple)  │  │ (Multiple)  │  │ (Multiple)  │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────────┐
│                    Database Tier                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ ClickHouse  │  │ PostgreSQL  │  │ Redis       │            │
│  │ (Cluster)   │  │ (HA)        │  │ (Cluster)   │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

## Future Enhancements

### Planned Features

1. **Machine Learning Integration**
   - Anomaly detection
   - Behavioral analysis
   - Predictive alerting

2. **Advanced Analytics**
   - Complex event processing
   - Statistical analysis
   - Trend analysis

3. **Integration Capabilities**
   - SOAR platform integration
   - Threat intelligence feeds
   - External SIEM integration

4. **Enhanced UI/UX**
   - Real-time visualizations
   - Custom dashboards
   - Mobile support

### Technical Improvements

1. **Performance Optimizations**
   - Query optimization
   - Caching improvements
   - Resource efficiency

2. **Scalability Enhancements**
   - Auto-scaling capabilities
   - Multi-region support
   - Edge computing integration

3. **Security Hardening**
   - Zero-trust architecture
   - Advanced threat detection
   - Compliance automation

This architecture provides a solid foundation for a scalable, secure, and maintainable SIEM system while maintaining the fail-fast and self-documenting principles.