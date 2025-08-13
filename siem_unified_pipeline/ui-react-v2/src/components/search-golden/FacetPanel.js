import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * FacetPanel - Shows available facets with counts
 * Clicking a facet value updates the query
 */
export default function FacetPanel({ facets, onToggle }) {
    if (!facets)
        return null;
    return (_jsxs("div", { style: { padding: "10px", borderBottom: "1px solid #ccc" }, children: [_jsx("h3", { children: "Facets" }), Object.entries(facets).map(([field, buckets]) => (_jsxs("div", { style: { marginBottom: "15px" }, children: [_jsx("h4", { style: { margin: "5px 0" }, children: field }), _jsx("div", { "data-testid": `facet-${field}`, children: buckets.map(bucket => (_jsxs("div", { onClick: () => onToggle(field, bucket.value), style: {
                                padding: "2px 5px",
                                cursor: "pointer",
                                display: "flex",
                                justifyContent: "space-between",
                            }, onMouseEnter: e => e.currentTarget.style.backgroundColor = "#f0f0f0", onMouseLeave: e => e.currentTarget.style.backgroundColor = "transparent", children: [_jsx("span", { children: bucket.value || "(empty)" }), _jsx("span", { style: { color: "#666" }, children: bucket.count })] }, bucket.value))) })] }, field)))] }));
}
