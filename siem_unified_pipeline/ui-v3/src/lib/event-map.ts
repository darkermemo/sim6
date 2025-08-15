import { normalizeSeverity } from "@/lib/severity";

/** Convert ClickHouse {meta,data} arrays or {rows} objects into array<object> */
export function toRowObjects(payload: any): Record<string, any>[] {
  // ClickHouse meta+data arrays → objects
  if (payload?.data?.meta && payload?.data?.data) {
    const cols = payload.data.meta.map((c: any) => c.name);
    return payload.data.data.map((row: any[]) =>
      Object.fromEntries(cols.map((name: string, i: number) => [name, row[i]]))
    );
  }
  
  // Already objects in rows array
  if (Array.isArray(payload?.data?.rows)) return payload.data.rows;
  if (Array.isArray(payload?.rows)) return payload.rows;
  
  // Empty fallback
  return [];
}

/**
 * Parse timestamp from various formats into ISO string
 * Handles: Unix timestamps (seconds/milliseconds), "YYYY-MM-DD HH:mm:ss", ISO strings
 */
export function parseTs(raw: unknown): string | null {
  if (raw == null) return null;
  
  if (typeof raw === "number") {
    // Convert to milliseconds if needed (Unix timestamps < 1e12 are likely seconds)
    const ms = raw > 1e12 ? raw : raw * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  
  if (typeof raw === "string") {
    // Handle "YYYY-MM-DD HH:mm:ss[.ms]" (add Z if missing) and ISO strings
    let s = raw.trim();
    if (s.includes(" ") && !s.includes("T")) {
      s = s.replace(" ", "T") + "Z";
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  
  return null;
}

/**
 * Derive source from various possible field names
 */
export function deriveSource(r: Record<string, any>): string {
  return (
    r.source ||
    r.event_source ||
    r.service ||
    r.product ||
    r.vendor ||
    r.host ||
    r.host_name ||
    r.source_type ||
    r.log_source_id ||
    "unknown"
  );
}

/**
 * Derive message from various possible field names
 */
export function deriveMessage(r: Record<string, any>): string {
  return (
    r.message ||
    r.msg ||
    r.event_message ||
    r.original_message ||
    r.raw_log ||
    r._raw ||
    ""
  );
}

/**
 * Derive event type from various field names
 */
export function deriveEventType(r: Record<string, any>): string {
  return (
    r.event_type ||
    r.event_category ||
    r.action ||
    r.event_action ||
    ""
  );
}

/**
 * Normalized UI event structure
 */
export type UiEvent = {
  id: string;
  tsIso: string | null;
  severity: string;
  event_type?: string;
  source: string;
  message: string;
  row: Record<string, any>; // Original row for detail views
};

/**
 * Map raw ClickHouse rows to normalized UI events
 * Fixes "Invalid Date / info / unknown / No message" by providing safe fallbacks
 */
export function mapToUiEvents(rows: Record<string, any>[]): UiEvent[] {
  return rows.map((r, idx) => {
    // Parse timestamp from various field names
    const tsIso = parseTs(
      r.event_timestamp ?? 
      r.ts ?? 
      r["@timestamp"] ?? 
      r.event_time ?? 
      r.time ?? 
      r.occurred_at ??
      r.created_at
    );
    
    // Normalize severity from various field names and outcomes
    const sevRaw = r.severity ?? 
                   r.level ?? 
                   (r.event_outcome === "failure" ? "high" : null) ??
                   (r.outcome === 0 ? "fail" : null) ??
                   (r.parsing_status === "failed" ? "medium" : null);
    const severity = normalizeSeverity(sevRaw || "info");
    
    // Derive other fields
    const source = deriveSource(r);
    const message = deriveMessage(r);
    const event_type = deriveEventType(r);
    
    // Create stable unique ID
    const id = String(
      r._id || 
      r.event_id || 
      r.id ||
      `${tsIso ?? "na"}|${source}|${idx}`
    );
    
    return { 
      id, 
      tsIso, 
      severity, 
      event_type, 
      source, 
      message, 
      row: r 
    };
  });
}
