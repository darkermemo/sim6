import { useEffect, useState } from "react";
import SearchQueryBar, { type Model } from "@/components/search/SearchQueryBar";
import ResultsTable from "@/components/search/ResultsTable";
import { httpPost } from "@/lib/http";

// Temporary types until we migrate to api-golden
type SearchIntent = {
  tenant_id: string;
  time: { last_seconds?: number; from?: number; to?: number; };
  q: string;
  limit?: number;
};

type SearchResponse = {
  data: any[];
  meta: { name: string; type: string; }[];
  statistics: { rows: number; took_ms: number; rows_read: number; bytes_read: number; };
};

/**
 * Search page - main search interface
 * Manages the compile → execute flow with query builder, SQL preview, and results display
 */
export default function Search() {
  const [model, setModel] = useState<Model>({ 
    tenant_id: "default", 
    last_seconds: 600, 
    q: "message:hello" 
  });

  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<{name:string;type?:string}[]>([]);
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<{ took_ms?: number; total?: number }>({});

  /**
   * Run search - send structured intent, receive results
   * No SQL is ever exposed to the frontend
   */
  async function run() {
    try {
      setError("");
      setIsLoading(true);
      
      // Build search intent
      const intent: SearchIntent = { 
        tenant_id: model.tenant_id, 
        time: { last_seconds: model.last_seconds }, 
        q: model.q,
        limit: 50 
      };
      
      // Execute search with structured intent
      const response: SearchResponse = await httpPost<SearchResponse>('/search/execute', intent);
      
      setRows(response.data);
      setMeta(response.meta);
      setStats({ 
        took_ms: response.statistics.took_ms, 
        total: response.statistics.rows 
      });
    } catch (err: any) {
      setError(err.message || String(err));
      setRows([]);
      setMeta([]);
    } finally {
      setIsLoading(false);
    }
  }

  // Run initial search on mount
  useEffect(() => { 
    run(); 
  }, []);

  return (
    <div className="container">
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <h2 style={{ margin: 0, marginBottom: 'var(--space-xs)' }}>Search Events</h2>
        <p className="text-secondary" style={{ margin: 0 }}>
          Query your security events with powerful search capabilities
        </p>
      </div>
      
      <SearchQueryBar 
        value={model} 
        onChange={setModel} 
        onRun={run} 
        isLoading={isLoading}
      />
      
      {error ? (
        <div data-testid="error" className="card" style={{ 
          backgroundColor: 'rgba(239, 68, 68, 0.1)', 
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: 'var(--color-error)',
          marginBottom: 'var(--space-lg)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <span style={{ fontSize: '1rem', fontWeight: 'bold', color: '#ef4444' }}>ERROR</span>
            <div>
              <strong>Search Error</strong>
              <p style={{ margin: 0, marginTop: 'var(--space-xs)' }}>{error}</p>
            </div>
          </div>
        </div>
      ) : null}
      
      {/* No SQL preview - security requirement */}
      
      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
          <div className="loading" style={{ fontSize: '2rem', marginBottom: 'var(--space-md)' }}>⟳</div>
          <p className="text-secondary">Searching events...</p>
        </div>
      ) : (
        <ResultsTable rows={rows} meta={meta} stats={stats} />
      )}
    </div>
  );
}
