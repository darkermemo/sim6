import { useEffect, useRef, useState, useCallback } from 'react';
import { EventSearchRequest } from '../types/events';

interface UseEventStreamOptions {
  filters?: EventSearchRequest;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  baseReconnectDelay?: number;
}

interface EventStreamState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  reconnectAttempts: number;
}

export const useEventStream = ({
  filters = {},
  autoReconnect = true,
  maxReconnectAttempts = 10,
  baseReconnectDelay = 1000,
}: UseEventStreamOptions = {}) => {
  const [state, setState] = useState<EventStreamState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    reconnectAttempts: 0,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onEventRef = useRef<((event: any) => void) | null>(null);

  const buildUrl = useCallback(() => {
    const baseUrl = `${import.meta.env.VITE_API_BASE}/api/v1/events/stream`;
    const params = new URLSearchParams();
    
    if (filters.free_text) params.append('query', filters.free_text);
    if (filters.time_range?.start_unix) params.append('start_time', filters.time_range.start_unix.toString());
    if (filters.time_range?.end_unix) params.append('end_time', filters.time_range.end_unix.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.offset) params.append('offset', filters.offset.toString());
    if (filters.sort?.field) params.append('sort_by', filters.sort.field);
    if (filters.sort?.direction) params.append('sort_order', filters.sort.direction);
    
    return params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
  }, [filters]);

  const calculateReconnectDelay = useCallback((attempt: number) => {
    // Exponential backoff with jitter
    const delay = Math.min(baseReconnectDelay * Math.pow(2, attempt), 30000);
    const jitter = Math.random() * 0.1 * delay;
    return delay + jitter;
  }, [baseReconnectDelay]);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (eventSourceRef.current?.readyState === EventSource.OPEN) {
      return;
    }

    cleanup();
    
    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      const url = buildUrl();
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setState(prev => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
          error: null,
          reconnectAttempts: 0,
        }));
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onEventRef.current?.(data);
        } catch (error) {
          console.error('Failed to parse event data:', error);
        }
      };

      eventSource.onerror = () => {
        setState(prev => ({
          ...prev,
          isConnected: false,
          isConnecting: false,
          error: 'Connection failed',
        }));

        if (autoReconnect && state.reconnectAttempts < maxReconnectAttempts) {
          const delay = calculateReconnectDelay(state.reconnectAttempts);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            setState(prev => ({
              ...prev,
              reconnectAttempts: prev.reconnectAttempts + 1,
            }));
            connect();
          }, delay);
        }
      };

      // Handle custom error events
      eventSource.addEventListener('error', (event: any) => {
        try {
          const errorData = JSON.parse(event.data);
          setState(prev => ({ ...prev, error: errorData.error }));
        } catch {
          // Ignore parsing errors for error events
        }
      });

    } catch (error) {
      setState(prev => ({
        ...prev,
        isConnected: false,
        isConnecting: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [buildUrl, autoReconnect, maxReconnectAttempts, calculateReconnectDelay, cleanup, state.reconnectAttempts]);

  const disconnect = useCallback(() => {
    cleanup();
    setState({
      isConnected: false,
      isConnecting: false,
      error: null,
      reconnectAttempts: 0,
    });
  }, [cleanup]);

  const setOnEvent = useCallback((callback: (event: any) => void) => {
    onEventRef.current = callback;
  }, []);

  // Auto-connect on mount and filter changes
  useEffect(() => {
    connect();
    return cleanup;
  }, [connect, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    ...state,
    connect,
    disconnect,
    setOnEvent,
  };
};

export default useEventStream;