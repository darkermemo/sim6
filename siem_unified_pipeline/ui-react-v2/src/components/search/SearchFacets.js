import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Faceted search sidebar showing top values for key fields
 */
export default function SearchFacets({ facets, onFacetClick }) {
    const getFieldColor = (field, value) => {
        if (field === "severity") {
            switch (value.toLowerCase()) {
                case "critical": return "var(--color-error)";
                case "high": return "var(--color-warning)";
                case "medium": return "var(--color-info)";
                case "low": return "var(--color-success)";
            }
        }
        return "var(--color-primary)";
    };
    return (_jsx("div", { children: Object.entries(facets.facets).map(([field, values]) => (_jsxs("div", { style: { marginBottom: "var(--space-lg)" }, children: [_jsx("h4", { style: {
                        marginBottom: "var(--space-sm)",
                        fontSize: "0.875rem",
                        fontWeight: 600,
                        textTransform: "capitalize"
                    }, children: field.replace(/_/g, " ") }), values.length === 0 ? (_jsx("div", { className: "text-sm text-tertiary", children: "No values" })) : (_jsx("div", { children: values.map(({ value, count }) => (_jsxs("div", { onClick: () => onFacetClick(field, value), style: {
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "var(--space-xs) var(--space-sm)",
                            marginBottom: "var(--space-xs)",
                            borderRadius: "var(--radius-sm)",
                            cursor: "pointer",
                            transition: "all 0.2s",
                            backgroundColor: "transparent",
                        }, onMouseEnter: (e) => {
                            e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
                        }, onMouseLeave: (e) => {
                            e.currentTarget.style.backgroundColor = "transparent";
                        }, children: [_jsx("span", { style: {
                                    fontSize: "0.875rem",
                                    color: getFieldColor(field, value),
                                    fontWeight: field === "severity" ? 600 : 400,
                                }, children: value || "(empty)" }), _jsx("span", { style: {
                                    fontSize: "0.75rem",
                                    color: "var(--text-tertiary)",
                                    backgroundColor: "var(--bg-secondary)",
                                    padding: "0.125rem 0.375rem",
                                    borderRadius: "var(--radius-sm)",
                                }, children: count.toLocaleString() })] }, value))) }))] }, field))) }));
}
