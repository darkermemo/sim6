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
    <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--card)" }}>
      <h3 style={{ margin: "0 0 6px 0", fontSize: "12px", fontWeight: "600", color: "var(--fg-muted)" }}>Facets</h3>
      {Object.entries(facets).map(([field, buckets]) => (
        <div key={field} style={{ marginBottom: "8px" }}>
          <h4 style={{ margin: "0 0 3px 0", fontSize: "11px", fontWeight: "600", color: "var(--fg-muted)" }}>{field}</h4>
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
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--muted)"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
              >
                <span style={{ color: "var(--fg)" }}>{bucket.value || "(empty)"}</span>
                <span style={{ color: "var(--fg-muted)", fontWeight: "600" }}>{bucket.count}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
