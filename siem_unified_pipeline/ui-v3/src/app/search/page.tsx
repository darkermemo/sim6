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
import { useUrlState } from '@/hooks/useUrlState';
import { getSearchFields, searchEvents, searchAggs, searchFacets, compileSearch, getServerColumns, putServerColumns } from '@/lib/api';
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
  { label: 'Last 30 days', value: 2592000 },
  { label: 'Last 90 days', value: 7776000 },
  { label: 'Last 120 days', value: 10368000 },
  { label: 'Last 180 days', value: 15552000 },
  { label: 'All time', value: 0 },
];

function SearchPageContent() {
  // URL state management (restored for main search page)
  const urlState = useUrlState({
    defaultValues: {
      limit: 100,
      last_seconds: 172800 // 48 hours by default to surface recent logs immediately
    }
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
  const schema = useSchema(urlState.tenant_id);

  // Facet state
  const [selectedFacets, setSelectedFacets] = useState<Record<string, string[]>>({});

  // UI state
  const [selectedFields, setSelectedFields] = useState<string[]>([
    'event_type','severity','user','host','source_ip','destination_ip','vendor','product','protocol','source_port','destination_port'
  ]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['available-fields']));
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [sqlPreviewModal, setSqlPreviewModal] = useState<string | null>(null);
  const [columnsModalOpen, setColumnsModalOpen] = useState<boolean>(false);
  const [fieldsFilter, setFieldsFilter] = useState<string>("");
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [showRowInspector, setShowRowInspector] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  // Sorting state
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // Drag state for header reordering
  const [dragColIndex, setDragColIndex] = useState<number | null>(null);

  // Advanced Filters (rule-grade)
  const [rootFilter, setRootFilter] = useState<Filter>({ kind: 'group', logic: 'AND', children: [] });
  const compiledQ = useMemo(() => compileFiltersToQ(rootFilter, schema.map), [rootFilter, schema.map]);

  // Persist columns across refreshes (localStorage)
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('ui_v3_search_columns');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setSelectedFields(parsed.filter((f) => typeof f === 'string'));
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (urlState.tenant_id) {
      Promise.allSettled([
        getSearchFields(urlState.tenant_id),
        getServerColumns(urlState.tenant_id)
      ]).then((results) => {
        const fieldsRes = results[0];
        if (fieldsRes.status === 'fulfilled') {
          setAvailableFields(fieldsRes.value.map((f: any) => f.field));
        }
        const serverColsRes = results[1];
        if (serverColsRes.status === 'fulfilled' && Array.isArray(serverColsRes.value) && serverColsRes.value.length) {
          setSelectedFields(serverColsRes.value);
        }
      }).catch(console.error);
    }
  }, [urlState.tenant_id]);

  React.useEffect(() => {
    try {
      localStorage.setItem('ui_v3_search_columns', JSON.stringify(selectedFields));
    } catch {}
    // best-effort push to server
    putServerColumns(urlState.tenant_id, selectedFields);
  }, [selectedFields]);

  // Sorting helpers
  const toggleSort = useCallback((field: string) => {
    if (sortField !== field) {
      setSortField(field);
      setSortDir('asc');
      return;
    }
    setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
  }, [sortField]);

  const getComparable = useCallback((value: any): any => {
    if (value == null) return '';
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return value.toLowerCase();
    return JSON.stringify(value);
  }, []);

  // Utility: render a cell value with fallbacks for parsed fields
  const renderCell = useCallback((field: string, event: any) => {
    // Known parsed fields first
    switch (field) {
      case 'event_type':
        return event.event_type || event.row?.event_type || event.row?.event_category || '';
      case 'severity':
        return event.severity || event.row?.severity || event.row?.level || '';
      case 'source_ip':
        return event.row?.source_ip || event.row?.src_ip || '';
      case 'destination_ip':
      case 'dest_ip':
        return event.row?.destination_ip || event.row?.dest_ip || event.row?.dst_ip || '';
      case 'user':
      case 'user_name':
        return event.row?.user || event.row?.user_name || '';
      case 'host':
      case 'host_name':
        return event.row?.host || event.row?.host_name || '';
      case 'vendor':
      case 'product':
        return event.row?.vendor || event.row?.product || '';
      case 'protocol':
        return event.row?.protocol || '';
      case 'source_port':
        return event.row?.source_port ?? '';
      case 'destination_port':
      case 'dest_port':
        return event.row?.destination_port ?? event.row?.dest_port ?? '';
      case 'event_category':
        return event.row?.event_category || '';
      case 'event_action':
      case 'action':
        return event.row?.event_action || event.row?.action || '';
      default:
        // Generic fallback
        const v = (event.row && event.row[field] !== undefined) ? event.row[field] : event[field];
        if (v === null || v === undefined) return '';
        if (Array.isArray(v)) return v.join(', ');
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
    }
  }, []);

  const sortedEvents = useMemo(() => {
    if (!sortField) return searchResults.events;
    const copy = [...searchResults.events];
    copy.sort((a, b) => {
      const va = getComparable(renderCell(sortField, a));
      const vb = getComparable(renderCell(sortField, b));
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [searchResults.events, sortField, sortDir, renderCell, getComparable]);

  // Drag-and-drop header reordering (only for dynamic columns)
  const onHeaderDragStart = useCallback((idx: number) => {
    setDragColIndex(idx);
  }, []);
  const onHeaderDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);
  const onHeaderDrop = useCallback((idx: number) => {
    setSelectedFields(prev => {
      if (dragColIndex == null || dragColIndex === idx) return prev;
      const out = [...prev];
      const [moved] = out.splice(dragColIndex, 1);
      out.splice(idx, 0, moved);
      return out;
    });
    setDragColIndex(null);
  }, [dragColIndex]);

  // Streaming hook for real-time updates
  const streaming = useStreaming(
    urlState.q,
    urlState.tenant_id,
    urlState.last_seconds,
    useCallback((newEvents: any[]) => {
      // Handle new streaming events
      console.log('New streaming events:', newEvents);
    }, [])
  );

  // Load available fields from API
  React.useEffect(() => {
    if (urlState.tenant_id) {
      getSearchFields(urlState.tenant_id)
        .then(fields => {
          setAvailableFields(fields.map(f => f.field));
        })
        .catch(console.error);
    }
  }, [urlState.tenant_id]);

  // Manual search execution only - no auto-execution to prevent loops

  // Build final search query with facet filters
  const buildQuery = useCallback(() => {
    const partsSet = new Set<string>();
    const base = (urlState.q || '').trim();
    if (base && base !== '*') partsSet.add(base);
    Object.entries(selectedFacets).forEach(([field, values]) => {
      const uniq = Array.from(new Set(values));
      uniq.forEach((value) => {
        const safeVal = /[^A-Za-z0-9_.-]/.test(value) ? `"${value.replace(/"/g,'\\"')}"` : value;
        partsSet.add(`${field}:${safeVal}`);
      });
    });
    return Array.from(partsSet).join(' AND ');
  }, [urlState.q, selectedFacets]);

  // Note: avoid pushing to Router from inside this component to prevent render->router loops
  // The Query Bar remains the source of truth for q; facets are applied at execute time

  // Manual search execution to avoid infinite loops
  const handleExecuteSearch = useCallback(async (overrideQuery?: string) => {
    setSearchResults(prev => ({ ...prev, loading: true, error: null, isIdle: false }));
    
    try {
      const finalQuery = overrideQuery || buildQuery();
      
      // Execute all search operations in parallel (like original search page)
      const [eventsResult, facetsResult, timelineResult, sqlResult] = await Promise.allSettled([
        searchEvents({
          search: finalQuery || '',
          tenant_id: urlState.tenant_id,
          time_range_seconds: urlState.last_seconds,
          limit: urlState.limit,
          offset: urlState.offset
        }),
        searchFacets(finalQuery || '', [
          { field: 'severity', size: 8 },
          { field: 'source_type', size: 10 },
          { field: 'host', size: 8 },
          { field: 'vendor', size: 6 },
          { field: 'event_type', size: 8 }
        ], urlState.tenant_id, urlState.last_seconds),
        searchAggs(finalQuery || '', urlState.tenant_id, urlState.last_seconds),
        finalQuery ? compileSearch(finalQuery, urlState.tenant_id) : Promise.resolve({ sql: '' })
      ]);

      const derivedError = eventsResult.status === 'rejected'
        ? (eventsResult.reason?.message || String(eventsResult.reason))
        : null;
      setSearchResults({
        events: eventsResult.status === 'fulfilled' ? eventsResult.value.events || [] : [],
        facets: facetsResult.status === 'fulfilled' ? facetsResult.value : null,
        timeline: timelineResult.status === 'fulfilled' ? timelineResult.value.timeline || [] : [],
        sql: sqlResult.status === 'fulfilled' ? sqlResult.value.sql : null,
        totalCount: eventsResult.status === 'fulfilled' ? eventsResult.value.total_count || 0 : 0,
        loading: false,
        error: derivedError,
        isIdle: false
      });
    } catch (error) {
      setSearchResults(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Search failed'
      }));
    }
  }, [urlState.q, urlState.tenant_id, urlState.last_seconds, urlState.limit, urlState.offset, selectedFacets, buildQuery]);

  const handleClear = useCallback(() => {
    urlState.reset();
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
  }, [urlState]);

  const handleTimeRangeChange = useCallback((seconds: number) => {
    // 0 means all time
    if (seconds === 0) {
      urlState.updateState({ last_seconds: 0, offset: 0 }, true);
    } else {
      urlState.setTimeRange(seconds);
    }
  }, [urlState]);

  const handleQueryChange = useCallback((query: string) => {
    urlState.setQuery(query);
  }, [urlState]);

  // Facet handlers
  const handleFacetSelect = useCallback((field: string, value: string) => {
    setSelectedFacets(prev => {
      const current = prev[field] || [];
      if (current.includes(value)) return prev; // prevent duplicates
      return { ...prev, [field]: [...current, value] };
    });
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
    urlState.previousPage();
  }, [urlState]);

  const handleNextPage = useCallback(() => {
    urlState.nextPage();
  }, [urlState]);

  // Advanced filter handlers
  const applyFilters = useCallback(() => {
    const finalQ = [urlState.q?.trim(), compiledQ !== '*' ? compiledQ : ''].filter(Boolean).join(' AND ');
    handleExecuteSearch(finalQ);
  }, [compiledQ, urlState.q, handleExecuteSearch]);

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

  // Utility: pretty label for field names
  const prettyLabel = useCallback((f: string) => {
    if (f === 'ts' || f === 'event_timestamp') return 'Time';
    return f.replace(/_/g, ' ');
  }, []);

  // Collect runtime fields from current result set (first page)
  const runtimeFields = useMemo(() => {
    const set = new Set<string>();
    for (const ev of searchResults.events) {
      if (ev && typeof ev === 'object') {
        if (ev.row && typeof ev.row === 'object') {
          Object.keys(ev.row).forEach(k => set.add(k));
        }
        Object.keys(ev).forEach(k => {
          if (k !== 'row') set.add(k);
        });
      }
    }
    return Array.from(set).sort();
  }, [searchResults.events]);

  const allFields = useMemo(() => {
    const union = new Set<string>([...availableFields, ...runtimeFields]);
    return Array.from(union).sort();
  }, [availableFields, runtimeFields]);

  const filteredAllFields = useMemo(() => {
    const q = fieldsFilter.trim().toLowerCase();
    if (!q) return allFields;
    return allFields.filter(f => f.toLowerCase().includes(q));
  }, [allFields, fieldsFilter]);

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

  // Auto-execute on query/time/facets change (Kibana behavior) with debounce
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (!searchResults.loading) {
        handleExecuteSearch();
      }
    }, 300);
    return () => clearTimeout(t);
  }, [urlState.q, urlState.last_seconds, selectedFacets]);

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      <div className="flex-1 flex flex-col px-4 pt-4 pb-2 space-y-4 max-w-[1600px] mx-auto w-full overflow-hidden">


        {/* Enhanced Query Bar with streaming support */}
        <div className="bg-card text-card-foreground border border-border rounded-md">
          <div className="flex items-center gap-3 p-2">
            {/* Search Input */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search for log entries… (e.g. host.name:host-1)"
                value={urlState.q}
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
              <Select value={urlState.last_seconds.toString()} onValueChange={(v) => handleTimeRangeChange(parseInt(v))}>
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
              <Button variant="outline" onClick={() => setColumnsModalOpen(true)}>Columns</Button>
            </div>
          </div>
        </div>

        {/* Main Content Layout: facets + (timeline above results) */}
        <div className="flex-1 grid grid-cols-[300px_1fr] gap-6 overflow-hidden">
          {/* Facets (left) */}
          <div className="overflow-auto min-w-0 pr-2">
            <FacetPanel
              query={buildQuery()}
              tenantId={urlState.tenant_id}
              timeRange={urlState.last_seconds}
              onFacetSelect={handleFacetSelect}
              selectedFacets={selectedFacets}
              onFacetRemove={handleFacetRemove}
              facetsData={searchResults.facets}
              kibanaList
            />
          </div>

          {/* Center: Timeline over Results */}
          <div className="min-w-0 flex flex-col space-y-4 overflow-hidden">
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
            <div className="flex-1 bg-white border border-gray-200 rounded overflow-hidden flex flex-col">
              {searchResults.loading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-2 text-sm text-muted-foreground">Searching...</p>
                </div>
              ) : searchResults.error ? (
                <div className="p-8 text-center">
                  <p className="text-red-600">{searchResults.error}</p>
                </div>
              ) : sortedEvents.length > 0 ? (
                <div className="flex-1 overflow-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left p-3 text-sm font-medium text-gray-600">Time</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-600">Source</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-600">Message</th>
                        {selectedFields.map((f, i) => (
                          <th
                            key={f}
                            draggable
                            onDragStart={() => onHeaderDragStart(i)}
                            onDragOver={onHeaderDragOver}
                            onDrop={() => onHeaderDrop(i)}
                            onClick={() => toggleSort(f)}
                            className="text-left p-3 text-sm font-medium text-gray-600 select-none cursor-pointer"
                            title="Click to sort; drag to reorder"
                          >
                            {prettyLabel(f)}
                            {sortField === f ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedEvents.map((event, index) => (
                        <tr 
                          key={index} 
                          className="border-b hover:bg-gray-50 cursor-pointer"
                          onClick={() => handleRowClick(event)}
                        >
                          <td className="p-3 text-sm text-gray-900">
                            {event.tsIso ? formatTimestamp(event.tsIso) : (event.timestamp ? formatTimestamp(event.timestamp) : '-')}
                          </td>
                          <td className="p-3 text-sm text-gray-600">
                            {event.source || event.host || event.source_type || '-'}
                          </td>
                          <td className="p-3 text-sm text-gray-900 max-w-md truncate">
                            {event.message || event.raw_message || event._source || JSON.stringify(event).substring(0, 100)}
                          </td>
                          {selectedFields.map((f) => (
                            <td key={f} className="p-3 text-sm text-gray-900">{renderCell(f, event)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-left space-y-2">
                  <p className="text-gray-700 font-medium">No events rendered. Verbose debug:</p>
                  <pre className="bg-gray-50 border rounded p-3 text-xs overflow-auto">
{`q: ${urlState.q || '*'}\nlast_seconds: ${urlState.last_seconds}\ntenant_id: ${urlState.tenant_id}\ncompiled_q (facets + builders): ${buildQuery() || '*'}\nsql: ${searchResults.sql || '(no sql)'}\nfacets loaded: ${!!searchResults.facets}\ntimeline points: ${searchResults.timeline?.length || 0}\nerror: ${searchResults.error || '(none)'}\n`}
                  </pre>
                  <p className="text-gray-600 text-sm">If an API error occurred, it will appear above. Otherwise, try widening time or clearing facets.</p>
                </div>
              )}
            </div>

            {/* Pagination Status Bar */}
            {sortedEvents.length > 0 && (
              <div className="rounded-lg py-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-4">
                    <span>
                      Showing {sortedEvents.length} of {totalCount.toLocaleString()} events
                    </span>
                    <span>Page {urlState.currentPage}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex gap-2">
                      <ActionButton 
                        size="sm"
                        variant="outline"
                        className="px-3 py-1 text-xs"
                        disabled={!urlState.hasPrevious}
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
                        disabled={!urlState.hasNext}
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

        {/* Columns Modal */}
        {columnsModalOpen && (
          <Modal
            isOpen={columnsModalOpen}
            onClose={() => setColumnsModalOpen(false)}
            title="Columns"
            size="xl"
          >
            <ModalContent>
              <div className="flex items-center gap-2 mb-3">
                <Input placeholder="Filter fields" value={fieldsFilter} onChange={(e) => setFieldsFilter(e.target.value)} />
                <Button variant="outline" onClick={() => setSelectedFields(filteredAllFields)}>Show All (filtered)</Button>
                <Button variant="outline" onClick={() => setSelectedFields([])}>Hide All</Button>
              </div>
              <div className="grid grid-cols-3 gap-2 max-h-[60vh] overflow-auto pr-1">
                {filteredAllFields.map((f) => {
                  const checked = selectedFields.includes(f);
                  return (
                    <div key={f} className="flex items-center justify-between gap-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedFields((prev) => {
                              if (e.target.checked) return prev.includes(f) ? prev : [...prev, f];
                              return prev.filter((x) => x !== f);
                            });
                          }}
                        />
                        <span>{f}</span>
                      </label>
                      {checked && (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="outline" onClick={() => setSelectedFields((prev) => {
                            const i = prev.indexOf(f); if (i <= 0) return prev; const out = [...prev];
                            const tmp = out[i-1]; out[i-1] = out[i]; out[i] = tmp; return out; })}>↑</Button>
                          <Button size="sm" variant="outline" onClick={() => setSelectedFields((prev) => {
                            const i = prev.indexOf(f); if (i < 0 || i >= prev.length-1) return prev; const out = [...prev];
                            const tmp = out[i+1]; out[i+1] = out[i]; out[i] = tmp; return out; })}>↓</Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 text-xs text-muted-foreground">Fields are sourced from the backend schema and the current page of results.</div>
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

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading search...</div>}>
      <SearchPageContent />
    </Suspense>
  );
}
