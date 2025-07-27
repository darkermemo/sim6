# Production-Grade SIEM Ingestion Pipeline Guide

This guide provides comprehensive documentation for deploying and operating the improved SIEM ingestion pipeline in production environments.

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Key Improvements](#key-improvements)
3. [Installation & Setup](#installation--setup)
4. [Configuration](#configuration)
5. [Monitoring & Observability](#monitoring--observability)
6. [Performance Tuning](#performance-tuning)
7. [Security Considerations](#security-considerations)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)
10. [Scaling Guidelines](#scaling-guidelines)

## 🏗️ Architecture Overview

### Component Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Data Sources  │───▶│  Ingestion       │───▶│   SIEM System   │
│                 │    │  Pipeline        │    │                 │
│ • ZIP Archives  │    │                  │    │ • Event Store   │
│ • JSON Files    │    │ ┌──────────────┐ │    │ • Rule Engine   │
│ • NDJSON        │    │ │ Format       │ │    │ • Analytics     │
│ • Mixed Content │    │ │ Detection    │ │    │                 │
└─────────────────┘    │ └──────────────┘ │    └─────────────────┘
                       │ ┌──────────────┐ │
                       │ │ Streaming    │ │
                       │ │ Parser       │ │
                       │ └──────────────┘ │
                       │ ┌──────────────┐ │
                       │ │ Validation   │ │
                       │ │ Engine       │ │
                       │ └──────────────┘ │
                       │ ┌──────────────┐ │
                       │ │ Retry Logic  │ │
                       │ │ & Recovery   │ │
                       │ └──────────────┘ │
                       └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   Monitoring     │
                       │                  │
                       │ • Prometheus     │
                       │ • Grafana        │
                       │ • Alertmanager   │
                       └──────────────────┘
```

### Data Flow

1. **Input Processing**: Automatic detection of file formats (ZIP, GZ, JSON, NDJSON)
2. **Format Detection**: Dynamic identification of JSON structure (array, NDJSON, mixed)
3. **Streaming Parsing**: Memory-efficient processing using ijson/ndjson libraries
4. **Validation**: Schema validation with configurable required fields
5. **Transformation**: Event flattening and field mapping for Sigma rule compatibility
6. **Retry Logic**: Exponential backoff for transient failures
7. **Metrics Collection**: Real-time performance and error metrics
8. **Output**: Structured events sent to SIEM system

## 🚀 Key Improvements

### Previous Limitations Addressed

| **Previous Issue** | **Improvement** | **Benefit** |
|-------------------|-----------------|-------------|
| Only checks first 10 lines | Full file scanning with streaming | No valid events missed |
| Silent JSON parsing failures | Structured error logging with context | Complete error visibility |
| NDJSON-only assumption | Dynamic format detection | Supports all JSON variants |
| Hard-coded batch limits | Configurable dynamic batching | Flexible resource management |
| Minimal field extraction | Deep flattening with Sigma compatibility | Better rule matching |
| No retry logic | Exponential backoff with circuit breaker | Resilient to transient failures |
| No monitoring | Comprehensive metrics and alerting | Production observability |

### New Features

- **Streaming JSON Parsing**: Memory-efficient processing of large files
- **Format Auto-Detection**: Supports JSON arrays, NDJSON, and mixed content
- **Schema Validation**: Configurable field validation with Pydantic
- **Retry Mechanisms**: Tenacity-based retry with exponential backoff
- **Metrics Collection**: Prometheus metrics for monitoring
- **Structured Logging**: Contextual logging with dataset/file/line information
- **Performance Limits**: Configurable resource constraints
- **Health Checks**: Service health monitoring endpoints

## 🛠️ Installation & Setup

### Prerequisites

```bash
# Python 3.8+
python --version

# Required system packages (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install -y python3-pip python3-venv build-essential

# Required system packages (CentOS/RHEL)
sudo yum install -y python3-pip python3-venv gcc
```

### Python Dependencies

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

**requirements.txt**:
```
ijson>=3.2.0
ndjson>=0.3.1
pydantic>=1.10.0
tenacity>=8.2.0
prometheus-client>=0.16.0
requests>=2.28.0
pytest>=7.2.0
pytest-asyncio>=0.21.0
PyYAML>=6.0
click>=8.1.0
```

### Quick Start

```bash
# 1. Clone/download the pipeline files
cp improved_ingestion_pipeline.py /opt/siem-ingestion/
cp ingestion_test_harness.py /opt/siem-ingestion/
cp monitoring_config.py /opt/siem-ingestion/

# 2. Set up monitoring
cd /opt/siem-ingestion/
python monitoring_config.py
cd monitoring_configs/
./setup_monitoring.sh

# 3. Run tests
python ingestion_test_harness.py

# 4. Start the pipeline
python improved_ingestion_pipeline.py --config config.yaml
```

## ⚙️ Configuration

### Basic Configuration

**config.yaml**:
```yaml
# Ingestion Pipeline Configuration
ingestion:
  # Processing limits
  max_events_per_file: 10000
  max_events_per_dataset: 100000
  max_file_size_mb: 100
  batch_size: 1000
  
  # Format detection
  enable_format_detection: true
  format_detection_lines: 50
  
  # Error handling
  continue_on_parse_errors: true
  max_parse_errors_per_file: 100
  
  # Validation
  enable_validation: true
  required_fields:
    - timestamp
    - source
    - message
  
  # Retry configuration
  retry_attempts: 3
  retry_backoff_factor: 2.0
  retry_max_wait: 60
  
  # Monitoring
  enable_metrics: true
  metrics_port: 8000
  
  # Logging
  log_level: INFO
  log_format: json
  log_file: /var/log/siem-ingestion.log

# SIEM API configuration
siem:
  api_url: "http://localhost:8080/api/v1"
  timeout: 30
  max_retries: 3
  
# Data sources
sources:
  datasets_path: "/data/security-datasets"
  supported_formats:
    - zip
    - gz
    - json
    - ndjson
```

### Environment Variables

```bash
# Core configuration
export SIEM_API_URL="http://siem-api:8080/api/v1"
export SIEM_API_TOKEN="your-api-token"
export DATASETS_PATH="/data/security-datasets"

# Performance tuning
export MAX_WORKERS=4
export BATCH_SIZE=1000
export MAX_MEMORY_MB=2048

# Monitoring
export METRICS_ENABLED=true
export METRICS_PORT=8000
export LOG_LEVEL=INFO

# Security
export SSL_VERIFY=true
export API_TIMEOUT=30
```

### Advanced Configuration

**advanced_config.yaml**:
```yaml
# Advanced pipeline configuration
performance:
  # Worker configuration
  max_workers: 4
  worker_queue_size: 100
  
  # Memory management
  max_memory_mb: 2048
  gc_threshold: 1000
  
  # I/O optimization
  read_buffer_size: 65536
  write_buffer_size: 32768

security:
  # SSL/TLS configuration
  ssl_verify: true
  ssl_cert_path: "/etc/ssl/certs/siem.crt"
  ssl_key_path: "/etc/ssl/private/siem.key"
  
  # Authentication
  api_token_file: "/etc/siem/api_token"
  
  # Data sanitization
  sanitize_pii: true
  pii_fields:
    - email
    - ssn
    - credit_card

monitoring:
  # Health checks
  health_check_interval: 30
  health_check_timeout: 5
  
  # Metrics retention
  metrics_retention_days: 30
  
  # Alerting
  alert_webhook_url: "http://alertmanager:9093/api/v1/alerts"
  
  # Tracing
  enable_tracing: true
  jaeger_endpoint: "http://jaeger:14268/api/traces"
```

## 📊 Monitoring & Observability

### Metrics Dashboard

The pipeline exposes comprehensive metrics via Prometheus:

#### Key Performance Indicators (KPIs)

1. **Throughput Metrics**
   - Events processed per second
   - Files processed per minute
   - Data volume processed (MB/s)

2. **Quality Metrics**
   - Success rate percentage
   - Error rate by type
   - Validation failure rate

3. **Performance Metrics**
   - Processing latency (p50, p95, p99)
   - Memory usage
   - Queue depth

4. **Reliability Metrics**
   - Retry attempts
   - Circuit breaker status
   - Service uptime

### Grafana Dashboard

The included Grafana dashboard provides:

- **Overview Panel**: High-level KPIs and health status
- **Throughput Panel**: Event and file processing rates
- **Performance Panel**: Latency and resource utilization
- **Errors Panel**: Error rates and types
- **Operational Panel**: Queue sizes and worker status

### Alerting Rules

#### Critical Alerts

- **Pipeline Down**: No events processed in 10 minutes
- **High Error Rate**: >15% error rate for 1 minute
- **Memory Leak**: Memory usage >4GB for 5 minutes
- **Queue Overflow**: Queue size >5000 items

#### Warning Alerts

- **Degraded Performance**: >5% error rate for 2 minutes
- **Slow Processing**: p95 latency >60 seconds
- **High Memory Usage**: Memory usage >2GB for 5 minutes
- **Validation Errors**: >10 validation errors/second

### Log Analysis

#### Structured Logging Format

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "INFO",
  "logger": "siem.ingestion.parser",
  "message": "Successfully processed file",
  "context": {
    "tenant": "tenant-a",
    "dataset": "windows_security",
    "file": "security_events.json",
    "events_processed": 1500,
    "processing_time_ms": 2340,
    "format": "ndjson"
  },
  "metrics": {
    "events_per_second": 641.0,
    "memory_usage_mb": 156.7
  }
}
```

#### Log Aggregation Queries

```bash
# Error analysis
grep '"level":"ERROR"' /var/log/siem-ingestion.log | jq '.context.error_type' | sort | uniq -c

# Performance analysis
grep '"events_processed"' /var/log/siem-ingestion.log | jq '.metrics.events_per_second' | awk '{sum+=$1; count++} END {print "Average EPS:", sum/count}'

# Dataset analysis
grep '"dataset"' /var/log/siem-ingestion.log | jq -r '.context.dataset' | sort | uniq -c | sort -nr
```

## 🔧 Performance Tuning

### Memory Optimization

```python
# Recommended configuration for different environments

# Small environment (< 1GB files)
config = IngestionConfig(
    max_events_per_file=5000,
    batch_size=500,
    max_file_size_mb=50,
    read_buffer_size=32768
)

# Medium environment (1-10GB files)
config = IngestionConfig(
    max_events_per_file=20000,
    batch_size=2000,
    max_file_size_mb=200,
    read_buffer_size=65536
)

# Large environment (>10GB files)
config = IngestionConfig(
    max_events_per_file=50000,
    batch_size=5000,
    max_file_size_mb=1000,
    read_buffer_size=131072
)
```

### CPU Optimization

```yaml
# Multi-core processing configuration
performance:
  max_workers: 8  # Number of CPU cores
  worker_queue_size: 200
  enable_parallel_parsing: true
  
  # CPU-intensive operations
  enable_compression: false  # Disable if CPU-bound
  validation_threads: 2
  transformation_threads: 4
```

### I/O Optimization

```yaml
# Disk I/O optimization
io:
  # Buffer sizes
  read_buffer_size: 131072   # 128KB
  write_buffer_size: 65536   # 64KB
  
  # Async I/O
  enable_async_io: true
  max_concurrent_files: 10
  
  # Temporary storage
  temp_dir: "/tmp/siem-ingestion"  # Use fast SSD
  cleanup_temp_files: true
```

### Network Optimization

```yaml
# Network configuration
network:
  # Connection pooling
  max_connections: 20
  connection_timeout: 30
  read_timeout: 60
  
  # Retry configuration
  max_retries: 3
  backoff_factor: 2.0
  
  # Compression
  enable_gzip: true
  compression_level: 6
```

## 🔒 Security Considerations

### Data Protection

1. **Encryption in Transit**
   ```yaml
   security:
     ssl_verify: true
     min_tls_version: "1.2"
     cipher_suites:
       - "ECDHE-RSA-AES256-GCM-SHA384"
       - "ECDHE-RSA-AES128-GCM-SHA256"
   ```

2. **Encryption at Rest**
   ```bash
   # Encrypt temporary files
   export TEMP_ENCRYPTION_KEY="/etc/siem/temp_key"
   export ENCRYPT_TEMP_FILES=true
   ```

3. **PII Sanitization**
   ```python
   # Configure PII detection and sanitization
   config = IngestionConfig(
       sanitize_pii=True,
       pii_patterns={
           'email': r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
           'ssn': r'\b\d{3}-\d{2}-\d{4}\b',
           'credit_card': r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b'
       }
   )
   ```

### Access Control

1. **API Authentication**
   ```yaml
   auth:
     type: "bearer_token"
     token_file: "/etc/siem/api_token"
     token_refresh_interval: 3600
   ```

2. **File System Permissions**
   ```bash
   # Set restrictive permissions
   chmod 600 /etc/siem/config.yaml
   chmod 600 /etc/siem/api_token
   chown siem:siem /var/log/siem-ingestion.log
   chmod 640 /var/log/siem-ingestion.log
   ```

3. **Network Security**
   ```yaml
   network_security:
     allowed_hosts:
       - "siem-api.internal.com"
       - "monitoring.internal.com"
     blocked_networks:
       - "0.0.0.0/0"  # Block external access
   ```

### Audit Logging

```python
# Enable comprehensive audit logging
config = IngestionConfig(
    audit_logging=True,
    audit_log_file="/var/log/siem-audit.log",
    audit_events=[
        "file_access",
        "api_calls",
        "configuration_changes",
        "authentication_events"
    ]
)
```

## 🔍 Troubleshooting

### Common Issues

#### 1. High Memory Usage

**Symptoms**: Memory usage continuously increasing

**Diagnosis**:
```bash
# Check memory metrics
curl http://localhost:8000/metrics | grep memory_usage

# Monitor process memory
ps aux | grep siem-ingestion
top -p $(pgrep -f siem-ingestion)
```

**Solutions**:
- Reduce `max_events_per_file` and `batch_size`
- Enable garbage collection tuning
- Check for memory leaks in custom transformations

#### 2. Slow Processing

**Symptoms**: High processing latency, queue backlog

**Diagnosis**:
```bash
# Check processing metrics
curl http://localhost:8000/metrics | grep processing_duration

# Analyze slow files
grep '"processing_time_ms"' /var/log/siem-ingestion.log | jq 'select(.metrics.processing_time_ms > 10000)'
```

**Solutions**:
- Increase worker count
- Optimize file format detection
- Use streaming parsing for large files
- Check disk I/O performance

#### 3. High Error Rate

**Symptoms**: Many failed events, validation errors

**Diagnosis**:
```bash
# Check error distribution
grep '"level":"ERROR"' /var/log/siem-ingestion.log | jq '.context.error_type' | sort | uniq -c

# Analyze validation errors
grep 'validation_error' /var/log/siem-ingestion.log | jq '.context.validation_details'
```

**Solutions**:
- Review data quality in source datasets
- Adjust validation rules
- Enable `continue_on_parse_errors`
- Implement data preprocessing

#### 4. API Connection Issues

**Symptoms**: Connection timeouts, authentication failures

**Diagnosis**:
```bash
# Test API connectivity
curl -H "Authorization: Bearer $API_TOKEN" $SIEM_API_URL/health

# Check network connectivity
telnet siem-api.internal.com 8080
```

**Solutions**:
- Verify API endpoint and credentials
- Check network connectivity and firewall rules
- Increase timeout values
- Enable retry logic

### Debug Mode

```python
# Enable debug mode for detailed logging
config = IngestionConfig(
    log_level="DEBUG",
    debug_mode=True,
    save_failed_events=True,
    failed_events_dir="/tmp/failed_events"
)
```

### Performance Profiling

```python
# Enable profiling
import cProfile
import pstats

# Profile the pipeline
profiler = cProfile.Profile()
profiler.enable()

# Run pipeline
pipeline.process_dataset(dataset_path, tenant)

profiler.disable()
stats = pstats.Stats(profiler)
stats.sort_stats('cumulative').print_stats(20)
```

## 📈 Best Practices

### Development

1. **Code Quality**
   - Use type hints and Pydantic models
   - Implement comprehensive error handling
   - Write unit tests for all components
   - Use structured logging throughout

2. **Testing Strategy**
   ```python
   # Test different scenarios
   test_cases = [
       "valid_ndjson_file",
       "large_json_array",
       "mixed_format_file",
       "corrupted_json",
       "empty_file",
       "network_failure",
       "memory_pressure"
   ]
   ```

3. **Configuration Management**
   - Use environment-specific configs
   - Validate configuration on startup
   - Support hot-reloading for non-critical settings

### Operations

1. **Deployment**
   ```bash
   # Use containerized deployment
   docker build -t siem-ingestion:latest .
   docker run -d \
     --name siem-ingestion \
     -v /data:/data:ro \
     -v /etc/siem:/etc/siem:ro \
     -p 8000:8000 \
     siem-ingestion:latest
   ```

2. **Monitoring**
   - Set up comprehensive alerting
   - Monitor business metrics (events/day)
   - Track data quality metrics
   - Monitor resource utilization

3. **Maintenance**
   - Regular log rotation
   - Periodic performance reviews
   - Update dependencies regularly
   - Backup configuration files

### Data Management

1. **Data Validation**
   ```python
   # Implement comprehensive validation
   validation_rules = {
       'required_fields': ['timestamp', 'source', 'event_type'],
       'timestamp_format': 'iso8601',
       'max_field_length': 10000,
       'allowed_event_types': ['security', 'audit', 'system']
   }
   ```

2. **Data Transformation**
   ```python
   # Standardize field names
   field_mapping = {
       'TimeCreated': 'timestamp',
       'EventID': 'event_id',
       'ProcessName': 'process.name',
       'CommandLine': 'process.command_line'
   }
   ```

3. **Data Quality**
   - Implement data quality checks
   - Monitor schema drift
   - Track data completeness
   - Validate against known patterns

## 📊 Scaling Guidelines

### Horizontal Scaling

```yaml
# Multi-instance deployment
deployment:
  instances: 3
  load_balancer:
    type: "round_robin"
    health_check: "/health"
  
  # Data partitioning
  partitioning:
    strategy: "tenant_based"
    partition_key: "tenant_id"
```

### Vertical Scaling

```yaml
# Resource allocation
resources:
  cpu:
    requests: "2"
    limits: "4"
  memory:
    requests: "4Gi"
    limits: "8Gi"
  
  # Storage
  storage:
    temp_volume: "10Gi"
    log_volume: "5Gi"
```

### Performance Targets

| **Metric** | **Target** | **Scaling Trigger** |
|------------|------------|--------------------|
| Throughput | >1000 events/sec | <500 events/sec |
| Latency (p95) | <30 seconds | >60 seconds |
| Error Rate | <1% | >5% |
| Memory Usage | <2GB | >4GB |
| CPU Usage | <70% | >90% |

### Capacity Planning

```python
# Calculate required resources
def calculate_capacity(daily_events, peak_multiplier=3):
    peak_events_per_second = (daily_events * peak_multiplier) / 86400
    required_instances = math.ceil(peak_events_per_second / 1000)  # 1000 EPS per instance
    
    return {
        'instances': required_instances,
        'cpu_cores': required_instances * 4,
        'memory_gb': required_instances * 8,
        'storage_gb': daily_events * 0.001  # 1KB per event average
    }
```

## 🎯 Production Checklist

### Pre-Deployment

- [ ] Configuration validated and tested
- [ ] All dependencies installed and verified
- [ ] Security settings configured
- [ ] Monitoring and alerting set up
- [ ] Load testing completed
- [ ] Backup and recovery procedures tested
- [ ] Documentation updated

### Deployment

- [ ] Blue-green deployment strategy
- [ ] Health checks passing
- [ ] Metrics collection working
- [ ] Log aggregation configured
- [ ] API connectivity verified
- [ ] Performance within targets

### Post-Deployment

- [ ] Monitor for 24 hours
- [ ] Verify data quality
- [ ] Check alert notifications
- [ ] Review performance metrics
- [ ] Validate business metrics
- [ ] Document any issues

---

## 📞 Support

For issues and questions:

1. Check the troubleshooting section
2. Review logs and metrics
3. Consult the monitoring dashboard
4. Contact the development team

**Monitoring URLs**:
- Grafana: http://monitoring.internal.com:3000
- Prometheus: http://monitoring.internal.com:9090
- Alertmanager: http://monitoring.internal.com:9093

**Log Locations**:
- Application logs: `/var/log/siem-ingestion.log`
- Audit logs: `/var/log/siem-audit.log`
- Error logs: `/var/log/siem-errors.log`