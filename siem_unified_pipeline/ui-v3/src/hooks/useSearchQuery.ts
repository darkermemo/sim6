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
  allowAutoWiden?: boolean;
}

export function useSearchQuery(
  query: string,
  tenantId: string,
  timeRangeSeconds: number,
  facetFilters: Record<string, string[]> = {},
  options: UseSearchQueryOptions = {}
) {
  const { debounceMs = 250, autoExecute = true, allowAutoWiden = true } = options; // auto-widen enabled by default
  
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

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Notice to inform users when we expanded time automatically
  const widenedNoticeRef = useRef<{ from: number; to: number } | null>(null);

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
  const executeOnce = useCallback(async (
    effectiveTimeRange: number,
    finalQuery: string,
    limit: number,
    offset: number
  ) => {
    const [eventsResult, facetsResult, timelineResult, sqlResult] = await Promise.allSettled([
      searchEvents({
        search: finalQuery || '',
        tenant_id: tenantId,
        time_range_seconds: effectiveTimeRange,
        limit,
        offset
      }),
      searchFacets(finalQuery || '', [
        { field: 'severity', size: 8 },
        { field: 'source_type', size: 10 },
        { field: 'host', size: 8 },
        { field: 'vendor', size: 6 },
        { field: 'event_type', size: 8 }
      ], tenantId, effectiveTimeRange),
      searchAggs(finalQuery || '', tenantId, effectiveTimeRange),
      finalQuery ? compileSearch(finalQuery, tenantId) : Promise.resolve({ sql: '' })
    ]);

    return { eventsResult, facetsResult, timelineResult, sqlResult } as const;
  }, [tenantId]);

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
      // Attempt with current time window; widen progressively if empty and allowed
      const widenSteps = [timeRangeSeconds, 604800, 2592000] // 48h, 7d, 30d
        .filter((v, i, a) => a.indexOf(v) === i);

      let usedTime = timeRangeSeconds;
      let resultBundle = await executeOnce(usedTime, finalQuery, limit, offset);

      const getCount = () => {
        if (resultBundle.eventsResult.status !== 'fulfilled' || !resultBundle.eventsResult.value) return 0;
        const ev = resultBundle.eventsResult.value;
        return ev.total_count || ev.events?.length || 0;
      };

      let count = getCount();
      if (count === 0 && allowAutoWiden) {
        for (const candidate of widenSteps) {
          if (candidate <= usedTime) continue;
          const widened = await executeOnce(candidate, finalQuery, limit, offset);
          // if wider returns something, adopt it
          const prevBundle = resultBundle;
          resultBundle = widened;
          usedTime = candidate;
          count = getCount();
          if (count > 0) {
            widenedNoticeRef.current = { from: timeRangeSeconds, to: candidate };
            break;
          } else {
            // keep notice only if we actually changed, but no results yet
            widenedNoticeRef.current = { from: timeRangeSeconds, to: candidate };
          }
        }
      } else {
        widenedNoticeRef.current = null;
      }

      setState(prev => ({
        ...prev,
        loading: false,
        results: {
          events: resultBundle.eventsResult.status === 'fulfilled' ? resultBundle.eventsResult.value : null,
          facets: resultBundle.facetsResult.status === 'fulfilled' ? resultBundle.facetsResult.value : null,
          timeline: resultBundle.timelineResult.status === 'fulfilled' ? resultBundle.timelineResult.value : null,
          sql: resultBundle.sqlResult.status === 'fulfilled' ? resultBundle.sqlResult.value.sql : null
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
  }, [buildQuery, tenantId, timeRangeSeconds, allowAutoWiden, executeOnce]);

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
    isIdle: !state.loading && !state.results.events,
    widenedNotice: widenedNoticeRef.current
  };
}
