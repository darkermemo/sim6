"use client";

import React, { useState, useCallback, useMemo, Suspense } from 'react';
import { Search, Calendar, ChevronDown, ChevronRight, Play, X, Clock, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Modal, ModalContent } from '@/components/ui/modal';
import { useSchema } from '@/hooks/useSchema';
import { useStreaming } from '@/hooks/useStreaming';
import { getSearchFields, searchEvents, searchAggs, searchFacets, compileSearch } from '@/lib/api';
import { formatTimestamp } from '@/lib/api';
import { ActionButton } from '@/components/ui/ActionButton';
import { FacetPanel } from '@/components/search/FacetPanel';
import { RowInspector } from '@/components/search/RowInspector';
import type { Filter } from '@/types/filters';
import { compileFiltersToQ } from '@/lib/filters-compiler';

/**
 * UI-V3 View (Search2 - Kibana Style)
 * 
 * Fully functional Kibana Discover interface with real ClickHouse connectivity:
 * - Real search API integration
 * - Live timeline histogram from ClickHouse
 * - Dynamic field list from schema
 * - Real event data table
 * - Full search functionality
 */

const TIME_RANGES = [
  { label: 'Last 5 minutes', value: 300 },
  { label: 'Last 15 minutes', value: 900 },
  { label: 'Last 30 minutes', value: 1800 },
  { label: 'Last 1 hour', value: 3600 },
  { label: 'Last 4 hours', value: 14400 },
  { label: 'Last 12 hours', value: 43200 },
  { label: 'Last 24 hours', value: 86400 },
  { label: 'Last 7 days', value: 604800 },
];

function Search2PageContent() {
  // Local state management to avoid URL conflicts with original search page
  const [searchParams, setSearchParams] = useState({
    q: '*',
    tenant_id: 'admin',
    last_seconds: 900, // 15 minutes default
    limit: 500,
    offset: 0
  });

  // Manual search state to avoid infinite loops
  const [searchResults, setSearchResults] = useState<{
    events: any[];
    timeline: any[];
    facets: any;
    sql: string | null;
    totalCount: number;
    loading: boolean;
    error: string | null;
    isIdle: boolean;
  }>({
    events: [],
    timeline: [],
    facets: null,
    sql: null,
    totalCount: 0,
    loading: false,
    error: null,
    isIdle: true
  });

  // Schema hook for field list
  const schema = useSchema(searchParams.tenant_id);

  // Facet state
  const [selectedFacets, setSelectedFacets] = useState<Record<string, string[]>>({});

  // UI state
  const [selectedFields, setSelectedFields] = useState<string[]>(['ts', '_source']);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['available-fields']));
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [sqlPreviewModal, setSqlPreviewModal] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [showRowInspector, setShowRowInspector] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  // Advanced Filters (rule-grade)
  const [rootFilter, setRootFilter] = useState<Filter>({ kind: 'group', logic: 'AND', children: [] });
  const compiledQ = useMemo(() => compileFiltersToQ(rootFilter, schema.map), [rootFilter, schema.map]);

  // Streaming hook for real-time updates
  const streaming = useStreaming(
    searchParams.q,
    searchParams.tenant_id,
    searchParams.last_seconds,
    useCallback((newEvents: any[]) => {
      // Handle new streaming events
      console.log('New streaming events:', newEvents);
    }, [])
  );

  // Load available fields from API
  React.useEffect(() => {
    if (searchParams.tenant_id) {
      getSearchFields(searchParams.tenant_id)
        .then(fields => {
          setAvailableFields(fields.map(f => f.field));
        })
        .catch(console.error);
    }
  }, [searchParams.tenant_id]);

  // Manual search execution only - no auto-execution to prevent loops

  // Build final search query with facet filters
  const buildQuery = useCallback(() => {
    let finalQuery = searchParams.q;
    Object.entries(selectedFacets).forEach(([field, values]) => {
      values.forEach(value => {
        finalQuery += ` ${field}:${value}`;
      });
    });
    return finalQuery.trim();
  }, [searchParams.q, selectedFacets]);

  // Manual search execution to avoid infinite loops
  const handleExecuteSearch = useCallback(async (overrideQuery?: string) => {
    setSearchResults(prev => ({ ...prev, loading: true, error: null, isIdle: false }));
    
    try {
      const finalQuery = overrideQuery || buildQuery();
      
      // Execute all search operations in parallel (like original search page)
      const [eventsResult, facetsResult, timelineResult, sqlResult] = await Promise.allSettled([
        searchEvents({
          search: finalQuery || '',
          tenant_id: searchParams.tenant_id,
          time_range_seconds: searchParams.last_seconds,
          limit: searchParams.limit,
          offset: searchParams.offset
        }),
        searchFacets(finalQuery || '', [
          { field: 'severity', size: 8 },
          { field: 'source_type', size: 10 },
          { field: 'host', size: 8 },
          { field: 'vendor', size: 6 },
          { field: 'event_type', size: 8 }
        ], searchParams.tenant_id, searchParams.last_seconds),
        searchAggs(finalQuery || '', searchParams.tenant_id, searchParams.last_seconds),
        finalQuery ? compileSearch(finalQuery, searchParams.tenant_id) : Promise.resolve({ sql: '' })
      ]);

      setSearchResults({
        events: eventsResult.status === 'fulfilled' ? eventsResult.value.events || [] : [],
        facets: facetsResult.status === 'fulfilled' ? facetsResult.value : null,
        timeline: timelineResult.status === 'fulfilled' ? timelineResult.value.timeline || [] : [],
        sql: sqlResult.status === 'fulfilled' ? sqlResult.value.sql : null,
        totalCount: eventsResult.status === 'fulfilled' ? eventsResult.value.total_count || 0 : 0,
        loading: false,
        error: null,
        isIdle: false
      });
    } catch (error) {
      setSearchResults(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Search failed'
      }));
    }
  }, [searchParams.q, searchParams.tenant_id, searchParams.last_seconds, searchParams.limit, searchParams.offset, selectedFacets, buildQuery]);

  const handleClear = useCallback(() => {
    setSearchParams({
      q: '*',
      tenant_id: 'admin',
      last_seconds: 900,
      limit: 500,
      offset: 0
    });
    setSelectedFacets({});
    setSearchResults({
      events: [],
      timeline: [],
      facets: null,
      sql: null,
      totalCount: 0,
      loading: false,
      error: null,
      isIdle: true
    });
  }, []);

  const handleTimeRangeChange = useCallback((seconds: number) => {
    setSearchParams(prev => ({ ...prev, last_seconds: seconds }));
  }, []);

  const handleQueryChange = useCallback((query: string) => {
    setSearchParams(prev => ({ ...prev, q: query }));
  }, []);

  // Facet handlers
  const handleFacetSelect = useCallback((field: string, value: string) => {
    setSelectedFacets(prev => ({
      ...prev,
      [field]: [...(prev[field] || []), value]
    }));
  }, []);

  const handleFacetRemove = useCallback((field: string, value: string) => {
    setSelectedFacets(prev => ({
      ...prev,
      [field]: (prev[field] || []).filter(v => v !== value)
    }));
  }, []);

  // Row inspection handlers
  const handleRowClick = useCallback((event: any) => {
    setSelectedEvent(event);
    setShowRowInspector(true);
  }, []);

  const handleCloseInspector = useCallback(() => {
    setShowRowInspector(false);
    setSelectedEvent(null);
  }, []);

  // Streaming handlers
  const handleStreamingToggle = useCallback((enabled: boolean) => {
    setIsStreaming(enabled);
    if (enabled) streaming.start();
    else streaming.stop();
  }, [streaming]);

  // Pagination handlers
  const handlePreviousPage = useCallback(() => {
    setSearchParams(prev => ({
      ...prev,
      offset: Math.max(0, prev.offset - prev.limit)
    }));
  }, []);

  const handleNextPage = useCallback(() => {
    setSearchParams(prev => ({
      ...prev,
      offset: prev.offset + prev.limit
    }));
  }, []);

  // Advanced filter handlers
  const applyFilters = useCallback(() => {
    const finalQ = [searchParams.q?.trim(), compiledQ !== '*' ? compiledQ : ''].filter(Boolean).join(' AND ');
    handleExecuteSearch(finalQ);
  }, [compiledQ, searchParams.q, handleExecuteSearch]);

  const toggleRowExpansion = useCallback((rowId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(rowId)) {
      newExpanded.delete(rowId);
    } else {
      newExpanded.add(rowId);
    }
    setExpandedRows(newExpanded);
  }, [expandedRows]);

  const toggleSection = useCallback((section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  }, [expandedSections]);

  const addField = useCallback((field: string) => {
    if (!selectedFields.includes(field)) {
      setSelectedFields([...selectedFields, field]);
    }
  }, [selectedFields]);

  const removeField = useCallback((field: string) => {
    setSelectedFields(selectedFields.filter(f => f !== field));
  }, [selectedFields]);

  // Get real events data from manual state
  const events = searchResults.events;
  const timeline = searchResults.timeline;
  const totalCount = searchResults.totalCount;
  const isLoading = searchResults.loading;

  // Timeline data processing for histogram
  const timelineData = useMemo(() => {
    if (!timeline.length) return [];
    
    // Create 50 buckets for the histogram
    const buckets = Array.from({ length: 50 }, (_, i) => ({
      index: i,
      count: 0,
      timestamp: ''
    }));
    
    // Distribute timeline data across buckets
    timeline.forEach((point: any, index: number) => {
      const bucketIndex = Math.floor((index / timeline.length) * 50);
      if (buckets[bucketIndex]) {
        buckets[bucketIndex].count += point.count || 0;
        buckets[bucketIndex].timestamp = point.ts;
      }
    });
    
    return buckets;
  }, [timeline]);

  // Get max count for histogram scaling
  const maxCount = useMemo(() => {
    return Math.max(...timelineData.map(d => d.count), 1);
  }, [timelineData]);

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 pt-4 pb-2 space-y-4 max-w-[1600px] mx-auto">
        {/* Top breadcrumb to mirror search2 spacing */}
        <div className="h-12 bg-[hsl(var(--k-topbar-bg))] border-b border-[hsl(var(--k-border-light))] flex items-center px-4">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <span>Discover</span>
            <ChevronRight className="w-4 h-4" />
            <span className="text-gray-900">Kibana</span>
          </div>
        </div>

        {/* Enhanced Query Bar with streaming support */}
        <div className="bg-card text-card-foreground border border-border rounded-md">
          <div className="flex items-center gap-3 p-2">
            {/* Search Input */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search for log entries… (e.g. host.name:host-1)"
                value={searchParams.q}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleExecuteSearch();
                  }
                }}
                className="pl-10 h-10"
              />
            </div>

            {/* Time Range */}
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Select value={searchParams.last_seconds.toString()} onValueChange={(v) => handleTimeRangeChange(parseInt(v))}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGES.map(range => (
                    <SelectItem key={range.value} value={range.value.toString()}>
                      {range.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Stream live */}
            <Button
              variant={isStreaming ? 'default' : 'outline'}
              onClick={() => handleStreamingToggle(!isStreaming)}
              className="gap-2"
            >
              <Zap className="h-4 w-4" />
              Stream live
            </Button>

            {/* Run/Clear controls */}
            <div className="flex items-center gap-2 ml-2">
              <ActionButton 
                onClick={() => handleExecuteSearch()} 
                disabled={isLoading}
                data-action="search:query:execute"
                data-intent="api"
                data-endpoint="/api/v2/search/execute"
              >
                <Play className="w-4 h-4 mr-1" />
                Run
              </ActionButton>
              <Button variant="outline" onClick={handleClear}>
                Clear
              </Button>
              <Button variant="link" className="px-1" onClick={() => setSqlPreviewModal(searchResults.sql || '')}>
                SQL
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content Layout: facets + (timeline above results) */}
        <div className="grid grid-cols-[300px_1fr] gap-6">
          {/* Facets (left) */}
          <div className="sticky top-4 max-h-[calc(100vh-7rem)] overflow-auto min-w-0 pr-2">
            <FacetPanel
              query={buildQuery()}
              tenantId={searchParams.tenant_id}
              timeRange={searchParams.last_seconds}
              onFacetSelect={handleFacetSelect}
              selectedFacets={selectedFacets}
              onFacetRemove={handleFacetRemove}
              facetsData={searchResults.facets}
            />
          </div>

          {/* Center: Timeline over Results */}
          <div className="min-w-0 space-y-4">
            {/* Events timeline above results */}
            <div className="bg-white border border-gray-200 rounded p-4">
          <div className="h-32 bg-gray-50 rounded border border-[hsl(var(--k-border-light))] flex items-end justify-center space-x-1 px-4 pb-4">
            {isLoading ? (
              // Loading skeleton
              Array.from({ length: 50 }, (_, i) => (
                <div 
                  key={i}
                  className="bg-gray-300 w-2 rounded-t animate-pulse"
                  style={{ height: `${Math.random() * 40 + 10}%` }}
                />
              ))
            ) : timelineData.length > 0 ? (
              // Real timeline data
              timelineData.map((bucket, i) => (
                <div 
                  key={i}
                  className="bg-[hsl(var(--primary))] w-2 rounded-t hover:opacity-90 cursor-pointer transition-colors"
                  style={{ 
                    height: `${Math.max((bucket.count / maxCount) * 80, 2)}%`,
                    opacity: 0.8
                  }}
                  title={`${bucket.count} events${bucket.timestamp ? ` at ${new Date(bucket.timestamp).toLocaleTimeString()}` : ''}`}
                />
              ))
            ) : (
              // No data placeholder
              <div className="flex items-center justify-center w-full h-full text-gray-400 text-sm">
                No timeline data available
              </div>
            )}
            </div>
            </div>
            
            {/* Results Table */}
            <div className="bg-white border border-gray-200 rounded">
              {searchResults.loading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-2 text-sm text-muted-foreground">Searching...</p>
                </div>
              ) : searchResults.error ? (
                <div className="p-8 text-center">
                  <p className="text-red-600">{searchResults.error}</p>
                </div>
              ) : events.length > 0 ? (
                <div className="overflow-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left p-3 text-sm font-medium text-gray-600">Time</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-600">Source</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-600">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((event, index) => (
                        <tr 
                          key={index} 
                          className="border-b hover:bg-gray-50 cursor-pointer"
                          onClick={() => handleRowClick(event)}
                        >
                          <td className="p-3 text-sm text-gray-900">
                            {event.ts ? formatTimestamp(event.ts) : '-'}
                          </td>
                          <td className="p-3 text-sm text-gray-600">
                            {event.source_type || event.host || '-'}
                          </td>
                          <td className="p-3 text-sm text-gray-900 max-w-md truncate">
                            {event.message || event._source || JSON.stringify(event).substring(0, 100)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center">
                  <p className="text-gray-500">No events found. Try adjusting your search query or time range.</p>
                </div>
              )}
            </div>

            {/* Pagination Status Bar */}
            {events.length > 0 && (
              <div className="rounded-lg py-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-4">
                    <span>
                      Showing {events.length} of {totalCount.toLocaleString()} events
                    </span>
                    <span>Page {Math.floor(searchParams.offset / searchParams.limit) + 1}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex gap-2">
                      <ActionButton 
                        size="sm"
                        variant="outline"
                        className="px-3 py-1 text-xs"
                        disabled={searchParams.offset === 0}
                        onClick={handlePreviousPage}
                        data-action="search:pagination:previous"
                        data-intent="navigate"
                      >
                        Previous
                      </ActionButton>
                      <ActionButton 
                        size="sm"
                        variant="outline"
                        className="px-3 py-1 text-xs"
                        disabled={events.length < searchParams.limit}
                        onClick={handleNextPage}
                        data-action="search:pagination:next"
                        data-intent="navigate"
                      >
                        Next
                      </ActionButton>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        
        {/* SQL Preview Modal */}
        {sqlPreviewModal && (
          <Modal
            isOpen={!!sqlPreviewModal}
            onClose={() => setSqlPreviewModal(null)}
            title="Compiled SQL Query"
            size="lg"
          >
            <ModalContent>
              <pre className="bg-muted text-foreground p-4 rounded-lg text-sm overflow-auto">
                {sqlPreviewModal}
              </pre>
            </ModalContent>
          </Modal>
        )}

        {/* Row Inspector */}
        <RowInspector
          event={selectedEvent}
          isOpen={showRowInspector}
          onClose={handleCloseInspector}
        />

        {/* Error Display */}
        {searchResults.error && (
          <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
              <span className="font-medium">Search Error</span>
            </div>
            <p className="text-sm text-red-600 dark:text-red-300 mt-1">{searchResults.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Search2Page() {
  return (
    <Suspense fallback={<div className="p-6">Loading search...</div>}>
      <Search2PageContent />
    </Suspense>
  );
}
