import { useState, useEffect, useRef } from "react";
// TODO: Implement SSE using centralized HTTP helper
import * as Types from "@/lib/api-types";

interface Props {
  tenant: string;
  query: string;
  timeRange: Types.TimeRange;
  selectedFields: string[];
  onStop: () => void;
}

/**
 * Live tail component with SSE streaming
 */
export default function LiveTail({ 
  tenant, 
  query, 
  timeRange, 
  selectedFields,
  onStop 
}: Props) {
  const [events, setEvents] = useState<any[]>([]);
  const [stats, setStats] = useState({ rows: 0, bytes: 0, elapsed_ms: 0 });
  const [isPaused, setIsPaused] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamId = useRef(`stream-${Date.now()}`);

  useEffect(() => {
    startStream();
    return () => stopStream();
  }, [tenant, query, timeRange, selectedFields]);

  const startStream = () => {
    stopStream();
    
    const es = api.search.tail({
      tenant_id: tenant,
      time: timeRange,
      q: query,
      select: selectedFields.length > 0 ? selectedFields : undefined,
      stream_id: streamId.current,
    });
    
    es.addEventListener("hello", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      console.log("Stream started:", data);
    });
    
    es.addEventListener("row", (e: MessageEvent) => {
      if (!isPaused) {
        const row = JSON.parse(e.data);
        setEvents(prev => [...prev.slice(-999), row]); // Keep last 1000
        
        // Auto-scroll to bottom
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      }
    });
    
    es.addEventListener("stats", (e: MessageEvent) => {
      const stats = JSON.parse(e.data);
      setStats(stats);
    });
    
    es.addEventListener("warning", (e: MessageEvent) => {
      const warning = JSON.parse(e.data);
      console.warn("Stream warning:", warning);
    });
    
    es.onerror = (e: Event) => {
      console.error("Stream error:", e);
      stopStream();
    };
    
    eventSourceRef.current = es;
  };

  const stopStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  const handleClear = () => {
    setEvents([]);
    setStats({ rows: 0, bytes: 0, elapsed_ms: 0 });
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Controls */}
      <div style={{
        padding: "var(--space-md)",
        borderBottom: "1px solid var(--border-color)",
        display: "flex",
        alignItems: "center",
        gap: "var(--space-md)",
        backgroundColor: "var(--bg-secondary)",
      }}>
        <div style={{ display: "flex", gap: "var(--space-sm)" }}>
          <button
            onClick={() => setIsPaused(!isPaused)}
            style={{
              padding: "var(--space-sm) var(--space-md)",
              backgroundColor: isPaused ? "var(--color-warning)" : "var(--color-success)",
            }}
          >
            {isPaused ? "▶ Resume" : "⏸ Pause"}
          </button>
          
          <button
            onClick={handleClear}
            style={{
              padding: "var(--space-sm) var(--space-md)",
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-primary)",
            }}
          >
            Clear
          </button>
          
          <button
            onClick={onStop}
            style={{
              padding: "var(--space-sm) var(--space-md)",
              backgroundColor: "var(--color-error)",
            }}
          >
            Stop Live Tail
          </button>
        </div>
        
        <div style={{ marginLeft: "auto", display: "flex", gap: "var(--space-lg)", fontSize: "0.875rem" }}>
          <span>
            <strong>{stats.rows.toLocaleString()}</strong> events
          </span>
          <span>
            <strong>{formatBytes(stats.bytes)}</strong> received
          </span>
          <span>
            <strong>{(stats.elapsed_ms / 1000).toFixed(1)}s</strong> elapsed
          </span>
        </div>
      </div>
      
      {/* Events */}
      <div 
        ref={containerRef}
        style={{ 
          flex: 1, 
          overflow: "auto",
          padding: "var(--space-md)",
          backgroundColor: "var(--bg-tertiary)",
          fontFamily: "var(--font-mono)",
          fontSize: "0.875rem",
        }}
      >
        {events.length === 0 ? (
          <div style={{ 
            textAlign: "center", 
            padding: "var(--space-xl)",
            color: "var(--text-tertiary)"
          }}>
            <div style={{ fontSize: "2rem", marginBottom: "var(--space-md)" }}>📡</div>
            <p>Waiting for events matching your query...</p>
            <p className="text-sm">Query: <code>{query}</code></p>
          </div>
        ) : (
          <div>
            {events.map((event, index) => (
              <div 
                key={index}
                style={{
                  marginBottom: "var(--space-xs)",
                  padding: "var(--space-sm)",
                  backgroundColor: "var(--bg-primary)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-color)",
                  wordBreak: "break-word",
                }}
              >
                {selectedFields.length > 0 ? (
                  // Show only selected fields
                  <div style={{ display: "flex", gap: "var(--space-md)", flexWrap: "wrap" }}>
                    {selectedFields.map(field => (
                      <span key={field}>
                        <span style={{ color: "var(--text-tertiary)" }}>{field}:</span>{" "}
                        <span style={{ 
                          color: field === "severity" ? getSeverityColor(event[field]) : "inherit",
                          fontWeight: field === "severity" ? 600 : 400,
                        }}>
                          {formatValue(event[field], field)}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  // Show full JSON
                  <pre style={{ margin: 0, overflow: "auto" }}>
                    {JSON.stringify(event, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper functions (reused from other components)
function formatValue(value: any, field: string): string {
  if (value === null || value === undefined) return "";
  
  if (field.includes("timestamp") || field.includes("_at")) {
    const date = new Date(value * 1000);
    if (!isNaN(date.getTime())) {
      return date.toLocaleString();
    }
  }
  
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  
  return String(value);
}

function getSeverityColor(value: string): string {
  switch (value?.toLowerCase()) {
    case "critical": return "var(--color-error)";
    case "high": return "var(--color-warning)";
    case "medium": return "var(--color-info)";
    case "low": return "var(--color-success)";
    default: return "inherit";
  }
}
