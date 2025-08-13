import { useEffect, useState } from "react";
import { api, type PanelDef, type PanelResult } from "@/lib/api";

/**
 * Dashboard page - demonstrates secure panel queries
 * All panels use allow-listed SQL templates on the backend
 */
export default function Dashboard() {
  const [panels, setPanels] = useState<PanelResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");
  
  // Panel definitions - no SQL, just structured intents
  const panelDefs: PanelDef[] = [
    { kind: "timeseries_count", id: "events_over_time" },
    { kind: "by_severity_top", id: "severity_dist", limit: 5 },
    { kind: "single_stat", id: "total_events", stat: "count" },
    { kind: "single_stat", id: "unique_users", stat: "unique_users" },
    { kind: "top_sources", id: "top_sources", limit: 10 },
    { kind: "event_types", id: "event_types", limit: 10 },
  ];
  
  async function loadPanels() {
    try {
      setError("");
      setIsLoading(true);
      
      // Time range: last hour
      const now = Math.floor(Date.now() / 1000);
      const oneHourAgo = now - 3600;
      
      const response = await api.panels({
        tenant_id: "default",
        time: {
          from: oneHourAgo,
          to: now,
          interval_seconds: 300, // 5 minutes
        },
        panels: panelDefs,
      });
      
      setPanels(response.results);
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  }
  
  useEffect(() => {
    loadPanels();
    // Refresh every 30 seconds
    const interval = setInterval(loadPanels, 30000);
    return () => clearInterval(interval);
  }, []);
  
  // Render different panel types
  const renderPanel = (panel: PanelResult) => {
    if (panel.error) {
      return (
        <div key={panel.id} className="card" style={{ 
          backgroundColor: 'rgba(239, 68, 68, 0.1)', 
          border: '1px solid rgba(239, 68, 68, 0.3)' 
        }}>
          <h4>{panel.id}</h4>
          <p className="text-error">{panel.error}</p>
        </div>
      );
    }
    
    // Single stat panels
    if (panel.columns.length === 1 && panel.columns[0] === "value") {
      const value = panel.rows[0]?.value || 0;
      return (
        <div key={panel.id} className="card">
          <h4 className="text-sm text-secondary" style={{ marginBottom: 'var(--space-sm)' }}>
            {panel.id.replace(/_/g, ' ').toUpperCase()}
          </h4>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--color-primary)' }}>
            {value.toLocaleString()}
          </div>
        </div>
      );
    }
    
    // Timeseries panel
    if (panel.id === "events_over_time") {
      return (
        <div key={panel.id} className="card" style={{ gridColumn: 'span 2' }}>
          <h4>Events Over Time</h4>
          <div style={{ height: '200px', overflowY: 'auto' }}>
            {/* In production, use a charting library */}
            <pre>{JSON.stringify(panel.rows, null, 2)}</pre>
          </div>
        </div>
      );
    }
    
    // Table panels
    return (
      <div key={panel.id} className="card">
        <h4>{panel.id.replace(/_/g, ' ').toUpperCase()}</h4>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '0.875rem' }}>
            <thead>
              <tr>
                {panel.columns.map(col => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {panel.rows.slice(0, 5).map((row, i) => (
                <tr key={i}>
                  {panel.columns.map(col => (
                    <td key={col}>{row[col]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };
  
  return (
    <div data-testid="page-dashboard" className="container">
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <h2 style={{ margin: 0, marginBottom: 'var(--space-xs)' }}>📊 Security Dashboard</h2>
        <p className="text-secondary" style={{ margin: 0 }}>
          Real-time security metrics and insights
        </p>
      </div>
      
      {error && (
        <div className="card" style={{ 
          backgroundColor: 'rgba(239, 68, 68, 0.1)', 
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: 'var(--color-error)',
          marginBottom: 'var(--space-lg)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <span style={{ fontSize: '1.5rem' }}>⚠️</span>
            <div>
              <strong>Dashboard Error</strong>
              <p style={{ margin: 0, marginTop: 'var(--space-xs)' }}>{error}</p>
            </div>
          </div>
        </div>
      )}
      
      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
          <div className="loading" style={{ fontSize: '2rem', marginBottom: 'var(--space-md)' }}>⟳</div>
          <p className="text-secondary">Loading dashboard...</p>
        </div>
      ) : (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 'var(--space-lg)'
        }}>
          {panels.map(renderPanel)}
        </div>
      )}
    </div>
  );
}
