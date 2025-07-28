/**
 * API Response Types for SIEM Backend
 */

export interface KpiData {
  total_events_24h: number;
  new_alerts_24h: number;
  cases_opened: number;
  eps_live: number;
  queue_counter: number;
  total_storage_bytes: number;
  filtered_storage_bytes: number;
}

export interface TrendData {
  total_events_24h: number;
  new_alerts_24h: number;
  cases_opened: number;
  queue_counter: number;
  total_storage_bytes: number;
  filtered_storage_bytes: number;
}

export interface AlertsOverTimeData {
  hour: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface TopLogSourceData {
  source: string;
  count: number;
}

export interface RecentAlert {
  id: string;
  severity: string;
  name: string;
  timestamp: string;
  source_ip: string;
  dest_ip: string;
  user: string;
  status: string;
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
  payload?: unknown;
}

export interface DashboardResponse {
  kpis: KpiData;
  trends: TrendData;
  alerts_over_time: AlertsOverTimeData[];
  top_log_sources: TopLogSourceData[];
  recent_alerts: RecentAlert[];
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

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  tenant_id: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface DashboardFilters {
  from?: string; // ISO string
  to?: string; // ISO string
  severity?: string; // CSV of severities
  tenant_id?: string; // Tenant ID for filtering
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
  id: string;
  name: string;
  type: LogSourceType;
  subtype: string;
  parser_id: string;
  tenant_id: string;
  last_seen: number;
  status: 'active' | 'degraded' | 'inactive';
  eps: number;
  event_count: number;
  created_at: number;
  // Legacy fields for backward compatibility
  source_id?: string;
  source_name?: string;
  source_type?: LogSourceType;
  source_ip?: string;
}

export type LogSourceType = "Syslog" | "JSON" | "Windows" | "Apache" | "Nginx";

// Enhanced Log Source Management Types
export interface LogSourceGroup {
  group_id: string;
  name: string;
  description: string;
  log_source_ids: string[];
  tenant_id: string;
  created_at: number;
  updated_at: number;
}

export interface LogSourceStats {
  log_source_id: string;
  name: string;
  status: string;
  eps: number;
  event_count: number;
  last_seen: string;
  daily_events: number;
  parse_failures: number;
  parse_partials: number;
}

export interface LogSourceOverallStats {
  total_sources: number;
  active_sources: number;
  degraded_sources: number;
  inactive_sources: number;
  total_eps: number;
  total_events_today: number;
  parsing_success_rate: number;
  avg_latency_ms: number;
}

export interface CreateLogSourceRequest {
  name: string;
  type: string;
  subtype: string;
  parser_id: string;
}

export interface UpdateLogSourceRequest {
  name?: string;
  status?: string;
  parser_id?: string;
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

export interface CreateLogSourceGroupRequest {
  name: string;
  description: string;
  log_source_ids: string[];
}

export interface CreateLogSourceGroupResponse {
  group_id: string;
  message: string;
}

export interface LogSourceGroupListResponse {
  groups: LogSourceGroup[];
  total: number;
}

// Rule Testing Types
export interface TestRuleRequest {
  query: string;
}

export interface TestRuleResponse {
  matches: EventSearchResult[];
  total_matches: number;
  query_time_ms: number;
  error?: string;
}

// Query Builder Types
export interface QueryFilter {
  id: string;
  field: string;
  operator: string;
  value: string | string[]; // Support both single and multiple values
  logicalOperator?: 'AND' | 'OR';
}

export interface StatefulConfigData {
  key_prefix: string;
  aggregate_on: string[];
  threshold: number;
  window_seconds: number;
}

// Event Search Types
export interface EventSearchRequest {
  query: string;
  page?: number;
  limit?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
}

export interface EventSearchResult {
  event_id: string;
  event_timestamp: number;
  event_category: string;
  event_action: string;
  source_ip?: string;
  dest_ip?: string;
  user?: string;
  severity?: string;
  message?: string;
  raw_event?: string;
}

export interface EventSearchResponse {
  events: EventSearchResult[];
  total: number;
  page: number;
  limit: number;
  query_time_ms: number;
  sql_query: string;
}

// Alert Management Types
export interface Alert {
  alert_id: string;
  tenant_id: string;
  rule_id: string;
  rule_name: string;
  event_id: string;
  alert_timestamp: number;
  severity: string;
  status: string;
  created_at: number;
}

// Case Management Types
export interface Case {
  case_id: string;
  tenant_id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  assigned_to: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCaseRequest {
  title: string;
  description?: string;
  priority: string;
  alert_ids: string[];
}

export interface UpdateCaseRequest {
  status?: string;
  assigned_to?: string;
}

export interface Asset {
  asset_id: string;
  asset_name: string;
  asset_ip: string;
  asset_type: string;
  criticality: string;
}

export interface CaseWithEvidence {
  case_id: string;
  tenant_id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  assigned_to: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  alert_ids: string[];
  related_assets: Asset[];
}

export interface CreateCaseResponse {
  case_id: string;
  message: string;
}

// Admin Management Types
export interface UserResponse {
  user_id: string;
  tenant_id: string;
  email: string;
  is_active: boolean;
  roles: string[];
}

export interface CreateUserRequest {
  user_id: string;
  tenant_id: string;
  email: string;
  roles: string[];
}

export interface AssignRoleRequest {
  role_name: string;
}

export interface Role {
  role_id: string;
  role_name: string;
  description: string;
}

// Tenant Management Types (from siem_api/src/tenant_handlers.rs)
export interface Tenant {
  tenant_id: string;
  tenant_name: string;
  is_active: number;
  created_at: number;
}

export interface CreateTenantRequest {
  tenant_name: string;
}

export interface UpdateTenantRequest {
  tenant_name?: string;
  is_active?: number;
}

export interface CreateTenantResponse {
  tenant_id: string;
  message: string;
}

export interface TenantListResponse {
  tenants: Tenant[];
  total: number;
}

// Agent & Policy Management Types (from siem_api/src/agent_handlers.rs)
export interface CreatePolicyRequest {
  policy_name: string;
  config_json: string;
}

export interface PolicyResponse {
  policy_id: string;
  tenant_id: string;
  policy_name: string;
  config_json: string;
  created_at: number;
  updated_at: number;
}

export interface CreatePolicyResponse {
  policy_id: string;
  message: string;
}

export interface PolicyListResponse {
  policies: PolicyResponse[];
  total: number;
}

export interface UpdatePolicyRequest {
  policy_name?: string;
  config_json?: string;
}

export interface AssignPolicyRequest {
  asset_id: string;
  policy_id: string;
}

export interface AssignPolicyResponse {
  message: string;
}

export interface AgentConfigResponse {
  asset_id: string;
  policy_name: string;
  config_json: string;
  last_updated: number;
}

// Parser Management Types (from siem_api/src/parser_handlers.rs)
export interface CreateParserRequest {
  parser_name: string;
  parser_type: 'Grok' | 'Regex';
  pattern: string;
}

export interface ParserResponse {
  parser_id: string;
  tenant_id: string;
  parser_name: string;
  parser_type: string;
  pattern: string;
  created_at: number;
  updated_at: number;
}

export interface CreateParserResponse {
  parser_id: string;
  message: string;
}

export interface ParserListResponse {
  parsers: ParserResponse[];
  total: number;
}

export interface DeleteParserResponse {
  message: string;
}

// Taxonomy Management Types (from siem_api/src/taxonomy_handlers.rs)
export interface TaxonomyMapping {
  mapping_id: string;
  tenant_id: string;
  source_type: string;
  field_to_check: string;
  value_to_match: string;
  event_category: string;
  event_outcome: string;
  event_action: string;
  created_at: number;
}

export interface CreateTaxonomyMappingRequest {
  source_type: string;
  field_to_check: string;
  value_to_match: string;
  event_category: string;
  event_outcome: string;
  event_action: string;
}

export interface CreateTaxonomyMappingResponse {
  mapping_id: string;
  message: string;
}

export interface TaxonomyMappingListResponse {
  mappings: TaxonomyMapping[];
  total: number;
}