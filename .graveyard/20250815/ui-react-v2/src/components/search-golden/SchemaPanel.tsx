import * as Types from "@/lib/search-types";

interface Props {
  fields?: Types.FieldMeta[] | null;
  enums?: Record<string, string[]> | null;
  grammar?: { 
    tokens?: { label: string; example?: string }[];
    keywords?: string[];
    operators?: string[];
    functions?: string[];
    specials?: string[];
  } | null;
  onFieldClick?: (fieldName: string) => void;
  onEnumClick?: (fieldName: string, enumValue: string) => void;
}

/**
 * SchemaPanel - Displays available fields, enums, and grammar
 * Completely defensive rendering with safe defaults
 */
export default function SchemaPanel({ fields, enums, grammar, onFieldClick, onEnumClick }: Props) {
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

  return (
    <aside data-testid="schema-panel" style={{ padding: "6px 8px", borderBottom: "1px solid #e2e8f0", maxHeight: "200px", overflow: "auto" }}>
      <h3 style={{ margin: "0 0 6px 0", fontSize: "12px", fontWeight: "600", color: "#64748b" }}>Schema</h3>
      
      {/* Fields */}
      <section style={{ marginBottom: "8px" }}>
        <h4 style={{ margin: "0 0 4px 0", fontSize: "11px", fontWeight: "600", color: "#64748b" }}>Fields</h4>
        {safeFields.length === 0 ? (
          <div data-testid="fields-empty" style={{ color: "#94a3b8", fontSize: "10px" }}>No fields available</div>
        ) : (
          <div style={{ fontSize: "10px" }}>
            {safeFields.map((field, index) => (
              <div key={field?.name || index} style={{ marginBottom: "2px", padding: "1px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong 
                    style={{ 
                      fontSize: "10px", 
                      cursor: onFieldClick ? "pointer" : "default",
                      color: onFieldClick ? "#3b82f6" : "inherit"
                    }}
                    onClick={() => onFieldClick && field?.name && onFieldClick(field.name)}
                    onMouseEnter={e => onFieldClick && (e.currentTarget.style.textDecoration = "underline")}
                    onMouseLeave={e => onFieldClick && (e.currentTarget.style.textDecoration = "none")}
                  >
                    {field?.name || 'Unknown'}
                  </strong>
                  <span style={{ color: "#94a3b8", fontSize: "9px" }}>
                    {field?.type || 'String'}
                  </span>
                </div>
                {field?.doc && (
                  <div style={{ color: "#94a3b8", fontSize: "9px", marginTop: "1px" }}>
                    {field.doc}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Grammar */}
      <section style={{ marginBottom: "8px" }}>
        <h4 style={{ margin: "0 0 4px 0", fontSize: "11px", fontWeight: "600", color: "#64748b" }}>Grammar</h4>
        {displayTokens.length === 0 && keywords.length === 0 && operators.length === 0 && functions.length === 0 ? (
          <div data-testid="grammar-empty" style={{ color: "#666", fontSize: "12px" }}>Grammar unavailable</div>
        ) : (
          <div style={{ fontSize: "12px" }}>
            {displayTokens.length > 0 && (
              <div style={{ marginBottom: "3px" }}>
                <strong>Tokens:</strong>{" "}
                {displayTokens.map((token, i) => (
                  <span key={i}>
                    {token.label}
                                         {(token as any).example ? ` (${(token as any).example})` : ''}
                    {i < displayTokens.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            )}
            {keywords.length > 0 && (
              <div style={{ marginBottom: "3px" }}>
                <strong>Keywords:</strong> {keywords.join(", ")}
              </div>
            )}
            {operators.length > 0 && (
              <div style={{ marginBottom: "3px" }}>
                <strong>Operators:</strong> {operators.join(", ")}
              </div>
            )}
            {functions.length > 0 && (
              <div style={{ marginBottom: "3px" }}>
                <strong>Functions:</strong> {functions.slice(0, 5).join(", ")}
                {functions.length > 5 ? '...' : ''}
              </div>
            )}
            {specials.length > 0 && (
              <div>
                <strong>Special:</strong> {specials.join(", ")}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Enums */}
      <section>
        <h4 style={{ margin: "0 0 4px 0", fontSize: "11px", fontWeight: "600", color: "#64748b" }}>Enums</h4>
        {Object.keys(safeEnums).length === 0 ? (
          <div data-testid="enums-empty" style={{ color: "#94a3b8", fontSize: "10px" }}>No enums available</div>
        ) : (
          <div style={{ fontSize: "9px" }}>
            {Object.entries(safeEnums).map(([field, values]) => {
              const list = Array.isArray(values) ? values : [];
              return (
                <div key={field} style={{ marginBottom: "4px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                    <strong style={{ fontSize: "10px" }}>{field}</strong>
                    <span style={{ color: "#94a3b8", fontSize: "9px" }}>
                      {list.length > 0 ? `(${list.length})` : "(0)"}
                    </span>
                  </div>
                  {list.length > 0 && (
                    <div style={{ fontSize: "9px", paddingLeft: "4px" }}>
                      {list.slice(0, 5).map((value, idx) => (
                        <div 
                          key={idx}
                          style={{ 
                            cursor: onEnumClick ? "pointer" : "default",
                            color: onEnumClick ? "#3b82f6" : "#64748b",
                            padding: "1px 0",
                            borderRadius: "2px"
                          }}
                          onClick={() => onEnumClick && onEnumClick(field, value)}
                          onMouseEnter={e => onEnumClick && (e.currentTarget.style.backgroundColor = "#f1f5f9")}
                          onMouseLeave={e => onEnumClick && (e.currentTarget.style.backgroundColor = "transparent")}
                        >
                          {value}
                        </div>
                      ))}
                      {list.length > 5 && (
                        <div style={{ color: "#94a3b8", fontSize: "8px" }}>
                          ... and {list.length - 5} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </aside>
  );
}
