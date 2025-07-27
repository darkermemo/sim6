#!/usr/bin/env python3
"""
Monitoring and Observability Configuration for SIEM Ingestion Pipeline

This module provides comprehensive monitoring setup including:
- Prometheus metrics definitions
- Grafana dashboard configurations
- Alerting rules and thresholds
- Health check endpoints
- Performance monitoring
"""

import json
import time
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from pathlib import Path

# Prometheus metrics configuration
PROMETHEUS_METRICS_CONFIG = {
    "counters": {
        "ingestion_events_total": {
            "name": "siem_ingestion_events_total",
            "description": "Total number of events processed by the ingestion pipeline",
            "labels": ["tenant", "dataset", "status", "format"]
        },
        "ingestion_files_total": {
            "name": "siem_ingestion_files_total",
            "description": "Total number of files processed by the ingestion pipeline",
            "labels": ["tenant", "dataset", "status", "format"]
        },
        "ingestion_datasets_total": {
            "name": "siem_ingestion_datasets_total",
            "description": "Total number of datasets processed",
            "labels": ["tenant", "status"]
        },
        "ingestion_errors_total": {
            "name": "siem_ingestion_errors_total",
            "description": "Total number of ingestion errors",
            "labels": ["tenant", "dataset", "error_type", "severity"]
        },
        "ingestion_validation_errors_total": {
            "name": "siem_ingestion_validation_errors_total",
            "description": "Total number of validation errors",
            "labels": ["tenant", "dataset", "field", "validation_type"]
        },
        "ingestion_retries_total": {
            "name": "siem_ingestion_retries_total",
            "description": "Total number of retry attempts",
            "labels": ["tenant", "dataset", "operation", "retry_reason"]
        }
    },
    "histograms": {
        "ingestion_processing_duration": {
            "name": "siem_ingestion_processing_duration_seconds",
            "description": "Time spent processing files/datasets",
            "labels": ["tenant", "dataset", "operation"],
            "buckets": [0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0]
        },
        "ingestion_file_size": {
            "name": "siem_ingestion_file_size_bytes",
            "description": "Size of processed files in bytes",
            "labels": ["tenant", "dataset", "format"],
            "buckets": [1024, 10240, 102400, 1048576, 10485760, 104857600, 1073741824]
        },
        "ingestion_batch_size": {
            "name": "siem_ingestion_batch_size_events",
            "description": "Number of events in processing batches",
            "labels": ["tenant", "dataset"],
            "buckets": [10, 50, 100, 500, 1000, 5000, 10000]
        }
    },
    "gauges": {
        "ingestion_active_workers": {
            "name": "siem_ingestion_active_workers",
            "description": "Number of active ingestion workers",
            "labels": ["worker_type"]
        },
        "ingestion_queue_size": {
            "name": "siem_ingestion_queue_size",
            "description": "Number of items in ingestion queue",
            "labels": ["queue_type", "tenant"]
        },
        "ingestion_memory_usage": {
            "name": "siem_ingestion_memory_usage_bytes",
            "description": "Memory usage of ingestion process",
            "labels": ["process_type"]
        },
        "ingestion_last_success_timestamp": {
            "name": "siem_ingestion_last_success_timestamp",
            "description": "Timestamp of last successful ingestion",
            "labels": ["tenant", "dataset"]
        }
    }
}

# Grafana dashboard configuration
GRAFANA_DASHBOARD_CONFIG = {
    "dashboard": {
        "id": None,
        "title": "SIEM Ingestion Pipeline Monitoring",
        "tags": ["siem", "ingestion", "security"],
        "timezone": "browser",
        "refresh": "30s",
        "time": {
            "from": "now-1h",
            "to": "now"
        },
        "panels": [
            {
                "id": 1,
                "title": "Ingestion Rate (Events/sec)",
                "type": "stat",
                "targets": [
                    {
                        "expr": "rate(siem_ingestion_events_total{status='success'}[5m])",
                        "legendFormat": "Events/sec"
                    }
                ],
                "fieldConfig": {
                    "defaults": {
                        "color": {"mode": "palette-classic"},
                        "unit": "ops",
                        "min": 0
                    }
                },
                "gridPos": {"h": 8, "w": 6, "x": 0, "y": 0}
            },
            {
                "id": 2,
                "title": "Processing Success Rate",
                "type": "stat",
                "targets": [
                    {
                        "expr": "(sum(rate(siem_ingestion_events_total{status='success'}[5m])) / sum(rate(siem_ingestion_events_total[5m]))) * 100",
                        "legendFormat": "Success Rate %"
                    }
                ],
                "fieldConfig": {
                    "defaults": {
                        "color": {"mode": "thresholds"},
                        "unit": "percent",
                        "min": 0,
                        "max": 100,
                        "thresholds": {
                            "steps": [
                                {"color": "red", "value": 0},
                                {"color": "yellow", "value": 90},
                                {"color": "green", "value": 95}
                            ]
                        }
                    }
                },
                "gridPos": {"h": 8, "w": 6, "x": 6, "y": 0}
            },
            {
                "id": 3,
                "title": "Active Workers",
                "type": "stat",
                "targets": [
                    {
                        "expr": "siem_ingestion_active_workers",
                        "legendFormat": "{{worker_type}}"
                    }
                ],
                "fieldConfig": {
                    "defaults": {
                        "color": {"mode": "palette-classic"},
                        "unit": "short"
                    }
                },
                "gridPos": {"h": 8, "w": 6, "x": 12, "y": 0}
            },
            {
                "id": 4,
                "title": "Queue Size",
                "type": "stat",
                "targets": [
                    {
                        "expr": "siem_ingestion_queue_size",
                        "legendFormat": "{{queue_type}}"
                    }
                ],
                "fieldConfig": {
                    "defaults": {
                        "color": {"mode": "thresholds"},
                        "unit": "short",
                        "thresholds": {
                            "steps": [
                                {"color": "green", "value": 0},
                                {"color": "yellow", "value": 100},
                                {"color": "red", "value": 500}
                            ]
                        }
                    }
                },
                "gridPos": {"h": 8, "w": 6, "x": 18, "y": 0}
            },
            {
                "id": 5,
                "title": "Events Processed Over Time",
                "type": "graph",
                "targets": [
                    {
                        "expr": "rate(siem_ingestion_events_total{status='success'}[5m])",
                        "legendFormat": "Success - {{tenant}}"
                    },
                    {
                        "expr": "rate(siem_ingestion_events_total{status='failed'}[5m])",
                        "legendFormat": "Failed - {{tenant}}"
                    }
                ],
                "yAxes": [
                    {"label": "Events/sec", "min": 0},
                    {"show": False}
                ],
                "gridPos": {"h": 8, "w": 12, "x": 0, "y": 8}
            },
            {
                "id": 6,
                "title": "Processing Duration by Operation",
                "type": "graph",
                "targets": [
                    {
                        "expr": "histogram_quantile(0.95, rate(siem_ingestion_processing_duration_seconds_bucket[5m]))",
                        "legendFormat": "95th percentile - {{operation}}"
                    },
                    {
                        "expr": "histogram_quantile(0.50, rate(siem_ingestion_processing_duration_seconds_bucket[5m]))",
                        "legendFormat": "50th percentile - {{operation}}"
                    }
                ],
                "yAxes": [
                    {"label": "Duration (seconds)", "min": 0},
                    {"show": False}
                ],
                "gridPos": {"h": 8, "w": 12, "x": 12, "y": 8}
            },
            {
                "id": 7,
                "title": "Error Rate by Type",
                "type": "graph",
                "targets": [
                    {
                        "expr": "rate(siem_ingestion_errors_total[5m])",
                        "legendFormat": "{{error_type}} - {{severity}}"
                    }
                ],
                "yAxes": [
                    {"label": "Errors/sec", "min": 0},
                    {"show": False}
                ],
                "gridPos": {"h": 8, "w": 12, "x": 0, "y": 16}
            },
            {
                "id": 8,
                "title": "Memory Usage",
                "type": "graph",
                "targets": [
                    {
                        "expr": "siem_ingestion_memory_usage_bytes",
                        "legendFormat": "{{process_type}}"
                    }
                ],
                "yAxes": [
                    {"label": "Memory (bytes)", "min": 0},
                    {"show": False}
                ],
                "gridPos": {"h": 8, "w": 12, "x": 12, "y": 16}
            },
            {
                "id": 9,
                "title": "File Format Distribution",
                "type": "piechart",
                "targets": [
                    {
                        "expr": "sum by (format) (rate(siem_ingestion_files_total[5m]))",
                        "legendFormat": "{{format}}"
                    }
                ],
                "gridPos": {"h": 8, "w": 8, "x": 0, "y": 24}
            },
            {
                "id": 10,
                "title": "Tenant Activity",
                "type": "table",
                "targets": [
                    {
                        "expr": "sum by (tenant) (rate(siem_ingestion_events_total{status='success'}[5m]))",
                        "format": "table",
                        "instant": True
                    }
                ],
                "transformations": [
                    {
                        "id": "organize",
                        "options": {
                            "excludeByName": {"Time": True},
                            "renameByName": {
                                "tenant": "Tenant",
                                "Value": "Events/sec"
                            }
                        }
                    }
                ],
                "gridPos": {"h": 8, "w": 8, "x": 8, "y": 24}
            },
            {
                "id": 11,
                "title": "Last Successful Ingestion",
                "type": "table",
                "targets": [
                    {
                        "expr": "siem_ingestion_last_success_timestamp",
                        "format": "table",
                        "instant": True
                    }
                ],
                "transformations": [
                    {
                        "id": "organize",
                        "options": {
                            "excludeByName": {"Time": True, "__name__": True},
                            "renameByName": {
                                "tenant": "Tenant",
                                "dataset": "Dataset",
                                "Value": "Last Success"
                            }
                        }
                    }
                ],
                "fieldConfig": {
                    "defaults": {
                        "custom": {
                            "displayMode": "list"
                        },
                        "mappings": [
                            {
                                "type": "value",
                                "options": {
                                    "from": None,
                                    "to": None,
                                    "result": {"text": "Never"}
                                }
                            }
                        ],
                        "unit": "dateTimeFromNow"
                    }
                },
                "gridPos": {"h": 8, "w": 8, "x": 16, "y": 24}
            }
        ]
    }
}

# Alerting rules configuration
ALERTING_RULES_CONFIG = {
    "groups": [
        {
            "name": "siem_ingestion_alerts",
            "rules": [
                {
                    "alert": "IngestionHighErrorRate",
                    "expr": "(sum(rate(siem_ingestion_errors_total[5m])) / sum(rate(siem_ingestion_events_total[5m]))) * 100 > 5",
                    "for": "2m",
                    "labels": {
                        "severity": "warning",
                        "service": "siem-ingestion"
                    },
                    "annotations": {
                        "summary": "High error rate in SIEM ingestion pipeline",
                        "description": "Error rate is {{ $value }}% which is above the 5% threshold for more than 2 minutes."
                    }
                },
                {
                    "alert": "IngestionCriticalErrorRate",
                    "expr": "(sum(rate(siem_ingestion_errors_total[5m])) / sum(rate(siem_ingestion_events_total[5m]))) * 100 > 15",
                    "for": "1m",
                    "labels": {
                        "severity": "critical",
                        "service": "siem-ingestion"
                    },
                    "annotations": {
                        "summary": "Critical error rate in SIEM ingestion pipeline",
                        "description": "Error rate is {{ $value }}% which is above the 15% critical threshold."
                    }
                },
                {
                    "alert": "IngestionNoActivity",
                    "expr": "sum(rate(siem_ingestion_events_total[10m])) == 0",
                    "for": "5m",
                    "labels": {
                        "severity": "warning",
                        "service": "siem-ingestion"
                    },
                    "annotations": {
                        "summary": "No ingestion activity detected",
                        "description": "No events have been processed in the last 10 minutes."
                    }
                },
                {
                    "alert": "IngestionQueueBacklog",
                    "expr": "siem_ingestion_queue_size > 1000",
                    "for": "3m",
                    "labels": {
                        "severity": "warning",
                        "service": "siem-ingestion"
                    },
                    "annotations": {
                        "summary": "Large queue backlog in ingestion pipeline",
                        "description": "Queue size is {{ $value }} items, indicating potential processing bottleneck."
                    }
                },
                {
                    "alert": "IngestionHighMemoryUsage",
                    "expr": "siem_ingestion_memory_usage_bytes > 2147483648",  # 2GB
                    "for": "5m",
                    "labels": {
                        "severity": "warning",
                        "service": "siem-ingestion"
                    },
                    "annotations": {
                        "summary": "High memory usage in ingestion pipeline",
                        "description": "Memory usage is {{ $value | humanizeBytes }}, which may indicate a memory leak or processing large files."
                    }
                },
                {
                    "alert": "IngestionSlowProcessing",
                    "expr": "histogram_quantile(0.95, rate(siem_ingestion_processing_duration_seconds_bucket[5m])) > 60",
                    "for": "3m",
                    "labels": {
                        "severity": "warning",
                        "service": "siem-ingestion"
                    },
                    "annotations": {
                        "summary": "Slow processing in ingestion pipeline",
                        "description": "95th percentile processing time is {{ $value }}s, indicating performance issues."
                    }
                },
                {
                    "alert": "IngestionValidationErrors",
                    "expr": "rate(siem_ingestion_validation_errors_total[5m]) > 10",
                    "for": "2m",
                    "labels": {
                        "severity": "warning",
                        "service": "siem-ingestion"
                    },
                    "annotations": {
                        "summary": "High validation error rate",
                        "description": "Validation errors are occurring at {{ $value }} errors/sec, indicating data quality issues."
                    }
                },
                {
                    "alert": "IngestionWorkerDown",
                    "expr": "siem_ingestion_active_workers == 0",
                    "for": "1m",
                    "labels": {
                        "severity": "critical",
                        "service": "siem-ingestion"
                    },
                    "annotations": {
                        "summary": "No active ingestion workers",
                        "description": "All ingestion workers are down, no processing is occurring."
                    }
                }
            ]
        }
    ]
}

@dataclass
class HealthCheckResult:
    """Health check result structure"""
    service: str
    status: str  # 'healthy', 'degraded', 'unhealthy'
    timestamp: datetime
    details: Dict[str, Any]
    response_time_ms: float

@dataclass
class MonitoringThresholds:
    """Configurable monitoring thresholds"""
    error_rate_warning: float = 5.0  # %
    error_rate_critical: float = 15.0  # %
    queue_size_warning: int = 1000
    queue_size_critical: int = 5000
    memory_usage_warning: int = 2147483648  # 2GB
    memory_usage_critical: int = 4294967296  # 4GB
    processing_time_warning: float = 60.0  # seconds
    processing_time_critical: float = 300.0  # seconds
    no_activity_threshold: int = 600  # seconds

class MonitoringConfigManager:
    """Manages monitoring configuration and health checks"""
    
    def __init__(self, thresholds: Optional[MonitoringThresholds] = None):
        self.thresholds = thresholds or MonitoringThresholds()
        self.health_checks = {}
    
    def generate_prometheus_config(self, output_file: Path) -> None:
        """Generate Prometheus configuration file"""
        config = {
            "global": {
                "scrape_interval": "15s",
                "evaluation_interval": "15s"
            },
            "rule_files": [
                "siem_ingestion_alerts.yml"
            ],
            "scrape_configs": [
                {
                    "job_name": "siem-ingestion",
                    "static_configs": [
                        {
                            "targets": ["localhost:8000"]
                        }
                    ],
                    "scrape_interval": "10s",
                    "metrics_path": "/metrics"
                }
            ],
            "alerting": {
                "alertmanagers": [
                    {
                        "static_configs": [
                            {
                                "targets": ["localhost:9093"]
                            }
                        ]
                    }
                ]
            }
        }
        
        with open(output_file, 'w') as f:
            import yaml
            yaml.dump(config, f, default_flow_style=False)
    
    def generate_grafana_dashboard(self, output_file: Path) -> None:
        """Generate Grafana dashboard JSON"""
        with open(output_file, 'w') as f:
            json.dump(GRAFANA_DASHBOARD_CONFIG, f, indent=2)
    
    def generate_alerting_rules(self, output_file: Path) -> None:
        """Generate Prometheus alerting rules"""
        # Update thresholds in rules
        rules = ALERTING_RULES_CONFIG.copy()
        for group in rules['groups']:
            for rule in group['rules']:
                if rule['alert'] == 'IngestionHighErrorRate':
                    rule['expr'] = rule['expr'].replace('> 5', f'> {self.thresholds.error_rate_warning}')
                elif rule['alert'] == 'IngestionCriticalErrorRate':
                    rule['expr'] = rule['expr'].replace('> 15', f'> {self.thresholds.error_rate_critical}')
                elif rule['alert'] == 'IngestionQueueBacklog':
                    rule['expr'] = rule['expr'].replace('> 1000', f'> {self.thresholds.queue_size_warning}')
                elif rule['alert'] == 'IngestionHighMemoryUsage':
                    rule['expr'] = rule['expr'].replace('> 2147483648', f'> {self.thresholds.memory_usage_warning}')
                elif rule['alert'] == 'IngestionSlowProcessing':
                    rule['expr'] = rule['expr'].replace('> 60', f'> {self.thresholds.processing_time_warning}')
        
        with open(output_file, 'w') as f:
            import yaml
            yaml.dump(rules, f, default_flow_style=False)
    
    def perform_health_check(self, service_name: str, check_function) -> HealthCheckResult:
        """Perform health check for a service"""
        start_time = time.time()
        
        try:
            result = check_function()
            response_time = (time.time() - start_time) * 1000
            
            status = 'healthy'
            if result.get('warnings'):
                status = 'degraded'
            if result.get('errors'):
                status = 'unhealthy'
            
            health_result = HealthCheckResult(
                service=service_name,
                status=status,
                timestamp=datetime.now(),
                details=result,
                response_time_ms=response_time
            )
            
            self.health_checks[service_name] = health_result
            return health_result
        
        except Exception as e:
            response_time = (time.time() - start_time) * 1000
            health_result = HealthCheckResult(
                service=service_name,
                status='unhealthy',
                timestamp=datetime.now(),
                details={'error': str(e)},
                response_time_ms=response_time
            )
            
            self.health_checks[service_name] = health_result
            return health_result
    
    def get_overall_health(self) -> Dict[str, Any]:
        """Get overall system health status"""
        if not self.health_checks:
            return {
                'status': 'unknown',
                'message': 'No health checks performed',
                'services': {}
            }
        
        service_statuses = [check.status for check in self.health_checks.values()]
        
        if all(status == 'healthy' for status in service_statuses):
            overall_status = 'healthy'
        elif any(status == 'unhealthy' for status in service_statuses):
            overall_status = 'unhealthy'
        else:
            overall_status = 'degraded'
        
        return {
            'status': overall_status,
            'timestamp': datetime.now().isoformat(),
            'services': {name: asdict(check) for name, check in self.health_checks.items()}
        }
    
    def generate_monitoring_setup_script(self, output_file: Path) -> None:
        """Generate setup script for monitoring stack"""
        script_content = '''#!/bin/bash

# SIEM Ingestion Pipeline Monitoring Setup Script
# This script sets up Prometheus, Grafana, and Alertmanager for monitoring

set -e

echo "🚀 Setting up SIEM Ingestion Pipeline Monitoring Stack"
echo "======================================================"

# Create monitoring directory structure
mkdir -p monitoring/{prometheus,grafana,alertmanager}
cd monitoring

# Download and setup Prometheus
echo "📊 Setting up Prometheus..."
if [ ! -f prometheus/prometheus ]; then
    wget https://github.com/prometheus/prometheus/releases/download/v2.40.0/prometheus-2.40.0.linux-amd64.tar.gz
    tar xzf prometheus-2.40.0.linux-amd64.tar.gz
    mv prometheus-2.40.0.linux-amd64/* prometheus/
    rm -rf prometheus-2.40.0.linux-amd64*
fi

# Download and setup Grafana
echo "📈 Setting up Grafana..."
if [ ! -f grafana/bin/grafana-server ]; then
    wget https://dl.grafana.com/oss/release/grafana-9.3.0.linux-amd64.tar.gz
    tar xzf grafana-9.3.0.linux-amd64.tar.gz
    mv grafana-9.3.0/* grafana/
    rm -rf grafana-9.3.0*
fi

# Download and setup Alertmanager
echo "🚨 Setting up Alertmanager..."
if [ ! -f alertmanager/alertmanager ]; then
    wget https://github.com/prometheus/alertmanager/releases/download/v0.25.0/alertmanager-0.25.0.linux-amd64.tar.gz
    tar xzf alertmanager-0.25.0.linux-amd64.tar.gz
    mv alertmanager-0.25.0.linux-amd64/* alertmanager/
    rm -rf alertmanager-0.25.0.linux-amd64*
fi

# Copy configuration files
cp ../prometheus.yml prometheus/
cp ../siem_ingestion_alerts.yml prometheus/
cp ../alertmanager.yml alertmanager/

# Create Grafana datasource configuration
cat > grafana/conf/provisioning/datasources/prometheus.yml << EOF
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://localhost:9090
    isDefault: true
EOF

# Create Grafana dashboard provisioning
mkdir -p grafana/conf/provisioning/dashboards
cat > grafana/conf/provisioning/dashboards/siem.yml << EOF
apiVersion: 1
providers:
  - name: 'SIEM Dashboards'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    options:
      path: /var/lib/grafana/dashboards
EOF

# Copy dashboard JSON
mkdir -p grafana/dashboards
cp ../siem_ingestion_dashboard.json grafana/dashboards/

echo "✅ Monitoring stack setup complete!"
echo ""
echo "To start the monitoring stack:"
echo "1. Start Prometheus: ./prometheus/prometheus --config.file=prometheus/prometheus.yml"
echo "2. Start Alertmanager: ./alertmanager/alertmanager --config.file=alertmanager/alertmanager.yml"
echo "3. Start Grafana: ./grafana/bin/grafana-server --homepath=./grafana"
echo ""
echo "Access URLs:"
echo "- Prometheus: http://localhost:9090"
echo "- Grafana: http://localhost:3000 (admin/admin)"
echo "- Alertmanager: http://localhost:9093"
'''
        
        with open(output_file, 'w') as f:
            f.write(script_content)
        
        # Make script executable
        output_file.chmod(0o755)

def generate_all_monitoring_configs(output_dir: Path = Path("monitoring_configs")):
    """Generate all monitoring configuration files"""
    output_dir.mkdir(exist_ok=True)
    
    manager = MonitoringConfigManager()
    
    print("🔧 Generating monitoring configuration files...")
    
    # Generate Prometheus config
    manager.generate_prometheus_config(output_dir / "prometheus.yml")
    print("✅ Generated prometheus.yml")
    
    # Generate Grafana dashboard
    manager.generate_grafana_dashboard(output_dir / "siem_ingestion_dashboard.json")
    print("✅ Generated siem_ingestion_dashboard.json")
    
    # Generate alerting rules
    manager.generate_alerting_rules(output_dir / "siem_ingestion_alerts.yml")
    print("✅ Generated siem_ingestion_alerts.yml")
    
    # Generate Alertmanager config
    alertmanager_config = {
        "global": {
            "smtp_smarthost": "localhost:587",
            "smtp_from": "alerts@company.com"
        },
        "route": {
            "group_by": ["alertname"],
            "group_wait": "10s",
            "group_interval": "10s",
            "repeat_interval": "1h",
            "receiver": "web.hook"
        },
        "receivers": [
            {
                "name": "web.hook",
                "webhook_configs": [
                    {
                        "url": "http://localhost:5001/webhook",
                        "send_resolved": True
                    }
                ]
            }
        ]
    }
    
    with open(output_dir / "alertmanager.yml", 'w') as f:
        import yaml
        yaml.dump(alertmanager_config, f, default_flow_style=False)
    print("✅ Generated alertmanager.yml")
    
    # Generate setup script
    manager.generate_monitoring_setup_script(output_dir / "setup_monitoring.sh")
    print("✅ Generated setup_monitoring.sh")
    
    # Generate README
    readme_content = '''# SIEM Ingestion Pipeline Monitoring

This directory contains monitoring configuration files for the SIEM ingestion pipeline.

## Files

- `prometheus.yml` - Prometheus configuration
- `siem_ingestion_alerts.yml` - Alerting rules
- `siem_ingestion_dashboard.json` - Grafana dashboard
- `alertmanager.yml` - Alertmanager configuration
- `setup_monitoring.sh` - Automated setup script

## Quick Start

1. Run the setup script:
   ```bash
   ./setup_monitoring.sh
   ```

2. Start the monitoring stack:
   ```bash
   # Terminal 1 - Prometheus
   cd monitoring/prometheus
   ./prometheus --config.file=prometheus.yml
   
   # Terminal 2 - Alertmanager
   cd monitoring/alertmanager
   ./alertmanager --config.file=alertmanager.yml
   
   # Terminal 3 - Grafana
   cd monitoring/grafana
   ./bin/grafana-server --homepath=.
   ```

3. Access the interfaces:
   - Prometheus: http://localhost:9090
   - Grafana: http://localhost:3000 (admin/admin)
   - Alertmanager: http://localhost:9093

## Metrics

The pipeline exposes the following metrics:

### Counters
- `siem_ingestion_events_total` - Total events processed
- `siem_ingestion_files_total` - Total files processed
- `siem_ingestion_errors_total` - Total errors encountered

### Histograms
- `siem_ingestion_processing_duration_seconds` - Processing time distribution
- `siem_ingestion_file_size_bytes` - File size distribution

### Gauges
- `siem_ingestion_active_workers` - Number of active workers
- `siem_ingestion_queue_size` - Queue size
- `siem_ingestion_memory_usage_bytes` - Memory usage

## Alerts

Configured alerts include:
- High error rate (>5% warning, >15% critical)
- No activity detected
- Queue backlog
- High memory usage
- Slow processing
- Validation errors
- Worker failures

## Customization

To customize thresholds, modify the `MonitoringThresholds` class in the monitoring configuration.
'''
    
    with open(output_dir / "README.md", 'w') as f:
        f.write(readme_content)
    print("✅ Generated README.md")
    
    print(f"\n🎉 All monitoring configuration files generated in: {output_dir}")
    print("\nNext steps:")
    print(f"1. cd {output_dir}")
    print("2. ./setup_monitoring.sh")
    print("3. Start the monitoring stack as described in README.md")

if __name__ == "__main__":
    generate_all_monitoring_configs()