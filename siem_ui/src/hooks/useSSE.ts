import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { mutate } from 'swr';
import type { SSEEvent, AlertNote } from '@/types/api';

interface UseSSEOptions {
  enabled?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

/**
 * Hook for Server-Sent Events connection
 * Handles real-time updates for alert notes
 */
export function useSSE(
  url: string | null, 
  alertId: string | null,
  options: UseSSEOptions = {}
) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const { enabled = true, onConnect, onDisconnect, onError } = options;

  // Memoize the callbacks to prevent infinite re-renders
  const stableOnConnect = useCallback(() => {
    onConnect?.();
  }, [onConnect]);

  const stableOnDisconnect = useCallback(() => {
    onDisconnect?.();
  }, [onDisconnect]);

  const stableOnError = useCallback((event: Event) => {
    onError?.(event);
  }, [onError]);

  useEffect(() => {
    if (!url || !alertId || !enabled) {
      return;
    }

    // Create EventSource connection
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
      stableOnConnect();
    };

    eventSource.onmessage = (event) => {
      try {
        const data: SSEEvent = JSON.parse(event.data);
        handleSSEMessage(data, alertId);
      } catch (err) {
        console.error('Failed to parse SSE message:', err);
      }
    };

    eventSource.onerror = (event) => {
      setIsConnected(false);
      setError('Connection lost');
      stableOnError(event);
    };

    // Cleanup function
    return () => {
      if (eventSource.readyState !== EventSource.CLOSED) {
        eventSource.close();
      }
      setIsConnected(false);
      stableOnDisconnect();
    };
  }, [url, alertId, enabled, stableOnConnect, stableOnDisconnect, stableOnError]);

  return {
    /** Whether SSE connection is active */
    isConnected,
    /** Error message if connection failed */
    error,
    /** Manually close the connection */
    disconnect: () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        setIsConnected(false);
      }
    },
  };
}

/**
 * Handle incoming SSE messages
 */
function handleSSEMessage(data: SSEEvent, alertId: string) {
  switch (data.type) {
    case 'note':
      if (data.payload) {
        // Update the notes cache with new note
        mutate(
          ['alert-notes', alertId],
          (currentNotes: AlertNote[] = []) => {
            // Check if note already exists (avoid duplicates)
            const exists = currentNotes.some(
              note => note.note_id === data.payload!.note_id
            );
            
            if (!exists) {
              const newNote: AlertNote = {
                note_id: data.payload!.note_id,
                alert_id: alertId,
                tenant_id: data.payload!.tenant_id || '',
                author: data.payload!.author,
                content: data.payload!.content,
                created_at: Math.floor(new Date(data.payload!.created_at).getTime() / 1000),
              };
              return [newNote, ...currentNotes];
            }
            
            return currentNotes;
          },
          { revalidate: false }
        );
      }
      break;
    
    case 'heartbeat':
      // Just a keep-alive message, no action needed
      break;
    
    default:
      console.log('Unknown SSE message type:', data.type);
  }
}

/**
 * Hook specifically for alert notes SSE
 */
export function useAlertNotesSSE(alertId: string | null, enabled = true) {
  const sseUrl = useMemo(() => {
    return alertId && enabled 
      ? `${import.meta.env.VITE_API_BASE || 'http://localhost:8090'}/api/v1/alerts/${alertId}/notes/stream`
      : null;
  }, [alertId, enabled]);

  return useSSE(sseUrl, alertId, { enabled });
}