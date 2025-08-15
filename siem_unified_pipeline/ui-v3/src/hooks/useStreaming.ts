'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { EventSearchResponse } from '@/types/api';

export interface StreamingState {
  isStreaming: boolean;
  isConnected: boolean;
  error: string | null;
  eventCount: number;
  lastUpdate: Date | null;
}

export interface UseStreamingOptions {
  fallbackInterval?: number; // Polling interval in ms when SSE unavailable
  reconnectAttempts?: number;
  reconnectDelay?: number;
  maxBufferSize?: number; // Cap streaming buffer size
}

export function useStreaming(
  query: string,
  tenantId: string,
  timeRangeSeconds: number,
  onNewEvents: (events: any[]) => void,
  options: UseStreamingOptions = {}
) {
  const {
    fallbackInterval = 2500, // 2-3s as per spec
    reconnectAttempts = 3,
    reconnectDelay = 2000,
    maxBufferSize = 2000 // Cap list at 2k rows as per spec
  } = options;

  const [state, setState] = useState<StreamingState>({
    isStreaming: false,
    isConnected: false,
    error: null,
    eventCount: 0,
    lastUpdate: null
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Build SSE URL
  const buildStreamUrl = useCallback(() => {
    const basePath = process.env.NEXT_PUBLIC_BASEPATH || '';
    const params = new URLSearchParams({
      tenant_id: tenantId,
      last_seconds: timeRangeSeconds.toString(),
      q: query || ''
    });
    return `${basePath}/api/v2/search/tail?${params.toString()}`;
  }, [query, tenantId, timeRangeSeconds]);

  // Start SSE streaming
  const startSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const streamUrl = buildStreamUrl();
    const eventSource = new EventSource(streamUrl);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setState(prev => ({
        ...prev,
        isConnected: true,
        error: null
      }));
      reconnectCountRef.current = 0;
    };

    eventSource.onmessage = (event) => {
      try {
        // Handle SSE event format: event: "row" with data: {...row}
        if (event.type === 'row' || !event.type) {
          const rowData = JSON.parse(event.data);
          // Append new events to the top, cap at maxBufferSize
          onNewEvents([rowData]);
          setState(prev => ({
            ...prev,
            eventCount: prev.eventCount + 1,
            lastUpdate: new Date(),
            error: null
          }));
        }
      } catch (error) {
        console.warn('Failed to parse SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.warn('SSE error:', error);
      setState(prev => ({
        ...prev,
        isConnected: false,
        error: 'Connection lost'
      }));

      // Attempt reconnection
      if (reconnectCountRef.current < reconnectAttempts) {
        reconnectCountRef.current++;
        reconnectTimerRef.current = setTimeout(() => {
          startSSE();
        }, reconnectDelay);
      } else {
        // Fall back to polling
        setState(prev => ({
          ...prev,
          error: 'SSE unavailable, using polling fallback'
        }));
        startPolling();
      }
    };
  }, [buildStreamUrl, onNewEvents, reconnectAttempts, reconnectDelay]);

  // Start polling fallback
  const startPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
    }

    // Import searchEvents here to avoid circular dependency
    import('@/lib/api').then(({ searchEvents }) => {
      pollingTimerRef.current = setInterval(async () => {
        try {
          const result = await searchEvents({
            tenant_id: tenantId,
            time_range_seconds: timeRangeSeconds,
            search: query || "*",
            limit: 10, // Small limit for streaming updates
            offset: 0 // Always offset 0 for polling as per spec
          });

          if (result.events.length > 0) {
            // Use de-dup window on _id as per spec
            const uniqueEvents = result.events.filter((event, index, self) => 
              index === self.findIndex(e => e.id === event.id)
            );
            
            if (uniqueEvents.length > 0) {
              onNewEvents(uniqueEvents);
              setState(prev => ({
                ...prev,
                eventCount: prev.eventCount + uniqueEvents.length,
                lastUpdate: new Date(),
                error: null
              }));
            }
          }
        } catch (error) {
          console.warn('Polling error:', error);
          setState(prev => ({
            ...prev,
            error: 'Polling failed'
          }));
        }
      }, fallbackInterval);
    });
  }, [query, tenantId, timeRangeSeconds, onNewEvents, fallbackInterval]);

  // Start streaming
  const start = useCallback(() => {
    setState(prev => ({
      ...prev,
      isStreaming: true,
      eventCount: 0,
      lastUpdate: null
    }));

    // Try SSE first, fall back to polling if it fails
    startSSE();
  }, [startSSE]);

  // Stop streaming
  const stop = useCallback(() => {
    setState(prev => ({
      ...prev,
      isStreaming: false,
      isConnected: false
    }));

    // Clean up SSE
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Clean up polling
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }

    // Clean up reconnect timer
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    reconnectCountRef.current = 0;
  }, []);

  // Toggle streaming
  const toggle = useCallback(() => {
    if (state.isStreaming) {
      stop();
    } else {
      start();
    }
  }, [state.isStreaming, start, stop]);

  // Cleanup on unmount or dependency changes
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  // Restart streaming when parameters change
  useEffect(() => {
    if (state.isStreaming) {
      stop();
      // Small delay to ensure cleanup is complete
      setTimeout(start, 100);
    }
  }, [query, tenantId, timeRangeSeconds]);

  return {
    ...state,
    start,
    stop,
    toggle
  };
}
