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
    <div style={{ padding: "10px", borderBottom: "1px solid #ccc" }}>
      <h3>Facets</h3>
      {Object.entries(facets).map(([field, buckets]) => (
        <div key={field} style={{ marginBottom: "15px" }}>
          <h4 style={{ margin: "5px 0" }}>{field}</h4>
          <div data-testid={`facet-${field}`}>
            {buckets.map(bucket => (
              <div 
                key={bucket.value}
                onClick={() => onToggle(field, bucket.value)}
                style={{
                  padding: "2px 5px",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "#f0f0f0"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
              >
                <span>{bucket.value || "(empty)"}</span>
                <span style={{ color: "#666" }}>{bucket.count}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
