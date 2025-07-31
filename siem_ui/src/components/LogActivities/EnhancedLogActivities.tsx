/**
 * Enhanced Log Activities Component
 * High-performance search interface using ClickHouse backend
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { clickhouseSearchApi } from '@/services/clickhouseSearchApi';
import {
  SearchRequest,
  SearchFilter,
  FilterOperator,
  SortField,
  AggregationRequest,
  SearchUIState,
  Event,
} from '@/types/search';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';

interface EnhancedLogActivitiesProps {
  initialQuery?: string;
  initialTimeRange?: { start: Date; end: Date };
  initialFilters?: SearchFilter[];
  onEventSelect?: (event: Event) => void;
  height?: number;
}

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 1000;

export const EnhancedLogActivities: React.FC<EnhancedLogActivitiesProps> = ({
  initialQuery = '',
  initialTimeRange,
  initialFilters = [],
  onEventSelect,
  height = 800,
}) => {
  const { token } = useAuth();
  const [uiState, setUiState] = useState<SearchUIState>({
    isLoading: false,
    isStreaming: false,
    error: null,
    results: null,
    currentQuery: null,
    selectedEvents: [],
    viewMode: 'table',
    autoRefresh: false,
    refreshInterval: 30,
  });

  // Search state
  const [query, setQuery] = useState(initialQuery);
  const [timeRange, setTimeRange] = useState(initialTimeRange || {
    start: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
    end: new Date(),
  });
  const [filters, setFilters] = useState<SearchFilter[]>(initialFilters);
  const [sorting, setSorting] = useState<SortField[]>([{ field: 'event_timestamp', direction: 'desc' }]);
  const [pagination, setPagination] = useState({ offset: 0, limit: DEFAULT_PAGE_SIZE });
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [aggregations, setAggregations] = useState<AggregationRequest[]>([]);

  // UI state
  const [showFilters, setShowFilters] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; type: 'success' | 'error' | 'warning' | 'info' }>({ open: false, message: '', type: 'info' });

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);

  // Debounced search query
  const debouncedQuery = useDebounce(query, 500);

  // Set auth token when component mounts
  useEffect(() => {
    if (token) {
      clickhouseSearchApi.setAuthToken(token);
    }
  }, [token]);

  // Execute search when debounced query changes
  useEffect(() => {
    if (debouncedQuery !== initialQuery || filters.length > 0) {
      executeSearch();
    }
  }, [debouncedQuery, filters, timeRange, sorting, pagination]);

  // Build search request
  const buildSearchRequest = useCallback((): SearchRequest => {
    // Convert filters to match SearchRequest type
    const convertedFilters = filters.map(filter => ({
      ...filter,
      value: Array.isArray(filter.value) 
        ? filter.value.map(v => String(v))
        : String(filter.value)
    }));
    
    return clickhouseSearchApi.buildSearchRequest({
      query: query.trim() || undefined,
      timeRange,
      filters: convertedFilters,
      pagination,
      sorting,
      fields: selectedFields,
      aggregations,
      options: {
        enable_highlighting: true,
        enable_caching: true,
        enable_query_optimization: true,
        max_results: MAX_PAGE_SIZE,
        timeout_seconds: 60,
        include_raw_event: true,
        include_metadata: true,
      },
    });
  }, [query, timeRange, filters, pagination, sorting, selectedFields, aggregations]);

  // Execute search
  const executeSearch = useCallback(async (isRefresh = false) => {
    // Cancel any ongoing search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const searchRequest = buildSearchRequest();
    
    setUiState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      currentQuery: searchRequest,
    }));

    try {
      const response = await clickhouseSearchApi.search(searchRequest);
      
      setUiState(prev => ({
        ...prev,
        isLoading: false,
        results: response,
      }));

      if (isRefresh) {
        setSnackbar({
          open: true,
          message: `Refreshed: Found ${response.hits.length} events`,
          type: 'success',
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Search failed';
      setUiState(prev => ({
        ...prev,
        isLoading: false,
        error: {
          code: 'SEARCH_ERROR',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        },
      }));

      setSnackbar({
        open: true,
        message: `Search failed: ${errorMessage}`,
        type: 'error',
      });
    }
  }, [buildSearchRequest]);

  // Cancel search
  const cancelSearch = useCallback(() => {
    clickhouseSearchApi.cancelSearch();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setUiState(prev => ({ ...prev, isLoading: false, isStreaming: false }));
  }, []);

  // Handle event selection
  const handleEventSelect = useCallback((event: Event) => {
    setSelectedEvent(event);
    onEventSelect?.(event);
  }, [onEventSelect]);

  // Clear all filters and search
  const clearAll = useCallback(() => {
    setQuery('');
    setFilters([]);
    setTimeRange({
      start: new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: new Date(),
    });
    setPagination({ offset: 0, limit: DEFAULT_PAGE_SIZE });
    setSorting([{ field: 'event_timestamp', direction: 'desc' }]);
    setSelectedFields([]);
    setAggregations([]);
  }, []);

  // Format date for input
  const formatDateForInput = (date: Date): string => {
    return date.toISOString().slice(0, 16);
  };

  // Parse date from input
  const parseDateFromInput = (dateString: string): Date => {
    return new Date(dateString);
  };

  // Quick search helpers
  const quickSearches = useMemo(() => [
    {
      label: 'Security Events',
      action: () => {
        setQuery('event_category:security OR severity:high');
        setFilters([{ field: 'event_category', operator: 'equals' as FilterOperator, value: 'security' }]);
      },
    },
    {
      label: 'Failed Logins',
      action: () => {
        setQuery('event_action:login AND event_outcome:failure');
        setFilters([
          { field: 'event_action', operator: 'equals' as FilterOperator, value: 'login' },
          { field: 'event_outcome', operator: 'equals' as FilterOperator, value: 'failure' },
        ]);
      },
    },
    {
      label: 'Network Events',
      action: () => {
        setQuery('event_category:network');
        setFilters([{ field: 'event_category', operator: 'equals' as FilterOperator, value: 'network' }]);
      },
    },
    {
      label: 'Last Hour',
      action: () => {
        setTimeRange({
          start: new Date(Date.now() - 60 * 60 * 1000),
          end: new Date(),
        });
      },
    },
  ], []);

  const styles = {
    container: {
      height: `${height}px`,
      display: 'flex',
      flexDirection: 'column' as const,
      fontFamily: 'Arial, sans-serif',
    },
    card: {
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '16px',
      backgroundColor: '#fff',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    },
    searchBar: {
      width: '100%',
      padding: '12px',
      border: '1px solid #ccc',
      borderRadius: '4px',
      fontSize: '14px',
      marginBottom: '8px',
    },
    button: {
      padding: '8px 16px',
      margin: '4px',
      border: '1px solid #ccc',
      borderRadius: '4px',
      backgroundColor: '#f5f5f5',
      cursor: 'pointer',
      fontSize: '14px',
    },
    primaryButton: {
      padding: '8px 16px',
      margin: '4px',
      border: 'none',
      borderRadius: '4px',
      backgroundColor: '#1976d2',
      color: 'white',
      cursor: 'pointer',
      fontSize: '14px',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
      fontSize: '14px',
    },
    th: {
      padding: '12px',
      borderBottom: '2px solid #e0e0e0',
      textAlign: 'left' as const,
      backgroundColor: '#f5f5f5',
      fontWeight: 'bold',
    },
    td: {
      padding: '12px',
      borderBottom: '1px solid #e0e0e0',
    },
    chip: {
      display: 'inline-block',
      padding: '4px 8px',
      margin: '2px',
      backgroundColor: '#e3f2fd',
      border: '1px solid #2196f3',
      borderRadius: '16px',
      fontSize: '12px',
      color: '#1976d2',
    },
    errorAlert: {
      padding: '12px',
      backgroundColor: '#ffebee',
      border: '1px solid #f44336',
      borderRadius: '4px',
      color: '#c62828',
      marginBottom: '16px',
    },
    successAlert: {
      padding: '12px',
      backgroundColor: '#e8f5e8',
      border: '1px solid #4caf50',
      borderRadius: '4px',
      color: '#2e7d32',
      marginBottom: '16px',
    },
    loadingBar: {
      width: '100%',
      height: '4px',
      backgroundColor: '#e0e0e0',
      marginBottom: '16px',
      borderRadius: '2px',
      overflow: 'hidden',
    },
    loadingProgress: {
      height: '100%',
      backgroundColor: '#2196f3',
      animation: 'loading 1.5s ease-in-out infinite',
    },
  };

  return (
    <div style={styles.container}>
      <style>
        {`
          @keyframes loading {
            0% { transform: translateX(-100%); }
            50% { transform: translateX(0%); }
            100% { transform: translateX(100%); }
          }
        `}
      </style>

      {/* Header */}
      <div style={styles.card}>
        <h2 style={{ margin: '0 0 16px 0' }}>
          Log Activities - Enhanced Search
          {uiState.results && (
            <span style={styles.chip}>
              {uiState.results.hits.length} events
            </span>
          )}
        </h2>

        {/* Search Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
          <input
            style={styles.searchBar}
            placeholder="Search events... (e.g., source_ip:192.168.1.1 OR event_category:security)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <input
            type="datetime-local"
            style={styles.searchBar}
            value={formatDateForInput(timeRange.start)}
            onChange={(e) => setTimeRange(prev => ({ ...prev, start: parseDateFromInput(e.target.value) }))}
          />
          <input
            type="datetime-local"
            style={styles.searchBar}
            value={formatDateForInput(timeRange.end)}
            onChange={(e) => setTimeRange(prev => ({ ...prev, end: parseDateFromInput(e.target.value) }))}
          />
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
          <button
            style={uiState.isLoading ? { ...styles.button, opacity: 0.6 } : styles.primaryButton}
            onClick={() => executeSearch()}
            disabled={uiState.isLoading}
          >
            {uiState.isLoading ? 'Searching...' : 'Search'}
          </button>

          {uiState.isLoading && (
            <button
              style={{ ...styles.button, backgroundColor: '#f44336', color: 'white' }}
              onClick={cancelSearch}
            >
              Cancel
            </button>
          )}

          <button
            style={filters.length > 0 ? styles.primaryButton : styles.button}
            onClick={() => setShowFilters(!showFilters)}
          >
            Filters {filters.length > 0 && `(${filters.length})`}
          </button>

          <button
            style={styles.button}
            onClick={() => executeSearch(true)}
            disabled={uiState.isLoading}
          >
            Refresh
          </button>

          <button
            style={styles.button}
            onClick={clearAll}
          >
            Clear All
          </button>
        </div>

        {/* Quick Search Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {quickSearches.map((search, index) => (
            <button
              key={index}
              style={styles.chip}
              onClick={search.action}
            >
              {search.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading Progress */}
      {uiState.isLoading && (
        <div style={styles.loadingBar}>
          <div style={styles.loadingProgress}></div>
        </div>
      )}

      {/* Error Alert */}
      {uiState.error && (
        <div style={styles.errorAlert}>
          {uiState.error.message}
          <button
            style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => setUiState(prev => ({ ...prev, error: null }))}
          >
            ×
          </button>
        </div>
      )}

      {/* Success Alert */}
      {snackbar.open && snackbar.type === 'success' && (
        <div style={styles.successAlert}>
          {snackbar.message}
          <button
            style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => setSnackbar(prev => ({ ...prev, open: false }))}
          >
            ×
          </button>
        </div>
      )}

      {/* Filters Panel */}
      {showFilters && (
        <div style={styles.card}>
          <h3>Search Filters</h3>
          <p>Filter functionality will be implemented here</p>
          {filters.length > 0 && (
             <div>
               <strong>Active Filters:</strong>
               {filters.map((filter, index) => (
                 <span key={index} style={styles.chip}>
                   {filter.field} {filter.operator} {Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value)}
                 </span>
               ))}
             </div>
           )}
        </div>
      )}

      {/* Results */}
      <div style={{ ...styles.card, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {uiState.results && (
          <>
            {/* Results Summary */}
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#666', fontSize: '14px' }}>
                Found {uiState.results.metadata.total_hits} events in {uiState.results.metadata.query_time_ms}ms
                {uiState.results.metadata.cached && ' (cached)'}
              </span>
            </div>

            {/* Data Table */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Timestamp</th>
                    <th style={styles.th}>Category</th>
                    <th style={styles.th}>Action</th>
                    <th style={styles.th}>Source IP</th>
                    <th style={styles.th}>Destination IP</th>
                    <th style={styles.th}>Outcome</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {uiState.results.hits.map((event) => (
                    <tr key={event.event_id}>
                      <td style={styles.td}>
                        {new Date(event.event_timestamp).toLocaleString()}
                      </td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.chip,
                          backgroundColor: event.event_category === 'security' ? '#ffebee' : '#e3f2fd',
                          borderColor: event.event_category === 'security' ? '#f44336' : '#2196f3',
                          color: event.event_category === 'security' ? '#c62828' : '#1976d2',
                        }}>
                          {event.event_category}
                        </span>
                      </td>
                      <td style={styles.td}>{event.event_action}</td>
                      <td style={styles.td}>{event.source_ip || '-'}</td>
                      <td style={styles.td}>{event.destination_ip || '-'}</td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.chip,
                          backgroundColor: event.event_outcome === 'success' ? '#e8f5e8' : event.event_outcome === 'failure' ? '#ffebee' : '#f5f5f5',
                          borderColor: event.event_outcome === 'success' ? '#4caf50' : event.event_outcome === 'failure' ? '#f44336' : '#ccc',
                          color: event.event_outcome === 'success' ? '#2e7d32' : event.event_outcome === 'failure' ? '#c62828' : '#666',
                        }}>
                          {event.event_outcome || 'unknown'}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <button
                          style={styles.button}
                          onClick={() => handleEventSelect(event)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', color: '#666' }}>
                Showing {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, uiState.results.metadata.total_hits)} of {uiState.results.metadata.total_hits}
              </span>
              <div>
                <button
                  style={styles.button}
                  onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
                  disabled={pagination.offset === 0}
                >
                  Previous
                </button>
                <button
                  style={styles.button}
                  onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
                  disabled={pagination.offset + pagination.limit >= uiState.results!.metadata.total_hits}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}

        {!uiState.results && !uiState.isLoading && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#666' }}>
              Enter a search query to get started
            </span>
          </div>
        )}
      </div>

      {/* Event Details Modal */}
      {selectedEvent && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '80%',
            maxHeight: '80%',
            overflow: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3>Event Details</h3>
              <button
                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}
                onClick={() => setSelectedEvent(null)}
              >
                ×
              </button>
            </div>
            <pre style={{ fontSize: '12px', overflow: 'auto' }}>
              {JSON.stringify(selectedEvent, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedLogActivities;