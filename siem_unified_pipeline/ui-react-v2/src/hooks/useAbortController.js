/**
 * useAbortController - Hook for canceling API requests
 *
 * Essential for preventing race conditions and improving performance:
 * - Cancel previous compile when user types fast
 * - Abort slow queries when new search starts
 * - Clean up on component unmount
 * - Prevent memory leaks
 */
import { useRef, useCallback, useEffect } from 'react';
export function useAbortController() {
    const abortControllerRef = useRef(null);
    const abort = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    }, []);
    const getSignal = useCallback(() => {
        // Abort any previous request
        abort();
        // Create new controller
        abortControllerRef.current = new AbortController();
        return abortControllerRef.current.signal;
    }, [abort]);
    // Cleanup on unmount
    useEffect(() => {
        return () => {
            abort();
        };
    }, [abort]);
    return { getSignal, abort };
}
export default useAbortController;
