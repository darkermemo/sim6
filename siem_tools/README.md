# SIEM Tools - High-Performance Log Generator

A high-performance, multi-tenant, multi-format log generator written in Rust for SIEM testing and load simulation.

## Features

### 🚀 High Performance
- **Massive Scale**: Generate up to 1 billion logs
- **Multi-threaded**: Configurable thread count with `tokio` async runtime
- **High Throughput**: Optimized for maximum logs/second generation
- **Real-time Metrics**: Live performance monitoring and statistics

### 🏢 Multi-Tenant Simulation
- **Realistic Organizations**: Simulate up to 20+ tenant organizations
- **Tenant-specific Behavior**: Each tenant has unique IP ranges and log preferences
- **Weighted Distribution**: Some tenants generate more logs than others
- **Configurable Preferences**: Tenants can prefer specific log formats

### 📊 Multiple Log Formats
- **Fortinet FortiGate**: Firewall and UTM logs
- **Sophos WAF**: Web Application Firewall logs
- **F5 ASM**: Application Security Manager logs
- **Trend Micro**: Deep Security and LEEF format logs
- **Mixed Mode**: Random selection across all formats

### 🗜️ Compression Support
- **Gzip Compression**: Built-in gzip compression with configurable levels
- **Compression Metrics**: Track compression ratios and space savings
- **Future Support**: Extensible for LZ4 and Zstd compression

### 🌐 HTTP Forwarding
- **Batch Processing**: Configurable batch sizes for optimal throughput
- **Retry Logic**: Exponential backoff with configurable retry attempts
- **Error Handling**: Comprehensive error reporting and recovery
- **Connection Testing**: Built-in endpoint connectivity validation

### 📈 Performance Monitoring
- **Real-time Stats**: Live logs/second and bytes/second metrics
- **Comprehensive Reporting**: Final statistics with error rates and averages
- **Compression Analytics**: Detailed compression performance data
- **Thread-safe Counters**: Accurate metrics across all threads

## Installation

### Prerequisites
- Rust 1.70+ (2021 edition)
- Cargo package manager

### Build from Source
```bash
cd siem_tools
cargo build --release
```

### Run Tests
```bash
cargo test
```

## Usage

### Basic Usage
```bash
# Generate 1 million logs with default settings
./target/release/massive_log_gen --target 1000000

# Generate logs with 20 threads
./target/release/massive_log_gen --target 5000000 --threads 20

# Use specific log template
./target/release/massive_log_gen --target 100000 --template fortinet

# Dry run (no HTTP sending)
./target/release/massive_log_gen --target 1000 --dry-run
```

### Advanced Configuration
```bash
# High-performance configuration
./target/release/massive_log_gen \
  --target 1000000000 \
  --threads 50 \
  --batch-size 5000 \
  --interval 10 \
  --compression gzip \
  --tenant-count 25 \
  --endpoint http://localhost:8081/ingest/raw

# Multi-tenant simulation with mixed log types
./target/release/massive_log_gen \
  --target 10000000 \
  --template mixed \
  --tenant-count 20 \
  --threads 25
```

### Command Line Options

| Option | Default | Description |
|--------|---------|-------------|
| `--target` | 1000000 | Total number of logs to generate |
| `--threads` | 10 | Number of concurrent generator threads |
| `--endpoint` | http://127.0.0.1:8081/ingest/raw | SIEM ingestion endpoint |
| `--interval` | 100 | Delay between batches (milliseconds) |
| `--template` | mixed | Log template: fortinet, sophos, f5, trendmicro, mixed |
| `--tenant-count` | 20 | Number of simulated tenant organizations |
| `--compression` | gzip | Compression: gzip, lz4, zstd, none |
| `--batch-size` | 1000 | Number of logs per HTTP batch |
| `--dry-run` | false | Generate logs without sending to endpoint |
| `--timeout` | 30 | HTTP request timeout (seconds) |
| `--max-retries` | 3 | Maximum HTTP retry attempts |
| `--verbose` | false | Enable verbose logging |

## Log Formats

### Fortinet FortiGate
```json
{
  "log_type": "fortinet",
  "vendor": "Fortinet",
  "product": "FortiGate",
  "timestamp": "2024-01-01T12:00:00Z",
  "tenant_id": 1,
  "srcip": "10.1.0.100",
  "dstip": "192.168.1.1",
  "action": "deny",
  "severity": "critical"
}
```

### Sophos WAF
```json
{
  "log_type": "sophos",
  "vendor": "Sophos",
  "product": "WAF",
  "timestamp": "2024-01-01T12:00:00Z",
  "tenant_id": 1,
  "src_ip": "10.1.0.100",
  "method": "POST",
  "url": "/api/v1/users",
  "threat_type": "SQL Injection"
}
```

### F5 ASM
```json
{
  "log_type": "f5",
  "vendor": "F5",
  "product": "ASM",
  "timestamp": "2024-01-01T12:00:00Z",
  "tenant_id": 1,
  "src_ip": "10.1.0.100",
  "violation_type": "VIOL_PARAMETER",
  "attack_type": "Cross Site Scripting (XSS)"
}
```

### Trend Micro
```json
{
  "log_type": "trendmicro",
  "vendor": "Trend Micro",
  "product": "Deep Security",
  "timestamp": "2024-01-01T12:00:00Z",
  "tenant_id": 1,
  "computer_ip": "10.1.0.100",
  "malware_name": "TROJ_GENERIC.R12345",
  "action": "Quarantine"
}
```

## Performance Benchmarks

### Test Environment
- **Hardware**: MacBook Pro M2, 16GB RAM
- **Target**: 10 million logs
- **Configuration**: 20 threads, gzip compression, batch size 1000

### Results
- **Throughput**: ~50,000 logs/second
- **Data Rate**: ~25 MB/second (compressed)
- **Compression Ratio**: ~75% space savings
- **Memory Usage**: <100MB peak
- **CPU Usage**: ~80% across all cores

## Architecture

### Module Structure
```
siem_tools/
├── src/
│   ├── bin/
│   │   └── massive_log_gen.rs    # CLI entrypoint
│   ├── generator/
│   │   ├── mod.rs                # Generator coordination
│   │   ├── templates.rs          # Log format templates
│   │   └── tenant_simulator.rs   # Multi-tenant simulation
│   ├── http_client.rs           # HTTP client with compression
│   ├── stats.rs                 # Performance statistics
│   ├── config.rs                # Configuration management
│   └── lib.rs                   # Library exports
└── Cargo.toml                   # Dependencies and metadata
```

### Key Components

1. **LogGenerator**: Coordinates template selection and tenant simulation
2. **HttpClient**: Handles compression, batching, and HTTP delivery
3. **Stats**: Thread-safe performance monitoring and reporting
4. **TenantSimulator**: Manages multi-tenant characteristics and distribution
5. **Templates**: Realistic log format generators for each security product

## Integration

### As a Library
```rust
use siem_tools::{GeneratorConfig, LogGenerator, HttpClient, Stats};
use std::sync::Arc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = GeneratorConfig {
        target: 10000,
        threads: 4,
        template: "mixed".to_string(),
        // ... other config
    };
    
    let generator = Arc::new(LogGenerator::new(&config));
    let http_client = Arc::new(HttpClient::new(&config)?);
    let stats = Arc::new(Stats::new());
    
    // Generate and send logs
    let logs = generator.generate_batch(0, 100);
    let bytes_sent = http_client.send_logs(&logs).await?;
    stats.count_logs(logs.len());
    stats.count_bytes(bytes_sent);
    
    Ok(())
}
```

### SIEM Integration
The tool is designed to work with any SIEM system that accepts JSON logs via HTTP POST:

- **Splunk**: HTTP Event Collector (HEC)
- **Elastic Stack**: Logstash HTTP input
- **Custom SIEM**: Any HTTP ingestion endpoint

## Development

### Running Tests
```bash
# Run all tests
cargo test

# Run with output
cargo test -- --nocapture

# Run specific module tests
cargo test generator::
cargo test http_client::
```

### Benchmarking
```bash
# Run performance benchmarks
cargo bench

# Profile with flamegraph
cargo install flamegraph
sudo cargo flamegraph --bin massive_log_gen -- --target 100000 --dry-run
```

### Code Coverage
```bash
cargo install cargo-tarpaulin
cargo tarpaulin --out Html
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

### Code Style
- Follow Rust standard formatting (`cargo fmt`)
- Run clippy for linting (`cargo clippy`)
- Add documentation for public APIs
- Include unit tests for new features

## License

MIT License - see LICENSE file for details.

## Changelog

### v0.1.0
- Initial release
- Multi-threaded log generation
- Four log format templates
- Multi-tenant simulation
- HTTP forwarding with compression
- Real-time performance monitoring