/**
 * Dashboard Types - Golden Standard
 * Complete type definitions for Dashboard page
 */

export type Iso = string;

export interface Health {
  status: 'ok' | 'degraded' | 'down';
  cidr_fn?: string;
  ingest_path?: string;
  redis?: string;
  // Optional components structure (may not exist in current API)
  components?: {
    clickhouse?: { status: string; version?: string };
    redis?: { status: string; version?: string };
    api?: { status: string; version?: string };
  };
}

export interface IngestPoint { 
  t: number; 
  bytes_in: number; 
  rows_in: number; 
}

export interface IngestResp { 
  series: IngestPoint[]; 
  totals: { 
    bytes_in: number; 
    rows_in: number; 
  }; 
}

export interface QueryPoint { 
  t: number; 
  qps: number; 
  p50_ms: number; 
  p95_ms: number; 
}

export interface QueryResp { 
  series: QueryPoint[]; 
  totals: { 
    queries: number; 
  }; 
}

export interface StoragePoint { 
  t: number; 
  storage_bytes: number; 
}

export interface StorageResp { 
  series: StoragePoint[]; 
  latest: { 
    storage_bytes: number; 
  }; 
}

export interface ErrorPoint { 
  t: number; 
  error_rate: number; 
}

export interface ErrorsResp { 
  series: ErrorPoint[]; 
  totals: { 
    errors: number; 
  }; 
}

export interface AlertRow {
  alert_id: string; 
  alert_timestamp: number; 
  alert_title: string;
  severity: 'low' | 'medium' | 'high' | 'critical'; 
  status: 'open' | 'closed';
  rule_id: string; 
  tenant_id: string;
}

export interface AlertsResp { 
  alerts: AlertRow[]; 
  total: number; 
}

export interface FreshPoint { 
  t: number; 
  max_lag_seconds: number; 
  avg_lag_seconds: number; 
}

export interface FreshnessResp { 
  series: FreshPoint[]; 
}

// Dashboard state
export interface DashboardState {
  tenantId?: string;
  since: Iso;
  until: Iso;
  step: string;
  health?: Health;
  ingest?: IngestResp;
  query?: QueryResp;
  storage?: StorageResp;
  errors?: ErrorsResp;
  alerts?: AlertsResp;
  freshness?: FreshnessResp;
  loading: boolean;
  error?: string;
}
