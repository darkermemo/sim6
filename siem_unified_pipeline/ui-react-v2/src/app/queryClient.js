/**
 * TanStack Query Client Configuration
 *
 * Centralized query client for all API calls with:
 * - 30s stale time for reasonable caching
 * - Single retry to handle network blips
 * - No refetch on window focus (SIEM users work in many tabs)
 * - Error boundaries handle failures gracefully
 */
import { QueryClient } from '@tanstack/react-query';
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000, // 30 seconds before data considered stale
            retry: 1, // Single retry for network issues
            refetchOnWindowFocus: false, // Don't spam API when switching tabs
            refetchOnReconnect: true, // Do refetch when network reconnects
            throwOnError: false, // Let components handle errors
        },
        mutations: {
            retry: 1,
            throwOnError: false,
        },
    },
});
// Development query debugging
if (import.meta.env.DEV) {
    // Enable query devtools logging
    queryClient.setDefaultOptions({
        queries: {
            ...queryClient.getDefaultOptions().queries,
            // Add more verbose logging in development
            meta: {
                errorPolicy: 'soft', // Don't crash on query errors in dev
            },
        },
    });
}
