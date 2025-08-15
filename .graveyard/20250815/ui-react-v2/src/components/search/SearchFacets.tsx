import * as Types from "@/lib/api-types";

interface Props {
  facets: Types.SearchFacetsResponse;
  onFacetClick: (field: string, value: string) => void;
}

/**
 * Faceted search sidebar showing top values for key fields
 */
export default function SearchFacets({ facets, onFacetClick }: Props) {
  const getFieldColor = (field: string, value: string): string => {
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

  return (
    <div>
      {Object.entries(facets.facets).map(([field, values]) => (
        <div key={field} style={{ marginBottom: "var(--space-lg)" }}>
          <h4 style={{ 
            marginBottom: "var(--space-sm)",
            fontSize: "0.875rem",
            fontWeight: 600,
            textTransform: "capitalize"
          }}>
            {field.replace(/_/g, " ")}
          </h4>
          
          {values.length === 0 ? (
            <div className="text-sm text-tertiary">No values</div>
          ) : (
            <div>
              {values.map(({ value, count }) => (
                <div
                  key={value}
                  onClick={() => onFacetClick(field, value)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "var(--space-xs) var(--space-sm)",
                    marginBottom: "var(--space-xs)",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    backgroundColor: "transparent",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <span style={{ 
                    fontSize: "0.875rem",
                    color: getFieldColor(field, value),
                    fontWeight: field === "severity" ? 600 : 400,
                  }}>
                    {value || "(empty)"}
                  </span>
                  <span style={{
                    fontSize: "0.75rem",
                    color: "var(--text-tertiary)",
                    backgroundColor: "var(--bg-secondary)",
                    padding: "0.125rem 0.375rem",
                    borderRadius: "var(--radius-sm)",
                  }}>
                    {count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
