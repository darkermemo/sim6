import { useState, useEffect, useCallback, useRef } from 'react';
import { HealthAPI } from '@/lib/health-api';
import type { HealthSummary, HealthDelta, DiagnoseRequest, DiagnoseResponse, AutoFixRequest, AutoFixResponse } from '@/types/health';

export function useHealthSummary(refreshInterval: number = 10000) {
  const [data, setData] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      setError(null);
      const summary = await HealthAPI.getSummary();
      setData(summary);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch health summary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    
    if (refreshInterval > 0) {
      const interval = setInterval(fetchSummary, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchSummary, refreshInterval]);

  return {
    data,
    loading,
    error,
    lastRefresh,
    refetch: fetchSummary,
  };
}

export function useHealthStream() {
  const [delta, setDelta] = useState<HealthDelta | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setError(null);
    setConnected(false);

    try {
      const eventSource = HealthAPI.createStreamConnection(
        (data: HealthDelta) => {
          setDelta(data);
          setConnected(true);
        },
        (error: Event) => {
          setError('SSE connection lost');
          setConnected(false);
        }
      );

      eventSource.onopen = () => {
        setConnected(true);
        setError(null);
      };

      eventSourceRef.current = eventSource;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to health stream');
    }
  }, []);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setConnected(false);
    setDelta(null);
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    delta,
    connected,
    error,
    connect,
    disconnect,
  };
}

export function useHealthDiagnose() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const diagnose = useCallback(async (request: DiagnoseRequest): Promise<DiagnoseResponse | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await HealthAPI.diagnose(request);
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Diagnostic check failed';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    diagnose,
    loading,
    error,
  };
}

export function useHealthAutoFix() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoFix = useCallback(async (request: AutoFixRequest): Promise<AutoFixResponse | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await HealthAPI.autoFix(request);
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Auto-fix failed';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    autoFix,
    loading,
    error,
  };
}

/**
 * Combined hook that merges snapshot data with SSE stream deltas
 */
export function useRealtimeHealth(options: {
  enableStream?: boolean;
  refreshInterval?: number;
} = {}) {
  const { enableStream = true, refreshInterval = 10000 } = options;
  
  const { data: snapshot, loading, error, lastRefresh, refetch } = useHealthSummary(refreshInterval);
  const { delta, connected, connect, disconnect } = useHealthStream();
  
  // Merged health data (snapshot + delta)
  const [mergedData, setMergedData] = useState<HealthSummary | null>(null);

  // Merge snapshot with delta updates
  useEffect(() => {
    if (!snapshot) {
      setMergedData(null);
      return;
    }

    if (!delta) {
      setMergedData(snapshot);
      return;
    }

    // Merge delta into snapshot
    const merged: HealthSummary = {
      ...snapshot,
      ts: delta.ts,
      overall: delta.overall ?? snapshot.overall,
      errors: delta.errors ?? snapshot.errors,
      pipeline: delta.pipeline ?? snapshot.pipeline,
      kafka: delta.kafka ?? snapshot.kafka,
      redis: delta.redis ?? snapshot.redis,
      clickhouse: delta.clickhouse ?? snapshot.clickhouse,
      services: delta.services ?? snapshot.services,
    };

    setMergedData(merged);
  }, [snapshot, delta]);

  // Auto-connect to stream when enabled
  useEffect(() => {
    if (enableStream && snapshot) {
      connect();
    } else {
      disconnect();
    }
  }, [enableStream, snapshot, connect, disconnect]);

  return {
    data: mergedData,
    snapshot,
    delta,
    loading,
    error,
    lastRefresh,
    connected,
    refetch,
    toggleStream: enableStream ? disconnect : connect,
    streamEnabled: enableStream && connected,
  };
}
