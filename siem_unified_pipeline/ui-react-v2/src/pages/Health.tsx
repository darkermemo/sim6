import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * Health page - displays API health check status
 * Shows health endpoint JSON response or error
 */
export default function Health() {
  const [j, setJ] = useState<any>(null);
  const [err, setErr] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api.health()
      .then(setJ)
      .catch(e => setErr(String(e)))
      .finally(() => setIsLoading(false));
  }, []);

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'ok': return 'var(--color-success)';
      case 'degraded': return 'var(--color-warning)';
      case 'down': return 'var(--color-error)';
      default: return 'var(--text-secondary)';
    }
  };

  const components = [
    { name: 'API Server', status: j?.status || 'unknown', icon: '🖥️' },
    { name: 'ClickHouse', status: j?.cidr_fn ? 'ok' : 'unknown', icon: '🗄️' },
    { name: 'Redis', status: j?.redis || 'unknown', icon: '💾' },
    { name: 'Ingest Path', status: j?.ingest_path ? 'ok' : 'unknown', icon: '📥' }
  ];

  return (
    <div className="container">
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <h2 style={{ margin: 0, marginBottom: 'var(--space-xs)' }}>💚 System Health</h2>
        <p className="text-secondary" style={{ margin: 0 }}>
          Monitor the health status of all system components
        </p>
      </div>

      {err && (
        <div data-testid="health-error" className="card" style={{ 
          backgroundColor: 'rgba(239, 68, 68, 0.1)', 
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: 'var(--color-error)',
          marginBottom: 'var(--space-lg)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <span style={{ fontSize: '1.5rem' }}>⚠️</span>
            <div>
              <strong>Health Check Error</strong>
              <p style={{ margin: 0, marginTop: 'var(--space-xs)' }}>{err}</p>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
          <div className="loading" style={{ fontSize: '2rem', marginBottom: 'var(--space-md)' }}>⟳</div>
          <p className="text-secondary">Checking system health...</p>
        </div>
      ) : (
        <>
          <div className="grid" style={{ 
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: 'var(--space-lg)',
            marginBottom: 'var(--space-xl)'
          }}>
            {components.map((comp) => (
              <div key={comp.name} className="card" style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-md)'
              }}>
                <div style={{ fontSize: '2rem' }}>{comp.icon}</div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: 0, marginBottom: 'var(--space-xs)' }}>{comp.name}</h4>
                  <div style={{ 
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--space-xs)',
                    padding: '0.25rem 0.75rem',
                    backgroundColor: `${getStatusColor(comp.status)}20`,
                    color: getStatusColor(comp.status),
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    textTransform: 'uppercase'
                  }}>
                    <span style={{ 
                      width: '8px', 
                      height: '8px', 
                      backgroundColor: getStatusColor(comp.status),
                      borderRadius: '50%',
                      display: 'inline-block'
                    }} />
                    {comp.status}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {j && (
            <div className="card">
              <h3 style={{ marginBottom: 'var(--space-md)' }}>📋 Raw Health Response</h3>
              <pre data-testid="health-json" style={{ 
                margin: 0,
                fontSize: '0.875rem',
                overflow: 'auto'
              }}>
                {JSON.stringify(j, null, 2)}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
