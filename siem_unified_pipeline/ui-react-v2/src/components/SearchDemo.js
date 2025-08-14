import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * SearchDemo - Simple component to test our typed search API hooks
 *
 * This component demonstrates the new hooks-based approach and validates
 * that our API contracts work correctly with zod validation.
 */
import { useState } from 'react';
import { useCompile, useExecute, useTimeline, useFacets, useSchemaFields, useSchemaEnums, useGrammar } from '@/hooks/useSearchAPI';
export function SearchDemo() {
    const [tenantId] = useState('default');
    const [query, setQuery] = useState('*');
    const [timeSeconds, setTimeSeconds] = useState(3600);
    // Build request objects
    const compileRequest = {
        tenant_id: tenantId,
        q: query,
        time: { last_seconds: timeSeconds },
    };
    const searchRequest = {
        tenant_id: tenantId,
        q: query,
        time: { last_seconds: timeSeconds },
        limit: 100,
    };
    const facetsRequest = {
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
    return (_jsxs("div", { style: { fontFamily: 'monospace', padding: '20px', maxWidth: '1200px' }, children: [_jsx("h2", { children: "\uD83D\uDD0D Search API Demo - Enterprise Hooks" }), _jsxs("div", { style: { marginBottom: '20px', padding: '10px', border: '1px solid #ccc' }, children: [_jsx("h3", { children: "Query Input" }), _jsxs("div", { style: { display: 'flex', gap: '10px', alignItems: 'center' }, children: [_jsx("label", { children: "Query:" }), _jsx("input", { value: query, onChange: (e) => setQuery(e.target.value), style: { padding: '5px', minWidth: '200px' } }), _jsx("label", { children: "Time (seconds):" }), _jsx("input", { type: "number", value: timeSeconds, onChange: (e) => setTimeSeconds(parseInt(e.target.value) || 3600), style: { padding: '5px', width: '100px' } })] })] }), _jsxs("div", { style: { marginBottom: '20px', padding: '10px', border: '1px solid #ccc' }, children: [_jsx("h3", { children: "\uD83D\uDD27 Compile Results" }), compiling && _jsx("p", { children: "\u23F3 Compiling..." }), compileError && _jsxs("p", { style: { color: 'red' }, children: ["\u274C Error: ", compileError.message] }), compileResult && (_jsxs("div", { children: [_jsx("p", { children: _jsx("strong", { children: "SQL:" }) }), _jsx("pre", { style: { background: '#f5f5f5', padding: '10px', overflow: 'auto' }, children: compileResult.sql }), compileResult.warnings && compileResult.warnings.length > 0 && (_jsxs("div", { children: [_jsx("p", { children: _jsx("strong", { children: "Warnings:" }) }), _jsx("ul", { children: compileResult.warnings.map((w, i) => _jsx("li", { style: { color: 'orange' }, children: w }, i)) })] }))] }))] }), _jsxs("div", { style: { marginBottom: '20px', padding: '10px', border: '1px solid #ccc' }, children: [_jsx("h3", { children: "\uD83D\uDCCA Execute Results" }), executing && _jsx("p", { children: "\u23F3 Executing..." }), executeError && _jsxs("p", { style: { color: 'red' }, children: ["\u274C Error: ", executeError.message] }), executeResult && (_jsxs("div", { children: [_jsxs("p", { children: [_jsx("strong", { children: "Meta:" }), " ", executeResult.data.meta.length, " columns"] }), _jsxs("p", { children: [_jsx("strong", { children: "Rows:" }), " ", executeResult.data.data.length] }), _jsxs("p", { children: [_jsx("strong", { children: "Took:" }), " ", executeResult.took_ms, "ms"] }), executeResult.data.meta.length > 0 && (_jsxs("div", { children: [_jsx("p", { children: _jsx("strong", { children: "Columns:" }) }), _jsx("div", { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' }, children: executeResult.data.meta.map((col, i) => (_jsxs("span", { style: { background: '#e3f2fd', padding: '2px 6px', borderRadius: '3px' }, children: [col.name, " (", col.type, ")"] }, i))) })] }))] }))] }), _jsxs("div", { style: { marginBottom: '20px', padding: '10px', border: '1px solid #ccc' }, children: [_jsx("h3", { children: "\uD83D\uDCC8 Timeline Results" }), timelineLoading && _jsx("p", { children: "\u23F3 Loading timeline..." }), timelineResult && (_jsxs("div", { children: [_jsxs("p", { children: [_jsx("strong", { children: "Buckets:" }), " ", timelineResult.buckets.length] }), timelineResult.buckets.slice(0, 5).map((bucket, i) => (_jsxs("div", { style: { fontSize: '12px' }, children: [new Date(bucket.timestamp * 1000).toISOString(), ": ", bucket.count, " events"] }, i)))] }))] }), _jsxs("div", { style: { marginBottom: '20px', padding: '10px', border: '1px solid #ccc' }, children: [_jsx("h3", { children: "\uD83C\uDFAF Facets Results" }), facetsLoading && _jsx("p", { children: "\u23F3 Loading facets..." }), facetsResult && (_jsx("div", { children: Object.entries(facetsResult.facets).map(([field, buckets]) => (_jsxs("div", { style: { marginBottom: '10px' }, children: [_jsx("p", { children: _jsxs("strong", { children: [field, ":"] }) }), buckets.slice(0, 5).map((bucket, i) => (_jsxs("div", { style: { fontSize: '12px', marginLeft: '20px' }, children: [bucket.value, ": ", bucket.count] }, i)))] }, field))) }))] }), _jsxs("div", { style: { marginBottom: '20px', padding: '10px', border: '1px solid #ccc' }, children: [_jsx("h3", { children: "\uD83D\uDCCB Schema Information (Optional)" }), _jsxs("div", { style: { marginBottom: '10px' }, children: [_jsxs("p", { children: [_jsx("strong", { children: "Fields:" }), " ", schemaFields?.fields?.length || 0, " available"] }), schemaFields?.fields?.slice(0, 10).map((field, i) => (_jsxs("span", { style: {
                                    background: '#f3e5f5',
                                    padding: '2px 6px',
                                    borderRadius: '3px',
                                    margin: '2px',
                                    display: 'inline-block',
                                    fontSize: '12px'
                                }, children: [field.name, " (", field.type, ")"] }, i)))] }), _jsxs("div", { style: { marginBottom: '10px' }, children: [_jsxs("p", { children: [_jsx("strong", { children: "Enums:" }), " ", Object.keys(schemaEnums?.enums || {}).length, " field enums"] }), Object.entries(schemaEnums?.enums || {}).slice(0, 3).map(([field, values]) => (_jsxs("div", { style: { fontSize: '12px', marginLeft: '10px' }, children: [field, ": ", values.length, " values"] }, field)))] }), _jsxs("div", { children: [_jsxs("p", { children: [_jsx("strong", { children: "Grammar:" }), " ", grammar ? '✅ Available' : '❌ Not available'] }), grammar && (_jsxs("div", { style: { fontSize: '12px', marginLeft: '10px' }, children: ["Operators: ", grammar.operators?.join(', ')] }))] })] })] }));
}
