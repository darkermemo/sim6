'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { searchEvents, compileSearch, searchFacets, searchAggs } from '@/lib/api';
import { EventSearchQuery, EventSearchResponse } from '@/types/api';

export interface SearchResults {
  events: EventSearchResponse | null;
  facets: any;
  timeline: any;
  sql: string | null;
}

export interface SearchState {
  loading: boolean;
  error: string | null;
  results: SearchResults;
}

export interface UseSearchQueryOptions {
  debounceMs?: number;
  autoExecute?: boolean;
}

export function useSearchQuery(
  query: string,
  tenantId: string,
  timeRangeSeconds: number,
  facetFilters: Record<string, string[]> = {},
  options: UseSearchQueryOptions = {}
) {
  const { debounceMs = 400, autoExecute = true } = options; // 400ms as per spec
  
  const [state, setState] = useState<SearchState>({
    loading: false,
    error: null,
    results: {
      events: null,
      facets: null,
      timeline: null,
      sql: null
    }
  });

  const debounceTimerRef = useRef<NodeJS.Timeout>();

  // Build final search query with facet filters
  const buildQuery = useCallback(() => {
    let finalQuery = query;
    Object.entries(facetFilters).forEach(([field, values]) => {
      values.forEach(value => {
        finalQuery += ` ${field}:${value}`;
      });
    });
    return finalQuery.trim();
  }, [query, facetFilters]);

  // Execute all search operations in parallel
  const executeSearch = useCallback(async (
    searchQuery?: string,
    limit: number = 100,
    offset: number = 0
  ) => {
    const finalQuery = searchQuery ?? buildQuery();
    
    setState(prev => ({ 
      ...prev, 
      loading: true, 
      error: null 
    }));

    try {
      // Prepare common request parameters
      const baseParams = {
        tenant_id: tenantId,
        time: { last_seconds: timeRangeSeconds },
        q: finalQuery || ''
      };

      // Execute all requests in parallel (as per spec: execute + aggs + facets)
      const [eventsResult, facetsResult, timelineResult, sqlResult] = await Promise.allSettled([
        // Events search
        searchEvents({
          search: finalQuery || "*", // Use "*" for initial load as per spec
          tenant_id: tenantId,
          time_range_seconds: timeRangeSeconds,
          limit,
          offset
        }),
        
        // Facets - always execute in parallel
        searchFacets(finalQuery || "*", [
          { field: 'severity', size: 8 },
          { field: 'source_type', size: 10 },
          { field: 'host', size: 8 },
          { field: 'vendor', size: 6 },
          { field: 'event_type', size: 8 }
        ], tenantId, timeRangeSeconds),
        
        // Timeline aggregations - always execute in parallel
        searchAggs(finalQuery || "*", tenantId, timeRangeSeconds),
        
        // SQL compilation (optional)
        finalQuery ? compileSearch(finalQuery, tenantId) : Promise.resolve({ sql: '' })
      ]);

      setState(prev => ({
        ...prev,
        loading: false,
        results: {
          events: eventsResult.status === 'fulfilled' ? eventsResult.value : null,
          facets: facetsResult.status === 'fulfilled' ? facetsResult.value : null,
          timeline: timelineResult.status === 'fulfilled' ? timelineResult.value : null,
          sql: sqlResult.status === 'fulfilled' ? sqlResult.value.sql : null
        }
      }));

    } catch (error) {
      console.error('Search execution error:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Search failed'
      }));
    }
  }, [buildQuery, tenantId, timeRangeSeconds]);

  // Debounced search execution
  const debouncedExecute = useCallback((
    searchQuery?: string,
    limit?: number,
    offset?: number
  ) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      executeSearch(searchQuery, limit, offset);
    }, debounceMs);
  }, [executeSearch, debounceMs]);

  // Auto-execute when dependencies change
  useEffect(() => {
    if (autoExecute) {
      debouncedExecute();
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, tenantId, timeRangeSeconds, facetFilters, autoExecute, debouncedExecute]);

  // Manual execution (immediate, no debounce)
  const execute = useCallback((limit?: number, offset?: number, overrideQ?: string) => {
    if (overrideQ && overrideQ.length) {
      executeSearch(overrideQ, limit, offset)
    } else {
      executeSearch(undefined, limit, offset);
    }
  }, [executeSearch]);

  // Clear results
  const clear = useCallback(() => {
    setState({
      loading: false,
      error: null,
      results: {
        events: null,
        facets: null,
        timeline: null,
        sql: null
      }
    });
  }, []);

  return {
    ...state,
    execute,
    clear,
    isIdle: !state.loading && !state.results.events
  };
}
