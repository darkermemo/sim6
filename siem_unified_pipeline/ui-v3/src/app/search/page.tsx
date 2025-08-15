"use client";

import { useState, useCallback, useMemo } from "react";
import { QueryBar } from "@/components/search/QueryBar";
import { FacetPanel } from "@/components/search/FacetPanel";
import { TimelineHook } from "@/components/search/TimelineHook";
import { ResultTable } from "@/components/search/ResultTable";
import { RowInspector } from "@/components/search/RowInspector";
import { useSearchQuery } from "@/hooks/useSearchQuery";
import { useStreaming } from "@/hooks/useStreaming";
import { useUrlState } from "@/hooks/useUrlState";
import { normalizeSeverity } from "@/lib/severity";
import { FilterBar } from "@/components/search/FilterBar";
import { FilterGroup } from "@/components/search/FilterGroup";
import type { Filter } from "@/types/filters";
import { compileFiltersToQ } from "@/lib/filters-compiler";
import { useSchema } from "@/hooks/useSchema";

export default function SearchPage() {
  // URL state management
  const urlState = useUrlState({
    defaultValues: {
      limit: 100,
      last_seconds: 86400
    }
  });

  // Facet state
  const [selectedFacets, setSelectedFacets] = useState<Record<string, string[]>>({});
  
  // Search query hook with debounced execution
  const searchQuery = useSearchQuery(
    urlState.q,
    urlState.tenant_id,
    urlState.last_seconds,
    selectedFacets,
    { autoExecute: true }
  );

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
  
  // UI state
  const [sqlPreviewModal, setSqlPreviewModal] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [showRowInspector, setShowRowInspector] = useState(false);

  // Event handlers using the new hooks
  const handleExecuteSearch = useCallback(() => {
    searchQuery.execute(urlState.limit, urlState.offset);
  }, [searchQuery, urlState.limit, urlState.offset]);

  // Event handlers
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

  const handleTimeWindowChange = useCallback((startTime: number, endTime: number) => {
    const newTimeRange = endTime - startTime;
    urlState.setTimeRange(newTimeRange);
  }, [urlState]);

  const handleClear = useCallback(() => {
    urlState.reset();
    setSelectedFacets({});
    searchQuery.clear();
  }, [urlState, searchQuery]);

  const handleRowClick = useCallback((event: any) => {
    setSelectedEvent(event);
    setShowRowInspector(true);
  }, []);

  const handleCloseInspector = useCallback(() => {
    setShowRowInspector(false);
    setSelectedEvent(null);
  }, []);

  // Advanced Filters (rule-grade)
  const [rootFilter, setRootFilter] = useState<Filter>({ kind: 'group', logic: 'AND', children: [] })
  const schema = useSchema(urlState.tenant_id)
  const compiledQ = useMemo(() => compileFiltersToQ(rootFilter, schema.map), [rootFilter, schema.map])
  const applyFilters = useCallback(() => {
    const finalQ = [urlState.q?.trim(), compiledQ !== '*' ? compiledQ : ''].filter(Boolean).join(' AND ')
    searchQuery.execute(urlState.limit, urlState.offset, finalQ as any)
  }, [compiledQ, urlState.q, urlState.limit, urlState.offset, searchQuery])







  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900">
      <div className="p-6 space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Log Activity / Search</h1>
          <p className="text-slate-600 dark:text-slate-400">
            Query, filter, and analyze security events with real-time facets and timeline visualization
          </p>
        </div>

        {/* Query Bar */}
        <QueryBar
          query={urlState.q}
          onQueryChange={urlState.setQuery}
          onExecute={handleExecuteSearch}
          isExecuting={searchQuery.loading}
          isStreaming={urlState.stream}
          onStreamingToggle={(enabled) => {
            urlState.setStreaming(enabled);
            if (enabled) streaming.start();
            else streaming.stop();
          }}
          timeRange={urlState.last_seconds}
          onTimeRangeChange={urlState.setTimeRange}
          tenantId={urlState.tenant_id}
          onTenantChange={urlState.setTenantId}
          onClear={handleClear}
          onShowSqlPreview={(sql) => setSqlPreviewModal(searchQuery.results.sql || sql)}
        />

        {/* Timeline */}
        <TimelineHook
          timelineData={searchQuery.results.timeline}
          loading={searchQuery.loading}
          onTimeWindowChange={handleTimeWindowChange}
        />

        {/* Main Content Layout */}
        <div className="flex gap-6">
          {/* Left: Facet Panel */}
          <FacetPanel
            query={urlState.q}
            tenantId={urlState.tenant_id}
            timeRange={urlState.last_seconds}
            onFacetSelect={handleFacetSelect}
            selectedFacets={selectedFacets}
            onFacetRemove={handleFacetRemove}
            facetsData={searchQuery.results.facets}
          />

          {/* Right: Results */}
          <div className="flex-1 space-y-4">
            {/* Advanced Filter Builder */}
            <div className="bg-card rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-muted-foreground">Rule-grade filters</div>
                <FilterBar
                  onAddRule={() => setRootFilter({ ...(rootFilter as any), kind: 'group', children: [...(rootFilter as any).children, { kind: 'rule', field: 'event_type', op: 'eq', value: 'auth' }] })}
                  onAddGroup={() => setRootFilter({ ...(rootFilter as any), kind: 'group', children: [...(rootFilter as any).children, { kind: 'group', logic: 'AND', children: [] }] })}
                  onClear={() => setRootFilter({ kind: 'group', logic: 'AND', children: [] })}
                  onApply={applyFilters}
                />
              </div>
              <FilterGroup />
              {compiledQ && compiledQ !== '*' && (
                <div className="mt-2 text-xs text-muted-foreground">Compiled: <code>{compiledQ}</code></div>
              )}
            </div>
            <ResultTable
              events={searchQuery.results.events?.events || []}
              loading={searchQuery.loading}
              onRowClick={handleRowClick}
            />

            {/* Pagination Status Bar */}
            {searchQuery.results.events && (
              <div className="bg-card rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-4">
                    <span>
                      Showing {searchQuery.results.events.events.length} of {searchQuery.results.events.total_count.toLocaleString()} events
                    </span>
                    <span>Page {urlState.currentPage}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    {searchQuery.results.events.elapsed_ms && (
                      <span>Query time: {searchQuery.results.events.elapsed_ms}ms</span>
                    )}
                    <div className="flex gap-2">
                      <button 
                        className="px-3 py-1 text-xs border rounded disabled:opacity-50"
                        disabled={!urlState.hasPrevious}
                        onClick={urlState.previousPage}
                      >
                        Previous
                      </button>
                      <button 
                        className="px-3 py-1 text-xs border rounded disabled:opacity-50"
                        disabled={!urlState.hasNext}
                        onClick={urlState.nextPage}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* SQL Preview Modal */}
        {sqlPreviewModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-slate-800 rounded-lg w-full max-w-4xl max-h-[80vh] overflow-auto">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Compiled SQL Query</h3>
                  <button
                    onClick={() => setSqlPreviewModal(null)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="p-4">
                <pre className="bg-slate-100 dark:bg-slate-900 p-4 rounded-lg text-sm overflow-auto">
                  {sqlPreviewModal}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Row Inspector */}
        <RowInspector
          event={selectedEvent}
          isOpen={showRowInspector}
          onClose={handleCloseInspector}
        />

        {/* Error Display */}
        {searchQuery.error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
              <span className="font-medium">Search Error</span>
            </div>
            <p className="text-sm text-red-600 dark:text-red-300 mt-1">{searchQuery.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}