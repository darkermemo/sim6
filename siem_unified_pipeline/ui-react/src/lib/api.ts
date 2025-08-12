import { QueryClient } from '@tanstack/react-query';

// Type definitions for fetch API
interface RequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Blob | FormData | null;
  signal?: AbortSignal;
}

// Base API configuration
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v2';
const MAX_REQUEST_SIZE = 5 * 1024 * 1024; // 5 MiB

// Type-safe fetch wrapper
export async function apiFetch<T = unknown>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  // Check request body size
  if (options?.body) {
    const bodySize = typeof options.body === 'string' 
      ? new Blob([options.body]).size 
      : options.body instanceof Blob 
        ? options.body.size 
        : options.body instanceof FormData 
          ? Array.from(options.body.entries()).reduce((acc, [_, value]) => {
              return acc + (value instanceof File ? value.size : new Blob([String(value)]).size);
            }, 0)
          : 0;
    
    if (bodySize > MAX_REQUEST_SIZE) {
      throw new Error(`Request body exceeds 5 MiB limit (${(bodySize / 1024 / 1024).toFixed(2)} MiB)`);
    }
  }
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error: ${response.status} - ${error}`);
  }

  return response.json();
}

// Query client instance
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error instanceof Error && error.message?.includes('API Error: 4')) {
          return false;
        }
        // Up to 2 retries for idempotent GETs
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false, // No retries for mutations - we have backend idempotency
    },
  },
});