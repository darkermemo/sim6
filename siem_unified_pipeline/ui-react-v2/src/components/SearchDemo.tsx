/**
 * SearchDemo - Simple component to test our typed search API hooks
 * 
 * This component demonstrates the new hooks-based approach and validates
 * that our API contracts work correctly with zod validation.
 */

import React, { useState } from 'react';
import { 
  useCompile, 
  useExecute, 
  useTimeline, 
  useFacets,
  useSchemaFields,
  useSchemaEnums,
  useGrammar,
  type SearchRequest,
  type CompileRequest,
  type FacetsRequest
} from '@/hooks/useSearchAPI';

export function SearchDemo() {
  const [tenantId] = useState('default');
  const [query, setQuery] = useState('*');
  const [timeSeconds, setTimeSeconds] = useState(3600);

  // Build request objects
  const compileRequest: CompileRequest = {
    tenant_id: tenantId,
    q: query,
    time: { last_seconds: timeSeconds },
  };

  const searchRequest: SearchRequest = {
    tenant_id: tenantId,
    q: query,
    time: { last_seconds: timeSeconds },
    limit: 100,
  };

  const facetsRequest: FacetsRequest = {
    tenant_id: tenantId,
    q: query,
    time: { last_seconds: timeSeconds },
    facets: [
      { field: 'source_type', size: 10 },
      { field: 'severity', size: 5 },
    ],
  };

  // Use the typed hooks
  const { data: compileResult, isLoading: compiling, error: compileError } = useCompile(compileRequest);
  const { data: executeResult, isLoading: executing, error: executeError } = useExecute(searchRequest, { 
    enabled: !!compileResult?.sql 
  });
  const { data: timelineResult, isLoading: timelineLoading } = useTimeline(searchRequest, { 
    enabled: !!compileResult?.sql 
  });
  const { data: facetsResult, isLoading: facetsLoading } = useFacets(facetsRequest, { 
    enabled: !!compileResult?.sql 
  });

  // Schema hooks (optional endpoints)
  const { data: schemaFields } = useSchemaFields('events');
  const { data: schemaEnums } = useSchemaEnums({ tenant_id: tenantId, last_seconds: timeSeconds });
  const { data: grammar } = useGrammar();

  return (
    <div style={{ fontFamily: 'monospace', padding: '20px', maxWidth: '1200px' }}>
      <h2>🔍 Search API Demo - Enterprise Hooks</h2>
      
      {/* Query Input */}
      <div style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ccc' }}>
        <h3>Query Input</h3>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label>Query:</label>
          <input 
            value={query} 
            onChange={(e) => setQuery(e.target.value)}
            style={{ padding: '5px', minWidth: '200px' }}
          />
          <label>Time (seconds):</label>
          <input 
            type="number"
            value={timeSeconds} 
            onChange={(e) => setTimeSeconds(parseInt(e.target.value) || 3600)}
            style={{ padding: '5px', width: '100px' }}
          />
        </div>
      </div>

      {/* Compile Results */}
      <div style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ccc' }}>
        <h3>🔧 Compile Results</h3>
        {compiling && <p>⏳ Compiling...</p>}
        {compileError && <p style={{ color: 'red' }}>❌ Error: {compileError.message}</p>}
        {compileResult && (
          <div>
            <p><strong>SQL:</strong></p>
            <pre style={{ background: '#f5f5f5', padding: '10px', overflow: 'auto' }}>
              {compileResult.sql}
            </pre>
            {compileResult.warnings && compileResult.warnings.length > 0 && (
              <div>
                <p><strong>Warnings:</strong></p>
                <ul>
                  {compileResult.warnings.map((w, i) => <li key={i} style={{ color: 'orange' }}>{w}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Execute Results */}
      <div style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ccc' }}>
        <h3>📊 Execute Results</h3>
        {executing && <p>⏳ Executing...</p>}
        {executeError && <p style={{ color: 'red' }}>❌ Error: {executeError.message}</p>}
        {executeResult && (
          <div>
            <p><strong>Meta:</strong> {executeResult.data.meta.length} columns</p>
            <p><strong>Rows:</strong> {executeResult.data.data.length}</p>
            <p><strong>Took:</strong> {executeResult.took_ms}ms</p>
            
            {executeResult.data.meta.length > 0 && (
              <div>
                <p><strong>Columns:</strong></p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {executeResult.data.meta.map((col, i) => (
                    <span key={i} style={{ background: '#e3f2fd', padding: '2px 6px', borderRadius: '3px' }}>
                      {col.name} ({col.type})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ccc' }}>
        <h3>📈 Timeline Results</h3>
        {timelineLoading && <p>⏳ Loading timeline...</p>}
        {timelineResult && (
          <div>
            <p><strong>Buckets:</strong> {timelineResult.buckets.length}</p>
            {timelineResult.buckets.slice(0, 5).map((bucket, i) => (
              <div key={i} style={{ fontSize: '12px' }}>
                {new Date(bucket.timestamp * 1000).toISOString()}: {bucket.count} events
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Facets */}
      <div style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ccc' }}>
        <h3>🎯 Facets Results</h3>
        {facetsLoading && <p>⏳ Loading facets...</p>}
        {facetsResult && (
          <div>
            {Object.entries(facetsResult.facets).map(([field, buckets]) => (
              <div key={field} style={{ marginBottom: '10px' }}>
                <p><strong>{field}:</strong></p>
                {buckets.slice(0, 5).map((bucket, i) => (
                  <div key={i} style={{ fontSize: '12px', marginLeft: '20px' }}>
                    {bucket.value}: {bucket.count}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Schema Info (Optional Endpoints) */}
      <div style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ccc' }}>
        <h3>📋 Schema Information (Optional)</h3>
        
        <div style={{ marginBottom: '10px' }}>
          <p><strong>Fields:</strong> {schemaFields?.fields?.length || 0} available</p>
          {schemaFields?.fields?.slice(0, 10).map((field, i) => (
            <span key={i} style={{ 
              background: '#f3e5f5', 
              padding: '2px 6px', 
              borderRadius: '3px', 
              margin: '2px',
              display: 'inline-block',
              fontSize: '12px'
            }}>
              {field.name} ({field.type})
            </span>
          ))}
        </div>

        <div style={{ marginBottom: '10px' }}>
          <p><strong>Enums:</strong> {Object.keys(schemaEnums?.enums || {}).length} field enums</p>
          {Object.entries(schemaEnums?.enums || {}).slice(0, 3).map(([field, values]) => (
            <div key={field} style={{ fontSize: '12px', marginLeft: '10px' }}>
              {field}: {values.length} values
            </div>
          ))}
        </div>

        <div>
          <p><strong>Grammar:</strong> {grammar ? '✅ Available' : '❌ Not available'}</p>
          {grammar && (
            <div style={{ fontSize: '12px', marginLeft: '10px' }}>
              Operators: {grammar.operators?.join(', ')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SearchDemo;
