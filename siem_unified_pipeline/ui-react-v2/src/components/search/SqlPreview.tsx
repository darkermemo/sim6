/**
 * SqlPreview - displays compiled SQL query
 * Shows the SQL generated from the search query
 */
export default function SqlPreview({ sql }: { sql: string }) {
  if (!sql) return null;
  
  return (
    <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
          📋 Generated SQL Query
        </h3>
        <button
          onClick={() => navigator.clipboard.writeText(sql)}
          style={{
            padding: 'var(--space-xs) var(--space-sm)',
            fontSize: '0.75rem',
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-color)'
          }}
        >
          📋 Copy SQL
        </button>
      </div>
      <pre data-testid="sql" style={{ 
        margin: 0, 
        fontSize: '0.875rem',
        lineHeight: 1.5,
        maxHeight: '200px',
        overflow: 'auto'
      }}>
        {sql}
      </pre>
    </div>
  );
}
