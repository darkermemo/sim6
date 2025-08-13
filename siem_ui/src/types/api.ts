/**
 * API Response Types for SIEM Backend
 */

export interface KpiData {
  total_events_24h: number;
  new_alerts_24h: number;
  cases_opened: number;
  eps_live: number;
}

export interface TrendData {
  total_events_24h: number;
  new_alerts_24h: number;
  cases_opened: number;
}

export interface AlertsOverTimeData {
  time: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface TopLogSourceData {
  name: string;
  value: number;
}

export interface RecentAlert {
  id: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  name: string;
  timestamp: string; // ISO string
  sourceIp: string;
  destIp: string;
  user: string;
  status: 'New' | 'In Progress' | 'Resolved' | 'Closed';
}

export interface AlertDetail {
  alert_id: string;
  tenant_id: string;
  rule_id: string;
  rule_name: string;
  event_id: string;
  alert_timestamp: number;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  status: 'New' | 'In Progress' | 'Resolved' | 'Closed';
  assignee_id?: string;
  created_at: number;
  raw: string; // Raw event JSON
  src_ip?: string;
  dest_ip?: string;
  user?: string;
  cmdline?: string;
  hash?: string;
  mitre_tags: string[];
}

export interface AlertNote {
  note_id: string;
  alert_id: string;
  tenant_id: string;
  author: string;
  content: string;
  created_at: number;
}

export interface UpdateAlertStatusRequest {
  status: string;
}

export interface UpdateAlertAssigneeRequest {
  assignee_id?: string;
}

export interface CreateAlertNoteRequest {
  content: string;
}

export interface SSEEvent {
  type: 'note' | 'heartbeat';
  payload?: any;
}

export interface DashboardResponse {
  kpis: KpiData;
  trends: TrendData;
  alertsOverTime: AlertsOverTimeData[];
  topLogSources: TopLogSourceData[];
  recentAlerts: RecentAlert[];
}

export interface AssetInfo {
  name: string;
  criticality: 'High' | 'Medium' | 'Low';
  type: string;
}

export interface UpdateAlertStatusResponse {
  success: boolean;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  tenant_id: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface DashboardFilters {
  from?: string; // ISO string
  to?: string; // ISO string
  severity?: string; // CSV of severities
  page?: number;
  limit?: number;
}

// Rule Management Types
export interface Rule {
  rule_id: string;
  tenant_id: string;
  rule_name: string;
  rule_description: string;
  rule_query: string;
  is_active: boolean;
  is_stateful: number; // 0 or 1
  stateful_config: string;
  created_at: number;
  updated_at?: number;
}

export interface CreateRuleRequest {
  rule_name: string;
  description: string;
  query: string;
  is_stateful?: number;
  stateful_config?: string;
  engine_type?: 'scheduled' | 'real-time';
}

export interface UpdateRuleRequest {
  rule_name?: string;
  description?: string;
  query?: string;
  enabled?: boolean;
}

export interface CreateSigmaRuleRequest {
  sigma_yaml: string;
}

export interface SigmaComplexityInfo {
  is_complex: boolean;
  engine_type: string;
  complexity_reasons: string[];
}

export interface CreateSigmaRuleResponse {
  rule: Rule;
  complexity_analysis: SigmaComplexityInfo;
}

export interface RuleFilters {
  search?: string;
  is_active?: boolean;
  page?: number;
  limit?: number;
}

// Log Source Management Types (from siem_api/src/log_source_handlers.rs)
export interface LogSource {
  source_id: string;
  tenant_id: string;
  source_name: string;
  source_type: LogSourceType;
  source_ip: string;
  created_at: number;
}

export type LogSourceType = "Syslog" | "JSON" | "Windows" | "Apache" | "Nginx";

export interface CreateLogSourceRequest {
  source_name: string;
  source_type: LogSourceType;
  source_ip: string;
}

export interface CreateLogSourceResponse {
  source_id: string;
  message: string;
}

export interface LogSourceListResponse {
  log_sources: LogSource[];
  total: number;
}

export interface LogSourceLookupResponse {
  source_type: string;
  source_name: string;
}

export interface LogSourceFilters {
  search?: string;
  source_type?: LogSourceType;
  page?: number;
  limit?: number;
}

// Rule Testing Types
export interface TestRuleRequest {
  query: string;
}

export interface TestRuleResponse {
  matches: any[];
  total_matches: number;
  query_time_ms: number;
  error?: string;
}

// Query Builder Types
export interface QueryFilter {
  id: string;
  field: string;
  operator: string;
  value: string;
  logicalOperator?: 'AND' | 'OR';
}

export interface StatefulConfigData {
  key_prefix: string;
  aggregate_on: string[];
  threshold: number;
  window_seconds: number;
} 