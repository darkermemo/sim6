import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useAuth } from './useAuth';
import {
  RedisEventFrame,
  SSEEventData,
  EventFilters,
  EventDetailResponse,
} from '../types/api';
import { RedisEventFrameSchema } from '../schemas/api-validation';
import { camelcaseKeys } from '../utils/camelcase-keys';

interface UseLiveEventsOptions {
  filters?: EventFilters;
  enabled?: boolean;
  autoReconnect?: boolean;
  heartbeatTimeout?: number;
}

interface UseLiveEventsResult {
  events: EventDetailResponse[];
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connectionCount: number;
  lastEventTime: string | null;
  connect: () => void;
  disconnect: () => void;
  clearEvents: () => void;
}

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8084';
const DEFAULT_HEARTBEAT_TIMEOUT = 30000; // 30 seconds
const RECONNECT_DELAY = 5000; // 5 seconds
const MAX_EVENTS_BUFFER = 1000; // Keep last 1000 events

export const useLiveEvents = (options: UseLiveEventsOptions = {}): UseLiveEventsResult => {
  const {
    filters,
    enabled = true,
    autoReconnect = true,
    heartbeatTimeout = DEFAULT_HEARTBEAT_TIMEOUT,
  } = options;

  const { accessToken } = useAuthStore();
  const { token } = useAuth();
  
  const [events, setEvents] = useState<EventDetailResponse[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionCount, setConnectionCount] = useState(0);
  const [lastEventTime, setLastEventTime] = useState<string | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isManuallyDisconnectedRef = useRef(false);

  // Performance monitoring
  const performanceMarkStart = useCallback((eventId: string) => {
    if (typeof window !== 'undefined' && window.performance) {
      window.performance.mark(`sse-event-start-${eventId}`);
    }
  }, []);

  const performanceMarkEnd = useCallback((eventId: string) => {
    if (typeof window !== 'undefined' && window.performance) {
      window.performance.mark(`sse-event-end-${eventId}`);
      try {
        window.performance.measure(
          `sse-event-latency-${eventId}`,
          `sse-event-start-${eventId}`,
          `sse-event-end-${eventId}`
        );
      } catch (e) {
        // Ignore measurement errors
      }
    }
  }, []);

  const resetHeartbeatTimeout = useCallback(() => {
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
    }
    
    heartbeatTimeoutRef.current = setTimeout(() => {
      console.warn('SSE heartbeat timeout - connection may be stale');
      setError('Connection timeout - no heartbeat received');
      if (autoReconnect && !isManuallyDisconnectedRef.current) {
        disconnect();
        setTimeout(connect, RECONNECT_DELAY);
      }
    }, heartbeatTimeout);
  }, [heartbeatTimeout, autoReconnect]);

  const connect = useCallback(() => {
    if (eventSourceRef.current || isConnecting || !enabled) {
      return;
    }

    setIsConnecting(true);
    setError(null);
    isManuallyDisconnectedRef.current = false;

    try {
      const authToken = accessToken || token;
      if (!authToken) {
        throw new Error('No authentication token available');
      }

      // Build URL with query parameters
      const url = new URL(`${API_BASE}/api/v1/events/stream`);
      url.searchParams.set('token', authToken);
      
      // Add filters as query parameters
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
          }
        });
      }

      performanceMarkStart('connection');
      const eventSource = new EventSource(url.toString());
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('SSE connection opened');
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        setConnectionCount(prev => prev + 1);
        performanceMarkEnd('connection');
        resetHeartbeatTimeout();
      };

      eventSource.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data);
          const sseData = camelcaseKeys(rawData) as SSEEventData;
          
          resetHeartbeatTimeout();
          
          if (sseData.type === 'heartbeat') {
            // Just reset the timeout, no other action needed
            return;
          }
          
          if (sseData.type === 'error') {
            const errorData = sseData.data as { error: string };
            console.error('SSE error:', errorData.error);
            setError(errorData.error);
            return;
          }
          
          if (sseData.type === 'event') {
            const eventFrame = sseData.data as RedisEventFrame;
            
            // Validate the event frame
            try {
              const validatedFrame = RedisEventFrameSchema.parse(eventFrame);
              const eventId = validatedFrame.eventData.id;
              
              performanceMarkStart(eventId);
              
              setEvents(prevEvents => {
                // Add new event to the beginning and limit buffer size
                const newEvents = [validatedFrame.eventData, ...prevEvents];
                return newEvents.slice(0, MAX_EVENTS_BUFFER);
              });
              
              setLastEventTime(validatedFrame.timestamp);
              performanceMarkEnd(eventId);
              
            } catch (validationError) {
              console.warn('Invalid event frame received:', validationError);
            }
          }
          
        } catch (parseError) {
          console.error('Error parsing SSE message:', parseError);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        setIsConnected(false);
        setIsConnecting(false);
        
        if (!isManuallyDisconnectedRef.current) {
          setError('Connection lost');
          
          if (autoReconnect) {
            console.log(`Attempting to reconnect in ${RECONNECT_DELAY}ms...`);
            reconnectTimeoutRef.current = setTimeout(() => {
              if (!isManuallyDisconnectedRef.current) {
                connect();
              }
            }, RECONNECT_DELAY);
          }
        }
      };
      
    } catch (err) {
      console.error('Failed to create SSE connection:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setIsConnecting(false);
    }
  }, [accessToken, token, filters, enabled, autoReconnect, resetHeartbeatTimeout, performanceMarkStart, performanceMarkEnd]);

  const disconnect = useCallback(() => {
    isManuallyDisconnectedRef.current = true;
    
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    setIsConnected(false);
    setIsConnecting(false);
    setError(null);
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
    setLastEventTime(null);
  }, []);

  // Auto-connect when enabled
  useEffect(() => {
    if (enabled && !eventSourceRef.current && !isConnecting) {
      connect();
    } else if (!enabled && eventSourceRef.current) {
      disconnect();
    }
  }, [enabled, connect, disconnect, isConnecting]);

  // Reconnect when filters change
  useEffect(() => {
    if (eventSourceRef.current && enabled) {
      disconnect();
      // Small delay to ensure clean disconnection
      setTimeout(connect, 500);
    }
  }, [filters]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    events,
    isConnected,
    isConnecting,
    error,
    connectionCount,
    lastEventTime,
    connect,
    disconnect,
    clearEvents,
  };
};