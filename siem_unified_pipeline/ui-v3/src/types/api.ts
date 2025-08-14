/**
 * API Types for SIEM UI v3
 * 
 * These types are exact mirrors of the Rust backend API structures
 * from siem_unified_pipeline/src/types/api.rs
 */

// ============================================================================
// Health and Status Types
// ============================================================================

export interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
  uptime_seconds: number;
  components: Record<string, ComponentHealth>;
}

export interface ComponentHealth {
  status: string;
  last_check: string;
  error_count: number;
  response_time_ms: number;
}

export interface VectorHealthResponse {
  status: string;
  healthy: boolean;
  events_processed?: number;
}

// ============================================================================
// Event Types
// ============================================================================

export interface EventSearchQuery {
  start_time?: string;
  end_time?: string;
  tenant_id?: string;
  source?: string;
  severity?: string;
  search?: string;
  source_ip?: string;
  dest_ip?: string;
  user?: string;
  limit?: number;
  offset?: number;
}

export interface EventSearchResponse {
  events: EventSummary[];
  total_count: number;
  page_info: PageInfo;
}

export interface EventSummary {
  id: string;
  timestamp: string;
  event_type: string;
  source: string;
  severity: string;
  message: string;
  source_ip?: string;
  dest_ip?: string;
  user?: string;
  tenant_id?: string;
}

export interface EventDetail {
  id: string;
  timestamp: string;
  source: string;
  source_type: string;
  severity: string;
  message: string;
  raw_message: string;
  source_ip?: string;
  destination_ip?: string;
  user_id?: string;
  user_name?: string;
  tenant_id: string;
  event_category: string;
  event_action: string;
  event_outcome?: string;
  metadata: Record<string, any>;
  tags?: string[];
  correlation_id?: string;
  rule_id?: string;
  alert_id?: string;
  created_at: string;
  updated_at?: string;
}

export interface PageInfo {
  limit: number;
  offset: number;
  has_next: boolean;
  has_previous: boolean;
  total_pages: number;
  current_page: number;
}

// ============================================================================
// Dashboard Types
// ============================================================================

export interface DashboardKpis {
  total_events_24h: number;
  total_alerts_24h: number;
  active_rules: number;
  avg_eps: number;
  system_health: string;
}

export interface DashboardResponse {
  kpis: DashboardKpis;
  recent_alerts: AlertResponse[];
  top_sources: LogSourceStats[];
  timestamp: string;
}

export interface AlertResponse {
  id: string;
  name: string;
  description: string;
  severity: string;
  status: string;
  rule_id: string;
  event_id: string;
  created_at: string;
  updated_at?: string;
}

export interface LogSourceStats {
  source_name: string;
  event_count: number;
  last_seen: string;
  avg_eps: number;
}

// ============================================================================
// Rules Types
// ============================================================================

export interface RuleResponse {
  id: string;
  name: string;
  description: string;
  rule_type: string;
  query: string;
  severity: string;
  enabled: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface RulesListResponse {
  rules: RuleResponse[];
  total: number;
  page_info: PageInfo;
}

// ============================================================================
// Statistics Types
// ============================================================================

export interface EventCountResponse {
  count: number;
}

export interface EpsStatsResponse {
  global: {
    current_eps: number;
    avg_eps: number;
    peak_eps: number;
    window_seconds: number;
  };
  per_tenant: {
    tenants: Record<string, any>;
    window_seconds: number;
  };
  timestamp: string;
}

// ============================================================================
// Common Response Types
// ============================================================================

export interface ErrorResponse {
  error: string;
  message?: string;
  details?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ErrorResponse;
  success: boolean;
}

// ============================================================================
// Utility Types
// ============================================================================

export type SeverityLevel = "Critical" | "High" | "Medium" | "Low" | "Info";
export type AlertStatus = "Open" | "InProgress" | "Resolved" | "Closed" | "False Positive";
export type RuleType = "Sigma" | "YARA" | "Custom" | "Correlation";
export type EventCategory = "Authentication" | "Network" | "File" | "Process" | "Registry" | "Web";
