/**
 * Mock data for Dashboard while metrics endpoints are being implemented
 */

import * as Types from './dashboard-types';

// Generate mock time series data
const generateTimeSeries = (count: number, baseValue: number, variance: number) => {
  const now = Date.now() / 1000;
  return Array.from({ length: count }, (_, i) => ({
    t: now - (count - i) * 60, // Every minute
    value: baseValue + Math.random() * variance
  }));
};

export const mockDashboardApi = {
  health: async (): Promise<Types.Health> => ({
    status: 'ok',
    cidr_fn: 'IPv4CIDRMatch',
    ingest_path: 'api',
    redis: 'ok',
    components: {
      clickhouse: { status: 'ok', version: '23.8.1' },
      redis: { status: 'ok', version: '7.0.12' },
      api: { status: 'ok', version: '1.0.0' },
    }
  }),

  ingest: async (): Promise<Types.IngestResp> => {
    const series = generateTimeSeries(60, 1000, 500).map(p => ({
      t: p.t,
      bytes_in: p.value * 1024,
      rows_in: p.value,
    }));
    return {
      series,
      totals: {
        bytes_in: series.reduce((sum, p) => sum + p.bytes_in, 0),
        rows_in: series.reduce((sum, p) => sum + p.rows_in, 0),
      }
    };
  },

  queryStats: async (): Promise<Types.QueryResp> => {
    const series = generateTimeSeries(60, 50, 30).map(p => ({
      t: p.t,
      qps: p.value,
      p50_ms: 10 + Math.random() * 20,
      p95_ms: 50 + Math.random() * 100,
    }));
    return {
      series,
      totals: {
        queries: series.reduce((sum, p) => sum + p.qps, 0),
      }
    };
  },

  storage: async (): Promise<Types.StorageResp> => {
    const series = generateTimeSeries(24, 500000000, 50000000).map(p => ({
      t: p.t,
      storage_bytes: p.value,
    }));
    return {
      series,
      latest: {
        storage_bytes: series[series.length - 1].storage_bytes,
      }
    };
  },

  errors: async (): Promise<Types.ErrorsResp> => {
    const series = generateTimeSeries(60, 2, 5).map(p => ({
      t: p.t,
      error_rate: Math.max(0, p.value),
    }));
    return {
      series,
      totals: {
        errors: Math.floor(series.reduce((sum, p) => sum + p.error_rate, 0)),
      }
    };
  },

  recentAlerts: async (): Promise<Types.AlertsResp> => {
    const now = Math.floor(Date.now() / 1000);
    const alerts: Types.AlertRow[] = [
      {
        alert_id: 'alert-1',
        alert_timestamp: now - 300,
        alert_title: 'High CPU Usage Detected',
        severity: 'high',
        status: 'open',
        rule_id: 'rule-cpu-001',
        tenant_id: 'default',
      },
      {
        alert_id: 'alert-2', 
        alert_timestamp: now - 600,
        alert_title: 'Suspicious Login Activity',
        severity: 'critical',
        status: 'open',
        rule_id: 'rule-auth-002',
        tenant_id: 'default',
      },
      {
        alert_id: 'alert-3',
        alert_timestamp: now - 1200,
        alert_title: 'Network Anomaly',
        severity: 'medium',
        status: 'closed',
        rule_id: 'rule-net-003',
        tenant_id: 'default',
      },
    ];
    return { alerts, total: alerts.length };
  },

  freshness: async (): Promise<Types.FreshnessResp> => {
    const series = generateTimeSeries(60, 30, 20).map(p => ({
      t: p.t,
      max_lag_seconds: Math.max(5, p.value),
      avg_lag_seconds: Math.max(2, p.value * 0.6),
    }));
    return { series };
  },
};
