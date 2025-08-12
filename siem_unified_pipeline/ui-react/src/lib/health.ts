import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';

// Health status types
export interface HealthStatus {
  ok: boolean;
  version?: string;
  clickhouse?: {
    ok: boolean;
    rows?: number;
    latency_ms?: number;
    error?: string;
  };
  redis?: string; // Can be just "ok" string
  redis_detail?: {
    ok: boolean;
    ping_ms?: number;
    latency_ms?: number;
    error?: string;
  };
  circuit_breaker?: {
    state: 'closed' | 'open' | 'half_open';
    error_count: number;
    last_error?: string;
  };
}

// Health monitoring hook
export function useHealth() {
  return useQuery<HealthStatus>({
    queryKey: ['health'],
    queryFn: () => apiFetch<HealthStatus>('/health'),
    refetchInterval: 5000, // Poll every 5 seconds
    refetchIntervalInBackground: true,
  });
}

// Health status color helper
export function getHealthColor(status?: { ok: boolean } | string, degraded?: boolean): 'green' | 'amber' | 'red' | 'gray' {
  if (!status) return 'gray';
  
  if (typeof status === 'string') {
    if (status === 'degraded') return 'amber';
    return status === 'ok' ? 'green' : 'red';
  }
  
  // Handle degraded state even if ok=true (circuit breaker half-open)
  if (degraded) return 'amber';
  
  return status.ok ? 'green' : 'red';
}

// Circuit breaker state color helper
export function getCircuitBreakerColor(state?: string): 'green' | 'amber' | 'red' {
  switch (state) {
    case 'closed':
      return 'green';
    case 'half_open':
      return 'amber';
    case 'open':
      return 'red';
    default:
      return 'amber';
  }
}
