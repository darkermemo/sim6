'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export interface UrlSearchState {
  q: string;
  tenant_id: string;
  last_seconds: number;
  limit: number;
  offset: number;
  stream: boolean;
}

export interface UseUrlStateOptions {
  defaultValues?: Partial<UrlSearchState>;
  updateDelay?: number; // Debounce URL updates
}

const DEFAULT_STATE: UrlSearchState = {
  q: '*', // Use "*" for initial load as per spec
  tenant_id: 'default',
  last_seconds: 600, // 10 minutes as per spec
  limit: 100,
  offset: 0,
  stream: false
};

export function useUrlState(options: UseUrlStateOptions = {}) {
  const { defaultValues = {}, updateDelay = 300 } = options;
  const searchParams = useSearchParams();
  const router = useRouter();

  // Initialize state from URL params
  const [state, setState] = useState<UrlSearchState>(() => {
    const initialState = { ...DEFAULT_STATE, ...defaultValues };
    
    // Override with URL params if present
    return {
      q: searchParams.get('q') || initialState.q,
      tenant_id: searchParams.get('tenant_id') || initialState.tenant_id,
      last_seconds: parseInt(searchParams.get('last_seconds') || '') || initialState.last_seconds,
      limit: parseInt(searchParams.get('limit') || '') || initialState.limit,
      offset: parseInt(searchParams.get('offset') || '') || initialState.offset,
      stream: searchParams.get('stream') === 'on' || initialState.stream
    };
  });

  // Update URL when state changes
  const updateUrl = useCallback((newState: Partial<UrlSearchState>) => {
    const updatedState = { ...state, ...newState };
    const params = new URLSearchParams();

    // Only include non-default values in URL
    Object.entries(updatedState).forEach(([key, value]) => {
      const defaultValue = DEFAULT_STATE[key as keyof UrlSearchState];
      if (value !== defaultValue && value !== '' && value !== null && value !== undefined) {
        if (key === 'stream') {
          params.set(key, value ? 'on' : 'off');
        } else {
          params.set(key, value.toString());
        }
      }
    });

    const newUrl = params.toString() ? `/search?${params.toString()}` : '/search';
    router.push(newUrl, { scroll: false });
  }, [state, router]);

  // Debounced URL update
  const [updateTimer, setUpdateTimer] = useState<NodeJS.Timeout | null>(null);
  
  const debouncedUpdateUrl = useCallback((newState: Partial<UrlSearchState>) => {
    if (updateTimer) {
      clearTimeout(updateTimer);
    }

    const timer = setTimeout(() => {
      updateUrl(newState);
    }, updateDelay);
    
    setUpdateTimer(timer);
  }, [updateUrl, updateTimer, updateDelay]);

  // Update individual state properties
  const updateState = useCallback((updates: Partial<UrlSearchState>, immediate = false) => {
    setState(prev => {
      const newState = { ...prev, ...updates };
      
      // Update URL (debounced or immediate)
      if (immediate) {
        updateUrl(updates);
      } else {
        debouncedUpdateUrl(updates);
      }
      
      return newState;
    });
  }, [updateUrl, debouncedUpdateUrl]);

  // Individual setters for convenience
  const setQuery = useCallback((q: string) => {
    updateState({ q, offset: 0 }); // Reset offset when query changes
  }, [updateState]);

  const setTenantId = useCallback((tenant_id: string) => {
    updateState({ tenant_id, offset: 0 });
  }, [updateState]);

  const setTimeRange = useCallback((last_seconds: number) => {
    updateState({ last_seconds, offset: 0 });
  }, [updateState]);

  const setLimit = useCallback((limit: number) => {
    updateState({ limit, offset: 0 });
  }, [updateState]);

  const setOffset = useCallback((offset: number) => {
    updateState({ offset }, true); // Immediate update for pagination
  }, [updateState]);

  const setStreaming = useCallback((stream: boolean) => {
    updateState({ stream }, true);
  }, [updateState]);

  // Reset to defaults
  const reset = useCallback(() => {
    const resetState = { ...DEFAULT_STATE, ...defaultValues };
    setState(resetState);
    router.push('/search');
  }, [defaultValues, router]);

  // Go to next/previous page
  const nextPage = useCallback(() => {
    setOffset(state.offset + state.limit);
  }, [state.offset, state.limit, setOffset]);

  const previousPage = useCallback(() => {
    setOffset(Math.max(0, state.offset - state.limit));
  }, [state.offset, state.limit, setOffset]);

  // Sync with URL parameter changes (e.g., browser back/forward)
  useEffect(() => {
    const newState: UrlSearchState = {
      q: searchParams.get('q') || DEFAULT_STATE.q,
      tenant_id: searchParams.get('tenant_id') || DEFAULT_STATE.tenant_id,
      last_seconds: parseInt(searchParams.get('last_seconds') || '') || DEFAULT_STATE.last_seconds,
      limit: parseInt(searchParams.get('limit') || '') || DEFAULT_STATE.limit,
      offset: parseInt(searchParams.get('offset') || '') || DEFAULT_STATE.offset,
      stream: searchParams.get('stream') === 'on'
    };

    setState(newState);
  }, [searchParams]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (updateTimer) {
        clearTimeout(updateTimer);
      }
    };
  }, [updateTimer]);

  return {
    // Current state
    ...state,
    
    // Update functions
    updateState,
    setQuery,
    setTenantId,
    setTimeRange,
    setLimit,
    setOffset,
    setStreaming,
    
    // Utility functions
    reset,
    nextPage,
    previousPage,
    
    // Computed properties
    hasNext: true, // Would need total count to determine
    hasPrevious: state.offset > 0,
    currentPage: Math.floor(state.offset / state.limit) + 1
  };
}
