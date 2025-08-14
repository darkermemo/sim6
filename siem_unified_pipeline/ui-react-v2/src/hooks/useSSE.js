/**
 * useSSE - Server-Sent Events hook for real-time tail
 *
 * Features:
 * - Automatic reconnection on error
 * - Clean disconnect handling
 * - Never crashes page on SSE errors
 * - Proper cleanup on unmount
 * - Type-safe event handling
 */
import { useState, useEffect, useRef, useCallback } from 'react';
export function useSSE({ url, enabled = false, onMessage, onError, onOpen, onClose, reconnectInterval = 3000, maxReconnectAttempts = 5, }) {
    const [state, setState] = useState({
        connected: false,
        connecting: false,
        error: null,
        reconnectAttempts: 0,
    });
    const eventSourceRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const shouldReconnectRef = useRef(true);
    const disconnect = useCallback(() => {
        shouldReconnectRef.current = false;
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
        setState(prev => ({
            ...prev,
            connected: false,
            connecting: false,
        }));
        if (onClose) {
            onClose();
        }
    }, [onClose]);
    const connect = useCallback(() => {
        if (!enabled || !url) {
            disconnect();
            return;
        }
        if (eventSourceRef.current) {
            disconnect();
        }
        setState(prev => ({
            ...prev,
            connecting: true,
            error: null,
        }));
        try {
            const eventSource = new EventSource(url);
            eventSourceRef.current = eventSource;
            shouldReconnectRef.current = true;
            eventSource.onopen = () => {
                setState(prev => ({
                    ...prev,
                    connected: true,
                    connecting: false,
                    error: null,
                    reconnectAttempts: 0,
                }));
                if (onOpen) {
                    onOpen();
                }
            };
            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (onMessage) {
                        onMessage(data);
                    }
                }
                catch (err) {
                    console.warn('Failed to parse SSE message:', event.data);
                    if (onMessage) {
                        onMessage({ raw: event.data });
                    }
                }
            };
            eventSource.onerror = (error) => {
                console.warn('SSE error:', error);
                setState(prev => {
                    const newState = {
                        ...prev,
                        connected: false,
                        connecting: false,
                        error: 'Connection error',
                    };
                    // Auto-reconnect if enabled and within limits
                    if (shouldReconnectRef.current &&
                        enabled &&
                        prev.reconnectAttempts < maxReconnectAttempts) {
                        newState.reconnectAttempts = prev.reconnectAttempts + 1;
                        reconnectTimeoutRef.current = setTimeout(() => {
                            if (shouldReconnectRef.current) {
                                connect();
                            }
                        }, reconnectInterval);
                    }
                    return newState;
                });
                if (onError) {
                    onError(error);
                }
            };
        }
        catch (err) {
            console.error('Failed to create EventSource:', err);
            setState(prev => ({
                ...prev,
                connected: false,
                connecting: false,
                error: err instanceof Error ? err.message : 'Failed to connect',
            }));
        }
    }, [url, enabled, onMessage, onError, onOpen, reconnectInterval, maxReconnectAttempts, disconnect]);
    // Connect/disconnect based on enabled state
    useEffect(() => {
        if (enabled) {
            connect();
        }
        else {
            disconnect();
        }
        return disconnect;
    }, [enabled, connect, disconnect]);
    // Cleanup on unmount
    useEffect(() => {
        return () => {
            disconnect();
        };
    }, [disconnect]);
    return {
        ...state,
        connect,
        disconnect,
    };
}
export default useSSE;
