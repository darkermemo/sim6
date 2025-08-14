import * as Types from "@/lib/search-types";

interface Props {
  facets?: Record<string, Types.FacetBucket[]>;
  onToggle: (field: string, value: string) => void;
}

/**
 * FacetPanel - Shows available facets with counts
 * Clicking a facet value updates the query
 */
export default function FacetPanel({ facets, onToggle }: Props) {
  if (!facets) return null;

  return (
    <div style={{ padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>
      <h3 style={{ margin: "0 0 6px 0", fontSize: "12px", fontWeight: "600", color: "#64748b" }}>Facets</h3>
      {Object.entries(facets).map(([field, buckets]) => (
        <div key={field} style={{ marginBottom: "8px" }}>
          <h4 style={{ margin: "0 0 3px 0", fontSize: "11px", fontWeight: "600", color: "#64748b" }}>{field}</h4>
          <div data-testid={`facet-${field}`}>
            {buckets.map(bucket => (
              <div 
                key={bucket.value}
                onClick={() => onToggle(field, bucket.value)}
                style={{
                  padding: "1px 3px",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  borderRadius: "2px",
                  fontSize: "10px"
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "#f1f5f9"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
              >
                <span style={{ color: "#374151" }}>{bucket.value || "(empty)"}</span>
                <span style={{ color: "#94a3b8", fontWeight: "600" }}>{bucket.count}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
