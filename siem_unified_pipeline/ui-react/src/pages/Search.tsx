import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/endpoints";
import { useDebouncedModel, type SearchModel, clampLimit, clampTimeRange } from "../hooks/useSearchModel";
import SearchQueryBar from "../components/search/SearchQueryBar";
import SqlPreview from "../components/search/SqlPreview";
import ResultsTable from "../components/search/ResultsTable";
import StatsStrip from "../components/search/StatsStrip";

export default function Search() {
  const { model, setModel, debounced } = useDebouncedModel();
  const [sql, setSql] = useState<string>("");
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<{ name: string; type?: string }[] | undefined>();
  const [error, setError] = useState<string>("");
  const inflight = useRef<AbortController | null>(null);

  const body = useMemo(() => {
    const s: SearchModel = clampTimeRange({ ...debounced, limit: clampLimit(debounced.limit) });
    // Build unified DSL body
    const where = s.where
      ? s.where.op === "contains"
        ? { Contains: [s.where.args[0], s.where.args[1]] }
        : s.where.op === "json_eq"
          ? { JsonEq: [s.where.args[0], s.where.args[1]] }
          : { IpInCidr: [s.where.args[0], s.where.args[1]] }
      : undefined;
    return {
      search: {
        tenant_ids: s.tenant_ids,
        time_range: s.time_range,
        where,
        limit: s.limit,
        order_by: s.order_by,
      },
    } as any;
  }, [debounced]);

  const run = async () => {
    setError("");
    // Compile
    try {
      const res = await fetch("/api/v2/search/compile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      setSql(j.sql || "");
    } catch (e: any) {
      setSql("");
      setError(String(e?.message || e));
      return;
    }
    // Execute (cancel any in-flight)
    if (inflight.current) inflight.current.abort();
    const ctl = new AbortController(); inflight.current = ctl;
    try {
      const res = await fetch("/api/v2/search/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      const data = j?.data?.data || j?.data || [];
      setRows(Array.isArray(data) ? data : []);
      setMeta(j?.data?.meta);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setError(String(e?.message || e));
    }
  };

  useEffect(() => { /* initial run */ run(); /* eslint-disable-next-line */ }, []);

  return (
    <div style={{ display: "grid", gap: 12, padding: 12 }}>
      <h2>Search</h2>
      <SearchQueryBar value={model} onChange={setModel} onRun={run} />
      <SqlPreview sql={sql} />
      {error ? <div style={{ color: "#e33", whiteSpace: "pre-wrap" }}>{error}</div> : null}
      <ResultsTable rows={rows} meta={meta} />
      <StatsStrip />
    </div>
  );
}

// legacy WIP content removed for minimal page
import { useQuery, useMutation } from '@tanstack/react-query';
import { QueryBar } from '@/components/search/QueryBar';
import { ResultsGrid } from '@/components/search/ResultsGrid';
import { Facets } from '@/components/search/Facets';
import { EmptyState } from '@/components/search/EmptyState';
import { useUrlState } from '@/hooks/useUrlState';
import { searchApi, parseTimeRange } from '@/lib/search';
import type { SearchRow } from '@/lib/search';
import { AlertCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CompileDrawerProps {
  sql?: string;
  warnings?: string[];
  error?: string;
  onClose: () => void;
}

function CompileDrawer({ sql, warnings, error, onClose }: CompileDrawerProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg z-40">
      <div className="max-w-7xl mx-auto p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">SQL Preview</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        
        {error ? (
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        ) : (
          <>
            {warnings && warnings.length > 0 && (
              <div className="mb-3 space-y-1">
                {warnings.map((warning, i) => (
                  <div key={i} className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <Info className="w-4 h-4" />
                    <span className="text-sm">{warning}</span>
                  </div>
                ))}
              </div>
            )}
            <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto text-sm">
              <code>{sql}</code>
            </pre>
          </>
        )}
      </div>
    </div>
  );
}

export function SearchPage() {
  const [urlState, setUrlState] = useUrlState({
    tenant: '',
    range: '15m',
    q: '',
    cols: DEFAULT_COLUMNS.join(','),
  });

  const [showCompileDrawer, setShowCompileDrawer] = React.useState(false);
  const [compileResult, setCompileResult] = React.useState<{
    sql?: string;
    warnings?: string[];
    error?: string;
  }>({});

  // Parse selected columns from URL
  const selectedColumns = React.useMemo(
    () => urlState.cols ? urlState.cols.split(',').filter(Boolean) : DEFAULT_COLUMNS,
    [urlState.cols]
  );



  // Search execution
  const { 
    data: searchResults, 
    isLoading: isSearching, 
    error: searchError,
    refetch: executeSearch 
  } = useQuery({
    queryKey: ['search', urlState.tenant, urlState.range, urlState.q],
    queryFn: () => searchApi.execute({
      tenant_id: parseInt(urlState.tenant),
      time: parseTimeRange(urlState.range),
      q: urlState.q,
      limit: 1000,
    }),
    enabled: false, // Manual execution only
  });

  // Facets query
  const { data: facetsData, isLoading: facetsLoading, error: facetsError } = useQuery({
    queryKey: ['facets', urlState.tenant, urlState.range, urlState.q],
    queryFn: () => searchApi.facets({
      tenant_id: parseInt(urlState.tenant),
      time: parseTimeRange(urlState.range),
      q: urlState.q,
      fields: ['log_source', 'user', 'src_ip', 'severity', 'event_type'],
      size: 20,
    }),
    enabled: !!searchResults && searchResults.data.length > 0,
  });

  // Compile mutation
  const compileMutation = useMutation({
    mutationFn: () => searchApi.compile({
      tenant_id: parseInt(urlState.tenant),
      time: parseTimeRange(urlState.range),
      q: urlState.q,
    }),
    onSuccess: (data) => {
      setCompileResult({ sql: data.sql, warnings: data.warnings });
      setShowCompileDrawer(true);
    },
    onError: (error) => {
      setCompileResult({ error: error.message });
      setShowCompileDrawer(true);
    },
  });

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: () => searchApi.export({
      tenant_id: parseInt(urlState.tenant),
      time: parseTimeRange(urlState.range),
      q: urlState.q,
      limit: 10000,
    }),
    onSuccess: (data) => {
      // Show toast with download link
      console.log('Export link:', data.link);
    },
  });

  // Handlers
  const handleQueryChange = (query: string) => {
    setUrlState({ q: query });
  };

  const handleCompile = () => {
    if (!urlState.tenant) return;
    compileMutation.mutate();
  };

  const handleRun = () => {
    if (!urlState.tenant) return;
    
    // Validate limits
    const timeRange = parseTimeRange(urlState.range);
    if ('last_seconds' in timeRange && timeRange.last_seconds > 7 * 24 * 60 * 60) {
      console.warn('Time range exceeds 7 days, clamping to 7d');
    }
    
    executeSearch();
  };

  const handleTail = () => {
    // Stub for SSE implementation
    console.log('Tail feature coming soon');
  };

  const handleSave = () => {
    // Stub for save functionality
    console.log('Save search coming soon');
  };

  const handleExport = () => {
    exportMutation.mutate();
  };

  const handleFacetClick = (field: string, value: string) => {
    // Append to query
    const newQuery = urlState.q ? `${urlState.q} AND ${field}:"${value}"` : `${field}:"${value}"`;
    setUrlState({ q: newQuery });
    // Re-run search
    setTimeout(() => executeSearch(), 100);
  };

  const handleColumnChange = (columns: string[]) => {
    setUrlState({ cols: columns.join(',') });
  };

  const handleRowClick = (row: SearchRow) => {
    // Could expand inline or open detail drawer
    console.log('Row clicked:', row);
  };

  const handlePivot = (row: SearchRow) => {
    // Build query from key fields
    const pivotFields = ['alert_key', 'user', 'src_ip', 'event_type']
      .filter(field => row[field])
      .map(field => `${field}:"${row[field]}"`)
      .join(' AND ');
    
    setUrlState({ q: pivotFields });
    setTimeout(() => executeSearch(), 100);
  };

  return (
    <>
      <div className="flex h-full">
        {/* Left rail - Saved views (placeholder) */}
        <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Saved Views</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Coming soon</p>
        </div>

        {/* Main content */}
        <div className="flex-1 p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Search</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Query and explore your security events
            </p>
          </div>

          {/* Query Bar */}
          <QueryBar
            tenant={urlState.tenant}
            query={urlState.q}
            isLoading={isSearching || compileMutation.isPending}
            onQueryChange={handleQueryChange}
            onCompile={handleCompile}
            onRun={handleRun}
            onTail={handleTail}
            onSave={handleSave}
            onExport={handleExport}
          />

          {/* Results or empty state */}
          <div className="mt-6">
            {!urlState.tenant ? (
              <EmptyState type="no-tenant" />
            ) : searchError ? (
              <EmptyState 
                type="error" 
                error={searchError.message}
                onRetry={executeSearch}
              />
            ) : searchResults && searchResults.data.length === 0 ? (
              <EmptyState 
                type="no-results"
                onLoadDemo={() => console.log('Load demo data')}
              />
            ) : searchResults ? (
              <>
                {/* Meta info */}
                <div className="mb-4 flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                  <span>{searchResults.meta.row_count} results</span>
                  <span>•</span>
                  <span>{searchResults.meta.took_ms}ms</span>
                </div>

                {/* Results grid */}
                <ResultsGrid
                  rows={searchResults.data}
                  selectedColumns={selectedColumns}
                  onColumnChange={handleColumnChange}
                  onRowClick={handleRowClick}
                  onPivot={handlePivot}
                />
              </>
            ) : null}
          </div>
        </div>

        {/* Right rail - Facets */}
        {searchResults && searchResults.data.length > 0 && (
          <div className="w-80 bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 p-4 overflow-y-auto">
            <Facets
              facets={facetsData || {}}
              isLoading={facetsLoading}
              error={facetsError?.message}
              onFacetClick={handleFacetClick}
            />
          </div>
        )}
      </div>

      {/* Compile drawer */}
      {showCompileDrawer && (
        <CompileDrawer
          sql={compileResult.sql}
          warnings={compileResult.warnings}
          error={compileResult.error}
          onClose={() => setShowCompileDrawer(false)}
        />
      )}
    </>
  );
}

// Default columns constant
const DEFAULT_COLUMNS = [
  'event_timestamp',
  'source',
  'message',
  'user',
  'src_ip',
  'dst_ip',
  'host',
];