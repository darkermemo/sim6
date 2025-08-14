import { useState } from "react";
import CompactSelect from "@/components/ui/CompactSelect";

export type Model = {
  tenant_id: string;
  last_seconds: number;
  q: string;
};

/**
 * SearchQueryBar - input controls for search parameters
 * Manages tenant_id, time range (last_seconds), and query string
 * Emits onChange for each field update and onRun when user clicks Run
 */
export default function SearchQueryBar(props: {
  value: Model;
  onChange(v: Model): void;
  onRun(): void;
  isLoading?: boolean;
}) {
  const [m, setM] = useState(props.value);

  /**
   * Update a single field in the model
   */
  function set<K extends keyof Model>(k: K, v: Model[K]) {
    const next = { ...m, [k]: v };
    setM(next);
    props.onChange(next);
  }

  const timeOptions = [
    { value: 60, label: 'Last 1 minute' },
    { value: 300, label: 'Last 5 minutes' },
    { value: 900, label: 'Last 15 minutes' },
    { value: 1800, label: 'Last 30 minutes' },
    { value: 3600, label: 'Last 1 hour' },
    { value: 21600, label: 'Last 6 hours' },
    { value: 86400, label: 'Last 24 hours' },
  ];

  return (
    <div data-testid="querybar" className="card" style={{ marginBottom: 'var(--space-lg)' }}>
      <div style={{ display: 'grid', gap: 'var(--space-md)', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div>
          <label htmlFor="tenant" className="text-sm text-secondary" style={{ display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 500 }}>
            Tenant ID
          </label>
          <input
            id="tenant"
            aria-label="tenant"
            value={m.tenant_id}
            onChange={e => set("tenant_id", e.target.value)}
            placeholder="Enter tenant ID"
            style={{ width: '100%' }}
          />
        </div>
        
        <div>
          <label htmlFor="timerange" className="text-sm text-secondary" style={{ display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 500 }}>
            Time Range
          </label>
          <CompactSelect
            value={m.last_seconds}
            onChange={(value) => set("last_seconds", Number(value))}
            size="md"
            aria-label="Time range"
            options={timeOptions.map(opt => ({ value: opt.value, label: opt.label }))}
          />
        </div>
      </div>
      
      <div style={{ marginTop: 'var(--space-md)' }}>
        <label htmlFor="query" className="text-sm text-secondary" style={{ display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 500 }}>
          Search Query
        </label>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <input
            id="query"
            aria-label="query"
            value={m.q}
            onChange={e => set("q", e.target.value)}
            placeholder="Enter search query (e.g., message:error AND severity:high)"
            style={{ flex: 1 }}
            onKeyDown={e => e.key === 'Enter' && props.onRun()}
          />
          <button 
            onClick={props.onRun} 
            aria-label="run"
            disabled={props.isLoading || !m.tenant_id || !m.q}
            style={{
              padding: '0 var(--space-xl)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-xs)'
            }}
          >
            {props.isLoading ? (
              <>
                <span className="loading">⟳</span> Searching...
              </>
            ) : (
              <>
                🔍 Run Search
              </>
            )}
          </button>
        </div>
        <p className="text-xs text-tertiary" style={{ marginTop: 'var(--space-xs)' }}>
          Use Lucene-style syntax: field:value, AND, OR, NOT, wildcards (*), phrases ("exact match")
        </p>
      </div>
    </div>
  );
}
