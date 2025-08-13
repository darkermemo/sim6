import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * SchemaPanel - Displays available fields, enums, and grammar
 * Completely defensive rendering with safe defaults
 */
export default function SchemaPanel({ fields, enums, grammar }) {
    // Absolutely defensive - ensure everything is a safe array/object
    const safeFields = Array.isArray(fields) ? fields : [];
    const safeEnums = enums && typeof enums === 'object' ? enums : {};
    // Handle grammar tokens vs keywords difference
    const grammarTokens = Array.isArray(grammar?.tokens) ? grammar.tokens : [];
    const keywords = Array.isArray(grammar?.keywords) ? grammar.keywords : [];
    const operators = Array.isArray(grammar?.operators) ? grammar.operators : [];
    const functions = Array.isArray(grammar?.functions) ? grammar.functions : [];
    const specials = Array.isArray(grammar?.specials) ? grammar.specials : [];
    // Use tokens if available, otherwise use keywords
    const displayTokens = grammarTokens.length > 0 ? grammarTokens : keywords.map(k => ({ label: k }));
    return (_jsxs("aside", { "data-testid": "schema-panel", style: { padding: "10px", borderBottom: "1px solid #ccc", maxHeight: "300px", overflow: "auto" }, children: [_jsx("h3", { children: "Schema" }), _jsxs("section", { children: [_jsx("h4", { children: "Fields" }), safeFields.length === 0 ? (_jsx("div", { "data-testid": "fields-empty", style: { color: "#666", fontSize: "12px" }, children: "No fields available" })) : (_jsx("div", { style: { fontSize: "12px" }, children: safeFields.map((field, index) => (_jsxs("div", { style: { marginBottom: "3px" }, children: [_jsx("strong", { children: field?.name || 'Unknown' }), _jsx("span", { style: { color: "#666", marginLeft: "5px" }, children: field?.type || 'String' }), field?.doc && (_jsx("div", { style: { color: "#888", marginLeft: "10px" }, children: field.doc })), _jsxs("div", { style: { color: "#888", marginLeft: "10px", fontSize: "11px" }, children: [field?.searchable && "searchable", field?.facetable && " • facetable", field?.sortable && " • sortable"] })] }, field?.name || index))) }))] }), _jsxs("section", { style: { marginTop: "15px" }, children: [_jsx("h4", { children: "Grammar" }), displayTokens.length === 0 && keywords.length === 0 && operators.length === 0 && functions.length === 0 ? (_jsx("div", { "data-testid": "grammar-empty", style: { color: "#666", fontSize: "12px" }, children: "Grammar unavailable" })) : (_jsxs("div", { style: { fontSize: "12px" }, children: [displayTokens.length > 0 && (_jsxs("div", { style: { marginBottom: "3px" }, children: [_jsx("strong", { children: "Tokens:" }), " ", displayTokens.map((token, i) => (_jsxs("span", { children: [token.label, token.example ? ` (${token.example})` : '', i < displayTokens.length - 1 ? ', ' : ''] }, i)))] })), keywords.length > 0 && (_jsxs("div", { style: { marginBottom: "3px" }, children: [_jsx("strong", { children: "Keywords:" }), " ", keywords.join(", ")] })), operators.length > 0 && (_jsxs("div", { style: { marginBottom: "3px" }, children: [_jsx("strong", { children: "Operators:" }), " ", operators.join(", ")] })), functions.length > 0 && (_jsxs("div", { style: { marginBottom: "3px" }, children: [_jsx("strong", { children: "Functions:" }), " ", functions.slice(0, 5).join(", "), functions.length > 5 ? '...' : ''] })), specials.length > 0 && (_jsxs("div", { children: [_jsx("strong", { children: "Special:" }), " ", specials.join(", ")] }))] }))] }), _jsxs("section", { style: { marginTop: "15px" }, children: [_jsx("h4", { children: "Enums" }), Object.keys(safeEnums).length === 0 ? (_jsx("div", { "data-testid": "enums-empty", style: { color: "#666", fontSize: "12px" }, children: "No enums available" })) : (_jsx("div", { style: { fontSize: "12px" }, children: Object.entries(safeEnums).map(([field, values]) => {
                            const list = Array.isArray(values) ? values : [];
                            return (_jsxs("div", { style: { marginBottom: "5px" }, children: [_jsxs("strong", { children: [field, ":"] }), _jsx("span", { style: { marginLeft: "5px", color: "#666" }, children: list.length > 0 ? list.join(", ") : "(no values)" })] }, field));
                        }) }))] })] }));
}
