# Mission Control Dashboard

This document describes the SIEM system's mission control interface and real-time monitoring capabilities.

## Overview

The mission control dashboard provides real-time visibility into the SIEM pipeline health, performance metrics, and component status through interactive diagrams and live data feeds.

## Endpoints

- **Live Metrics**: `/dev/metrics/live` - Interactive real-time fleet diagram
- **Fleet Status**: `/dev/metrics/fleet` - JSON API for component status
- **Stream Metrics**: `/dev/metrics/stream` - Server-sent events for live updates

## Interpreting the Diagram

### Visual Indicators

- **Blue solid edge** — healthy link between components
- **Red dashed edge** — source or destination reported `ok=false`
- **Node colors** — reflect component health status
- **Edge thickness** — may indicate throughput levels

### Interactive Features

- **Hover node** — shows throughput, lag, last error in tooltip
- **Click node** — opens side-panel with raw JSON returned by `/status`
- **Real-time updates** — diagram refreshes every second automatically

### Component Status Interpretation

#### Vector Status
```json
{
  "ok": false,
  "err": null,
  "throughput": 0.0,
  "lag": 0,
  "ip_bind": "",
  "ip_dest": "",
  "disk_gb": 0.0,
  "parsed": null,
  "failed": null,
  "req_s": null
}
```

- `ok`: Overall health status (true/false)
- `throughput`: Events per second being processed
- `lag`: Processing delay in milliseconds
- `disk_gb`: Storage utilization
- `parsed`/`failed`: Success/failure counters

#### ClickHouse Status
- Connection health and query performance
- Storage utilization and ingestion rates
- Active connections and query queue depth

#### API Status
- Request rates and response times
- Active user sessions
- Error rates and endpoint health

### Troubleshooting Guide

#### Red Dashed Edges
When you see red dashed edges:

1. **Check component logs** - Look for error messages in service logs
2. **Verify connectivity** - Ensure network paths are clear
3. **Resource utilization** - Check CPU, memory, and disk usage
4. **Configuration** - Validate service configurations

#### Common Issues

- **Vector offline**: Check if Vector service is running
- **ClickHouse connection refused**: Verify ClickHouse is accessible
- **API errors**: Check authentication and rate limiting
- **High lag**: Investigate processing bottlenecks

### Performance Monitoring

#### Key Metrics to Watch

1. **Throughput**: Events processed per second
2. **Latency**: End-to-end processing time
3. **Error Rate**: Failed vs successful operations
4. **Resource Usage**: CPU, memory, disk utilization
5. **Queue Depth**: Backlog of pending operations

#### Alerting Thresholds

- **Critical**: Component `ok=false` for >30 seconds
- **Warning**: Throughput drops >50% from baseline
- **Info**: Lag increases >2x normal levels

## Usage Examples

### Monitoring During Incident

1. Open `/dev/metrics/live` in browser
2. Observe real-time component health
3. Click affected nodes for detailed status
4. Use tooltips to identify bottlenecks
5. Correlate with service logs

### Performance Tuning

1. Monitor throughput and lag metrics
2. Identify processing bottlenecks
3. Adjust component configurations
4. Verify improvements in real-time

### Health Checks

1. Verify all edges are blue and solid
2. Check throughput matches expected load
3. Ensure lag stays within acceptable limits
4. Monitor error counters

## Integration with Monitoring Systems

The mission control dashboard complements existing monitoring:

- **Prometheus**: Detailed metrics collection
- **Grafana**: Historical trend analysis
- **Alertmanager**: Automated incident response
- **Mission Control**: Real-time visual status

## Best Practices

1. **Regular Monitoring**: Check dashboard during peak hours
2. **Incident Response**: Use as first diagnostic tool
3. **Performance Baseline**: Establish normal operating ranges
4. **Team Training**: Ensure analysts understand visual indicators
5. **Documentation**: Keep this guide updated with system changes

---

This keeps new analysts self-sufficient and provides clear guidance for interpreting the real-time system status.