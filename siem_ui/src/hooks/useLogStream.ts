import { useState, useEffect, useCallback, useRef } from 'react';
import { Event, EventSearchRequest, EventSearchResponse } from '../types/events';
import { useEventFilters } from '../stores/eventFiltersStore';
import { useAuth } from './useAuth';
import { useAuthStore } from '../stores/authStore';

// Extended EventSource interface to include our custom properties
interface ExtendedEventSource extends EventSource {
  _connectionCheck?: NodeJS.Timeout | number;
}

interface UseLogStreamResult {
  events: Event[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  hasMore: boolean;
  refresh: () => void;
  isStreaming: boolean;
}

interface UseLogStreamOptions {
  liveMode?: boolean;
}

export const useLogStream = (options: UseLogStreamOptions = {}): UseLogStreamResult => {
  const { liveMode = false } = options;
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Get filters from store directly in searchEvents to avoid dependency issues
  const { token } = useAuth();
  const { accessToken } = useAuthStore();
  
  // Watch for filter changes
  const { filters, timeRange, freeText } = useEventFilters();
  const filtersRef = useRef(filters);
  const timeRangeRef = useRef(timeRange);
  const freeTextRef = useRef(freeText);
  const eventSourceRef = useRef<ExtendedEventSource | null>(null);
  const isStreamingRef = useRef(false);
  const isRefreshingRef = useRef(false);

  const searchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Get current filters from store to avoid dependency issues
      const currentFilters = useEventFilters.getState().filters;
      const currentTimeRange = useEventFilters.getState().timeRange;
      const currentFreeText = useEventFilters.getState().freeText;
      const currentSortConfig = useEventFilters.getState().sortConfig;
      
      const searchRequest: EventSearchRequest = {
        time_range: currentTimeRange || undefined,
        free_text: currentFreeText || undefined,
        filters: currentFilters.length > 0 ? currentFilters : undefined,
        sort: currentSortConfig,
        limit: 200,
        offset: 0
      };

      // In development mode, API bypasses authentication
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      // Add auth header if token is available (prioritize accessToken from auth store)
      const authToken = accessToken || token;
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:8084'}/api/v1/events/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify(searchRequest)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Search failed: ${response.status} ${errorText}`);
      }

      const data: EventSearchResponse = await response.json();
      
      console.log('Search API Response:', {
        eventsCount: data.events.length,
        totalCount: data.total_count,
        hasMore: data.has_more,
        firstEvent: data.events[0],
        lastEvent: data.events[data.events.length - 1]
      });
      
      setEvents(data.events);
      setTotalCount(data.total_count);
      setHasMore(data.has_more);
      
      console.log('Events set in state:', data.events.length);
    } catch (err) {
      console.error('Error searching events:', err);
      setError(err instanceof Error ? err.message : 'Failed to search events');
      setEvents([]);
      setTotalCount(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [accessToken, token]);

  const startEventStream = useCallback(() => {
    if (isStreamingRef.current || eventSourceRef.current) {
      console.log('EventSource already active, skipping start');
      return;
    }

    console.log('Starting real-time event stream...');
    isStreamingRef.current = true;

    // Close existing connection if any
    if (eventSourceRef.current && (eventSourceRef.current as EventSource).readyState !== EventSource.CLOSED) {
      (eventSourceRef.current as EventSource).close();
    }
    eventSourceRef.current = null;

    // Get access token from auth store
    const { accessToken } = useAuthStore.getState();
    const authToken = accessToken || token || 'demo-access-token'; // fallback for demo

    // Create EventSource with authorization header
    const url = new URL(`${import.meta.env.VITE_API_BASE || 'http://localhost:8084'}/api/v1/events/stream`);
    
    // For EventSource, we need to pass the token as a query parameter since we can't set headers
    url.searchParams.set('token', authToken);

    const eventSource = new EventSource(url.toString()) as ExtendedEventSource;
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle different message types
        if (data.type === 'heartbeat') {
          // Just a heartbeat, no action needed
          return;
        }
        
        if (data.type === 'error') {
          console.error('Stream error:', data.message);
          setError(data.message);
          return;
        }

        // Handle new events array
        if (Array.isArray(data) && data.length > 0) {
          console.log(`Received ${data.length} new events via stream`);
          setEvents(prevEvents => {
            // Add new events to the beginning and remove duplicates
            const newEventIds = new Set(data.map((e: Event) => e.event_id));
            const filteredPrevEvents = prevEvents.filter(e => !newEventIds.has(e.event_id));
            return [...data, ...filteredPrevEvents];
          });
          setTotalCount(prev => prev + data.length);
        }
      } catch (err) {
        console.error('Error parsing stream data:', err);
      }
    };

    eventSource.onerror = (error) => {
      console.error('EventSource error:', error);
      
      // Don't set error state for aborted connections during refresh
      if (!isRefreshingRef.current) {
        setError('Real-time stream connection failed');
      }
      
      isStreamingRef.current = false;
      setIsStreaming(false);
      
      // Close the current connection to prevent multiple connections
      if (eventSourceRef.current === eventSource) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      // Don't auto-reconnect during refresh operations
      if (!isRefreshingRef.current) {
        // Only attempt to reconnect if we're still supposed to be streaming
        // and after a longer delay to prevent rapid reconnection attempts
        setTimeout(() => {
          if (!isStreamingRef.current && eventSourceRef.current === null && !isRefreshingRef.current) {
            console.log('Attempting to reconnect EventSource...');
            startEventStream();
          }
        }, 15000); // Increased to 15 seconds
      }
    };

    eventSource.onopen = () => {
      console.log('Real-time event stream connected');
      setError(null);
      isStreamingRef.current = true;
      setIsStreaming(true);
    };

    // Add readyState monitoring
    const checkConnection = () => {
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('EventSource connection closed');
        isStreamingRef.current = false;
        if (eventSourceRef.current === eventSource) {
          eventSourceRef.current = null;
        }
      }
    };
    
    // Check connection state periodically
    const connectionCheck = setInterval(checkConnection, 5000);
    
    // Store the interval ID to clean it up later
    eventSource._connectionCheck = connectionCheck;
  }, []);

  const stopEventStream = useCallback(() => {
    const currentEventSource = eventSourceRef.current;
    if (currentEventSource) {
      console.log('Stopping real-time event stream...');
      
      // Clean up connection check interval
      if (currentEventSource._connectionCheck) {
        clearInterval(currentEventSource._connectionCheck);
      }
      
      // Only close if not already closed to prevent errors
      if (currentEventSource.readyState !== EventSource.CLOSED) {
        currentEventSource.close();
      }
      
      // Remove event listeners to prevent memory leaks
      currentEventSource.onmessage = null;
      currentEventSource.onerror = null;
      currentEventSource.onopen = null;
      
      eventSourceRef.current = null;
    }
    
    // Always reset the streaming flag
    isStreamingRef.current = false;
    setIsStreaming(false);
  }, []);

  // Watch for filter changes and trigger search
  useEffect(() => {
    const filtersChanged = JSON.stringify(filters) !== JSON.stringify(filtersRef.current);
    const timeRangeChanged = timeRange !== timeRangeRef.current;
    const freeTextChanged = freeText !== freeTextRef.current;
    
    if (filtersChanged || timeRangeChanged || freeTextChanged) {
      // Update refs
      filtersRef.current = filters;
      timeRangeRef.current = timeRange;
      freeTextRef.current = freeText;
      
      // Stop existing stream when filters change
      stopEventStream();
      
      // Perform search with new filters
      searchEvents().then(() => {
        // Start real-time stream after search only if in live mode
        if (liveMode) {
          setTimeout(() => startEventStream(), 1000);
        }
      });
    }
  }, [filters, timeRange, freeText, liveMode]);
  
  // Initial search on mount
  useEffect(() => {
    searchEvents().then(() => {
      if (liveMode) {
        setTimeout(() => startEventStream(), 1000);
      }
    });
  }, []); // Only run on mount

  // Handle live mode changes
  useEffect(() => {
    if (liveMode && !isStreamingRef.current) {
      // Start streaming when live mode is enabled
      setTimeout(() => startEventStream(), 500);
    } else if (!liveMode && isStreamingRef.current) {
      // Stop streaming when live mode is disabled
      stopEventStream();
    }
  }, [liveMode]); // Removed problematic dependencies

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopEventStream();
    };
  }, []); // No dependencies needed for cleanup

  return {
    events,
    loading,
    error,
    totalCount,
    hasMore,
    isStreaming,
    refresh: () => {
      // Prevent multiple refresh operations
      if (isRefreshingRef.current) {
        console.log('Refresh already in progress, skipping');
        return;
      }
      
      isRefreshingRef.current = true;
      console.log('Starting refresh operation');
      
      // Stop the stream completely
      stopEventStream();
      
      // Clear any existing error state
      setError(null);
      
      // Wait for EventSource to be fully closed before proceeding
      const waitForClosure = () => {
        return new Promise<void>((resolve) => {
          const checkClosure = () => {
            if (!eventSourceRef.current) {
              resolve();
            } else {
              setTimeout(checkClosure, 200);
            }
          };
          setTimeout(checkClosure, 500); // Initial delay
        });
      };
      
      // Perform search and restart stream with proper sequencing
      waitForClosure().then(() => {
        console.log('EventSource closed, performing search...');
        return searchEvents();
      }).then(() => {
        console.log('Search completed, waiting before restart...');
        // Wait additional time to ensure clean state
        return new Promise<void>((resolve) => {
          setTimeout(resolve, 2000); // Increased delay
        });
      }).then(() => {
        console.log('Restarting EventSource...');
        // Double-check that we're not already streaming before starting
        if (!isStreamingRef.current && !eventSourceRef.current) {
          startEventStream();
        }
        isRefreshingRef.current = false;
        console.log('Refresh operation completed');
      }).catch((err) => {
        console.error('Error during refresh:', err);
        setError('Failed to refresh events');
        isRefreshingRef.current = false;
      });
    }
  };
};