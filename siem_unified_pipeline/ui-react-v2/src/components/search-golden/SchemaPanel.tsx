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
}

/**
 * SchemaPanel - Displays available fields, enums, and grammar
 * Completely defensive rendering with safe defaults
 */
export default function SchemaPanel({ fields, enums, grammar }: Props) {
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
    <aside data-testid="schema-panel" style={{ padding: "10px", borderBottom: "1px solid #ccc", maxHeight: "300px", overflow: "auto" }}>
      <h3>Schema</h3>
      
      {/* Fields */}
      <section>
        <h4>Fields</h4>
        {safeFields.length === 0 ? (
          <div data-testid="fields-empty" style={{ color: "#666", fontSize: "12px" }}>No fields available</div>
        ) : (
          <div style={{ fontSize: "12px" }}>
            {safeFields.map((field, index) => (
              <div key={field?.name || index} style={{ marginBottom: "3px" }}>
                <strong>{field?.name || 'Unknown'}</strong>
                <span style={{ color: "#666", marginLeft: "5px" }}>
                  {field?.type || 'String'}
                </span>
                {field?.doc && (
                  <div style={{ color: "#888", marginLeft: "10px" }}>
                    {field.doc}
                  </div>
                )}
                <div style={{ color: "#888", marginLeft: "10px", fontSize: "11px" }}>
                  {field?.searchable && "searchable"}
                  {field?.facetable && " • facetable"}
                  {field?.sortable && " • sortable"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Grammar */}
      <section style={{ marginTop: "15px" }}>
        <h4>Grammar</h4>
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
                    {token.example ? ` (${token.example})` : ''}
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
      <section style={{ marginTop: "15px" }}>
        <h4>Enums</h4>
        {Object.keys(safeEnums).length === 0 ? (
          <div data-testid="enums-empty" style={{ color: "#666", fontSize: "12px" }}>No enums available</div>
        ) : (
          <div style={{ fontSize: "12px" }}>
            {Object.entries(safeEnums).map(([field, values]) => {
              const list = Array.isArray(values) ? values : [];
              return (
                <div key={field} style={{ marginBottom: "5px" }}>
                  <strong>{field}:</strong>
                  <span style={{ marginLeft: "5px", color: "#666" }}>
                    {list.length > 0 ? list.join(", ") : "(no values)"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </aside>
  );
}
