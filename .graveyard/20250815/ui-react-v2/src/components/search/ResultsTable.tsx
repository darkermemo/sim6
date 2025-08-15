/**
 * ResultsTable - renders search results in tabular format
 * Displays data rows with column headers from metadata
 */
export default function ResultsTable({ rows, meta, stats }: { 
  rows: any[]; 
  meta: { name: string }[];
  stats?: { took_ms?: number; total?: number };
}) {
  if (!meta?.length) return null;
  
  const formatValue = (value: any, columnName: string): string => {
    if (value === null || value === undefined) return '';
    
    // Format timestamps
    if (columnName.includes('timestamp') || columnName.includes('_at')) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString();
      }
    }
    
    // Format JSON objects
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    
    return String(value);
  };

  const getSeverityColor = (value: string): string => {
    const severity = value?.toLowerCase();
    switch (severity) {
      case 'critical': return 'var(--color-error)';
      case 'high': return 'var(--color-warning)';
      case 'medium': return 'var(--color-info)';
      case 'low': return 'var(--color-success)';
      default: return 'inherit';
    }
  };
  
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
          📊 Search Results {rows.length > 0 && `(${rows.length} rows)`}
        </h3>
        {stats && (
          <div className="text-sm text-secondary">
            {stats.took_ms && <span>⏱️ {stats.took_ms}ms</span>}
            {stats.total && stats.total > rows.length && (
              <span style={{ marginLeft: 'var(--space-md)' }}>
                Showing {rows.length} of {stats.total} total
              </span>
            )}
          </div>
        )}
      </div>
      
      {rows.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: 'var(--space-2xl)', 
          color: 'var(--text-tertiary)' 
        }}>
          <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>🔍</div>
          <p>No results found</p>
          <p className="text-sm">Try adjusting your search query or time range</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table data-testid="results" style={{ minWidth: '100%' }}>
            <thead>
              <tr>
                {meta.map(m => (
                  <th key={m.name} style={{ whiteSpace: 'nowrap' }}>
                    {m.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {meta.map(m => (
                    <td 
                      key={m.name}
                      style={{
                        maxWidth: '300px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: m.name === 'message' ? 'normal' : 'nowrap',
                        color: m.name === 'severity' ? getSeverityColor(r[m.name]) : 'inherit',
                        fontWeight: m.name === 'severity' ? 600 : 400
                      }}
                      title={formatValue(r[m.name], m.name)}
                    >
                      {formatValue(r[m.name], m.name)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
