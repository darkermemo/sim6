"use client";

import { useState, useCallback, useMemo, Suspense } from "react";
import { QueryBar } from "@/components/search/QueryBar";
import { FacetPanel } from "@/components/search/FacetPanel";
import { TimelineHook } from "@/components/search/TimelineHook";
import { ResultTable } from "@/components/search/ResultTable";
import { RowInspector } from "@/components/search/RowInspector";
import { Modal, ModalContent } from "@/components/ui/modal";
import { useSearchQuery } from "@/hooks/useSearchQuery";
import { useStreaming } from "@/hooks/useStreaming";
import { useUrlState } from "@/hooks/useUrlState";
import { normalizeSeverity } from "@/lib/severity";
import { FilterBar } from "@/components/search/FilterBar";
import { FilterGroup } from "@/components/search/FilterGroup";
import type { Filter } from "@/types/filters";
import { compileFiltersToQ } from "@/lib/filters-compiler";
import { useSchema } from "@/hooks/useSchema";
import { FilterBuilderDialog } from "./FilterBuilderDialog";
import { ActionButton } from "@/components/ui/ActionButton";

function SearchPageContent() {
  // URL state management
  const urlState = useUrlState({
    defaultValues: {
      limit: 100,
      last_seconds: 172800 // 48 hours by default to surface recent logs immediately
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
    { autoExecute: true, allowAutoWiden: true }
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
  const [builderOpen, setBuilderOpen] = useState(false)







  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 pt-4 pb-2 space-y-4 max-w-[1600px] mx-auto">
        {/* Query Bar (top) */}
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

        {/* Main Content Layout: facets + (timeline above results) */}
        <div className="grid grid-cols-[300px_1fr] gap-6">
          {/* Facets (left) */}
          <div className="sticky top-4 max-h-[calc(100vh-7rem)] overflow-auto min-w-0 pr-2">
            <FacetPanel
              query={urlState.q}
              tenantId={urlState.tenant_id}
              timeRange={urlState.last_seconds}
              onFacetSelect={handleFacetSelect}
              selectedFacets={selectedFacets}
              onFacetRemove={handleFacetRemove}
              facetsData={searchQuery.results.facets}
            />
          </div>

          {/* Center: Timeline over Results */}
          <div className="min-w-0 space-y-4">
            {/* Events timeline above results */}
            <TimelineHook
              timelineData={searchQuery.results.timeline}
              loading={searchQuery.loading}
              onTimeWindowChange={handleTimeWindowChange}
              bare
            />
            <ResultTable
              events={searchQuery.results.events?.events || []}
              loading={searchQuery.loading}
              onRowClick={handleRowClick}
            />
            {/* Pagination Status Bar */}
            {searchQuery.results.events && (
              <div className="rounded-lg py-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-4">
                    <span>
                      Showing {searchQuery.results.events?.events?.length || 0} of {(searchQuery.results.events?.total_count || 0).toLocaleString()} events
                    </span>
                    <span>Page {urlState.currentPage}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    {searchQuery.results.events.elapsed_ms && (
                      <span>Query time: {searchQuery.results.events.elapsed_ms}ms</span>
                    )}
                    <div className="flex gap-2">
                      <ActionButton 
                        size="sm"
                        variant="outline"
                        className="px-3 py-1 text-xs"
                        disabled={!urlState.hasPrevious}
                        onClick={urlState.previousPage}
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
                        onClick={urlState.nextPage}
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
        {searchQuery.error && (
          <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-800 rounded-lg p-4">
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

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading search...</div>}>
      <SearchPageContent />
    </Suspense>
  );
}