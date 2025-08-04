import { z } from 'zod';

/**
 * Comprehensive Zod schemas for API response validation
 * Catches data structure mismatches and invalid field types at runtime
 */

// Base schemas for common types
const TimestampSchema = z.string().refine(
  (val) => !isNaN(Date.parse(val)) || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val),
  { message: "Invalid timestamp format" }
);
const IPAddressSchema = z.string().refine(
  (val) => /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(val),
  { message: "Invalid IP address format" }
);
const UUIDSchema = z.string().refine(
  (val) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val) || val.length > 0,
  { message: "Invalid UUID format" }
);

// Alert schemas
export const AlertSeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export const AlertStatusSchema = z.enum(['open', 'investigating', 'resolved', 'closed', 'false_positive']);

// Time Range schema
export const TimeRangeSchema = z.object({
  start: z.string(),
  end: z.string(),
  timezone: z.string().optional()
});

// Pagination schema
export const PaginationSchema = z.object({
  page: z.number().int().min(0),
  size: z.number().int().min(1).max(1000),
  cursor: z.string().optional(),
  include_total: z.boolean()
}).transform((data) => ({
  page: data.page,
  size: data.size,
  cursor: data.cursor,
  includeTotal: data.include_total
}));

// Sort field schema
export const SortFieldSchema = z.object({
  field: z.string(),
  direction: z.enum(['asc', 'desc'])
});

// Filter value schema
export const FilterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number())
]);

// Search options schema
export const SearchOptionsSchema = z.object({
  include_raw: z.boolean().optional(),
  highlight_matches: z.boolean().optional(),
  timeout: z.number().optional()
}).transform((data) => ({
  includeRaw: data.include_raw,
  highlightMatches: data.highlight_matches,
  timeout: data.timeout
}));

// Aggregation request schema
export const AggregationRequestSchema = z.object({
  type: z.enum(['terms', 'date_histogram', 'histogram', 'stats']),
  field: z.string(),
  size: z.number().optional(),
  interval: z.string().optional()
});

// Event search request schema (matches backend SearchRequest)
export const EventSearchRequestSchema = z.object({
  query: z.string().optional(),
  time_range: TimeRangeSchema.optional(),
  filters: z.record(z.string(), FilterValueSchema).optional(),
  pagination: PaginationSchema.optional(),
  sort: z.array(SortFieldSchema).optional(),
  fields: z.array(z.string()).optional(),
  options: SearchOptionsSchema.optional(),
  tenant_id: z.string().optional(),
  aggregations: z.record(z.string(), AggregationRequestSchema).optional()
}).transform((data) => ({
  query: data.query,
  timeRange: data.time_range,
  filters: data.filters,
  pagination: data.pagination,
  sort: data.sort,
  fields: data.fields,
  options: data.options,
  tenantId: data.tenant_id,
  aggregations: data.aggregations
}));

// Event Detail schema - matches Rust EventDetailResponse (snake_case backend → camelCase frontend)
export const EventDetailResponseSchema = z.object({
  id: UUIDSchema,
  timestamp: TimestampSchema,
  source: z.string(),
  source_type: z.string(),
  severity: z.string(),
  facility: z.string(),
  hostname: z.string(),
  process: z.string(),
  message: z.string(),
  raw_message: z.string(),
  source_ip: z.string(),
  source_port: z.number().int(),
  protocol: z.string(),
  tags: z.array(z.string()),
  fields: z.record(z.string(), z.any()),
  processing_stage: z.string(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema
}).transform((data) => ({
  id: data.id,
  timestamp: data.timestamp,
  source: data.source,
  sourceType: data.source_type,
  severity: data.severity,
  facility: data.facility,
  hostname: data.hostname,
  process: data.process,
  message: data.message,
  rawMessage: data.raw_message,
  sourceIp: data.source_ip,
  sourcePort: data.source_port,
  protocol: data.protocol,
  tags: data.tags,
  fields: data.fields,
  processingStage: data.processing_stage,
  createdAt: data.created_at,
  updatedAt: data.updated_at
}));

// Legacy Event Detail schema for backward compatibility
export const EventDetailSchema = EventDetailResponseSchema;

export const RecentAlertSchema = z.object({
  id: UUIDSchema,
  name: z.string().min(1),
  severity: AlertSeveritySchema,
  source_ip: IPAddressSchema.nullable().optional(),
  dest_ip: IPAddressSchema.nullable().optional(),
  timestamp: TimestampSchema,
  status: AlertStatusSchema,
  user: z.string().nullable().optional(),
  asset_info: z.string().nullable().optional()
});

export const AlertDetailSchema = RecentAlertSchema.extend({
  description: z.string().optional(),
  rule_id: UUIDSchema.optional(),
  raw_event: z.record(z.string(), z.any()).optional(),
  tags: z.array(z.string()).optional(),
  assignee: z.string().nullable().optional(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema.optional()
});

// Event Search Response - matches Rust SearchEventsResponse
export const SearchEventsResponseSchema = z.object({
  events: z.array(EventDetailResponseSchema),
  total: z.number().int().min(0),
  status: z.string()
});

// Legacy Event Search Response for backward compatibility
export const EventSearchResponseSchema = z.object({
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  page_size: z.number().int().min(1),
  events: z.array(EventDetailSchema),
  query_time_ms: z.number()
}).transform((data) => ({
  total: data.total,
  page: data.page,
  pageSize: data.page_size,
  events: data.events,
  queryTimeMs: data.query_time_ms
}));

// Event filters for SSE streaming
export const EventFiltersSchema = z.object({
  page: z.number().int().optional(),
  limit: z.number().int().optional(),
  search: z.string().optional(),
  severity: z.string().optional(),
  source_type: z.string().optional(),
  start_time: z.number().int().optional(),
  end_time: z.number().int().optional(),
  tenant_id: z.string().optional()
}).transform((data) => ({
  page: data.page,
  limit: data.limit,
  search: data.search,
  severity: data.severity,
  sourceType: data.source_type,
  startTime: data.start_time,
  endTime: data.end_time,
  tenantId: data.tenant_id
}));

// Redis event frame for SSE (snake_case backend → camelCase frontend)
export const RedisEventFrameSchema = z.object({
  event_type: z.string(),
  event_data: EventDetailResponseSchema,
  stream_id: z.string(),
  timestamp: TimestampSchema
}).transform((data) => ({
  eventType: data.event_type,
  eventData: data.event_data,
  streamId: data.stream_id,
  timestamp: data.timestamp
}));

// SSE event data
export const SSEEventDataSchema = z.object({
  type: z.enum(['event', 'heartbeat', 'error']),
  data: z.union([
    RedisEventFrameSchema,
    z.object({ type: z.string(), timestamp: z.string() }),
    z.object({ error: z.string() })
  ])
});

// Log volume metrics
export const LogVolumeMetricsSchema = z.object({
  total_events: z.number().int().min(0),
  total_size_bytes: z.number().int().min(0),
  events_per_second: z.number().min(0),
  last_updated: TimestampSchema
}).transform((data) => ({
  totalEvents: data.total_events,
  totalSizeBytes: data.total_size_bytes,
  eventsPerSecond: data.events_per_second,
  lastUpdated: data.last_updated
}));

export const AlertsResponseSchema = z.object({
  data: z.array(RecentAlertSchema).optional(),
  total: z.number().int().min(0),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).optional()
});

// Rule schemas
export const RuleStatusSchema = z.enum(['enabled', 'disabled', 'testing']);
export const RuleTypeSchema = z.enum(['detection', 'correlation', 'threshold', 'anomaly']);

// Routing Rule schema - matches Rust RoutingRuleResponse
export const RoutingRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  conditions: z.record(z.string(), z.any()),
  actions: z.record(z.string(), z.any()),
  enabled: z.boolean(),
  priority: z.number().int(),
  tags: z.array(z.string()),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  tenant_id: UUIDSchema
}).transform((data) => ({
  id: data.id,
  name: data.name,
  description: data.description,
  conditions: data.conditions,
  actions: data.actions,
  enabled: data.enabled,
  priority: data.priority,
  tags: data.tags,
  createdAt: data.created_at,
  updatedAt: data.updated_at,
  tenantId: data.tenant_id
}));

export const RuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  severity: AlertSeveritySchema,
  enabled: z.boolean(),
  lastTriggered: z.string().optional(),
  timestamp: z.string(),
  status: AlertStatusSchema,
  source: z.string(),
  type: z.string().optional(),
  query: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  tags: z.array(z.string()).optional()
});

// Routing Rules List Response - matches Rust RoutingRulesListResponse
export const RoutingRulesListResponseSchema = z.object({
  rules: z.array(RoutingRuleSchema),
  total: z.number().int().min(0)
});

export const RulesResponseSchema = z.object({
  data: z.array(RuleSchema).optional(),
  total: z.number().int().min(0),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).optional()
});

// Asset schemas
export const AssetTypeSchema = z.enum(['server', 'workstation', 'network_device', 'mobile', 'iot', 'cloud']);
export const AssetStatusSchema = z.enum(['active', 'inactive', 'maintenance', 'decommissioned']);

export const AssetSchema = z.object({
  asset_id: UUIDSchema,
  name: z.string().min(1),
  type: AssetTypeSchema,
  ip_address: IPAddressSchema.nullable().optional(),
  mac_address: z.string().nullable().optional(),
  hostname: z.string().nullable().optional(),
  os: z.string().nullable().optional(),
  status: AssetStatusSchema,
  last_seen: TimestampSchema.nullable().optional(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema.optional(),
  tags: z.array(z.string()).optional(),
  criticality: z.enum(['critical', 'high', 'medium', 'low']).optional()
});

export const AssetsResponseSchema = z.object({
  assets: z.array(AssetSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).optional()
});

// Case schemas
export const CaseStatusSchema = z.enum(['open', 'investigating', 'resolved', 'closed']);
export const CasePrioritySchema = z.enum(['critical', 'high', 'medium', 'low']);

export const CaseSchema = z.object({
  case_id: UUIDSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  status: CaseStatusSchema,
  priority: CasePrioritySchema,
  assignee: z.string().nullable().optional(),
  created_by: z.string(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema.optional(),
  closed_at: TimestampSchema.nullable().optional(),
  alert_ids: z.array(UUIDSchema).optional(),
  tags: z.array(z.string()).optional()
});

export const CasesResponseSchema = z.object({
  cases: z.array(CaseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).optional()
});

// Dashboard schemas
export const DashboardStatsSchema = z.object({
  total_alerts: z.number().int().min(0),
  critical_alerts: z.number().int().min(0),
  high_alerts: z.number().int().min(0),
  medium_alerts: z.number().int().min(0),
  low_alerts: z.number().int().min(0),
  open_cases: z.number().int().min(0),
  active_rules: z.number().int().min(0),
  monitored_assets: z.number().int().min(0)
});

export const DashboardResponseSchema = z.object({
  total: z.number().int().min(0),
  data: z.array(RecentAlertSchema).optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).optional(),
  stats: DashboardStatsSchema.optional(),
  recent_alerts: z.array(RecentAlertSchema).optional(),
  alert_trends: z.array(z.object({
    date: z.string(),
    count: z.number().int().min(0),
    severity: AlertSeveritySchema.optional()
  })).optional()
});

// New DashboardV2 schema matching Rust /api/v1/dashboard endpoint
export const AlertsOverTimeDataSchema = z.object({
  ts: z.number().int(),
  critical: z.number().int().min(0),
  high: z.number().int().min(0),
  medium: z.number().int().min(0),
  low: z.number().int().min(0)
});

export const TopLogSourceDataSchema = z.object({
  source_type: z.string(),
  count: z.number().int().min(0)
});

export const RecentAlertV2Schema = z.object({
  alert_id: UUIDSchema,
  ts: z.number().int(),
  title: z.string(),
  severity: AlertSeveritySchema,
  source_ip: z.string(),
  dest_ip: z.string()
});

export const DashboardV2ResponseSchema = z.object({
  total_events: z.number().int().min(0),
  total_alerts: z.number().int().min(0),
  alerts_over_time: z.array(AlertsOverTimeDataSchema),
  top_log_sources: z.array(TopLogSourceDataSchema),
  recent_alerts: z.array(RecentAlertV2Schema)
});

// Search schemas
export const SearchResultSchema = z.object({
  id: UUIDSchema,
  type: z.enum(['alert', 'event', 'asset', 'case']),
  title: z.string(),
  description: z.string().optional(),
  timestamp: TimestampSchema,
  relevance_score: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.any()).optional()
});

export const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
  total: z.number().int().min(0),
  query: z.string(),
  took_ms: z.number().int().min(0).optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).optional()
});

// Authentication schemas
export const AuthTokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  tenant_id: UUIDSchema,
  expires_in: z.number().int().min(0).optional(),
  token_type: z.string().default('Bearer')
});

export const UserProfileSchema = z.object({
  user_id: UUIDSchema,
  username: z.string().min(1),
  email: z.string().email(),
  full_name: z.string().optional(),
  role: z.string(),
  tenant_id: UUIDSchema,
  permissions: z.array(z.string()).optional(),
  last_login: TimestampSchema.nullable().optional(),
  created_at: TimestampSchema
});

// Error response schema
export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  code: z.string().optional(),
  details: z.record(z.string(), z.any()).optional(),
  timestamp: TimestampSchema.optional()
});

// Generic API response wrapper
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) => z.object({
  success: z.boolean(),
  data: dataSchema.optional(),
  error: ErrorResponseSchema.optional(),
  timestamp: TimestampSchema.optional()
});

/**
 * Validation helper functions
 */
export class ValidationError extends Error {
  constructor(message: string, public zodError: z.ZodError) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validates API response data against a schema
 * Throws ValidationError if validation fails
 */
export function validateApiResponse<T>(data: unknown, schema: z.ZodSchema<T>, context?: string): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const contextMsg = context ? ` in ${context}` : '';
      const errorDetails = error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
      
      console.error(`API Validation Error${contextMsg}:`, {
        errors: error.issues,
        receivedData: data
      });
      
      throw new ValidationError(
        `Invalid API response${contextMsg}: ${errorDetails}`,
        error
      );
    }
    throw error;
  }
}

/**
 * Safely validates data and returns result with error info
 * Does not throw, returns { success: boolean, data?: T, error?: string }
 */
export function safeValidateApiResponse<T>(
  data: unknown, 
  schema: z.ZodSchema<T>, 
  context?: string
): { success: true; data: T } | { success: false; error: string; zodError: z.ZodError } {
  try {
    const validData = schema.parse(data);
    return { success: true, data: validData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const contextMsg = context ? ` in ${context}` : '';
      const errorDetails = error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
      
      return {
        success: false,
        error: `Invalid API response${contextMsg}: ${errorDetails}`,
        zodError: error
      };
    }
    return {
      success: false,
      error: `Unexpected validation error: ${error}`,
      zodError: new z.ZodError([])
    };
  }
}

/**
 * Type exports for TypeScript
 */
// Type exports for all schemas
// Type exports for all schemas
export type TimeRange = z.infer<typeof TimeRangeSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
export type SortField = z.infer<typeof SortFieldSchema>;
export type FilterValue = z.infer<typeof FilterValueSchema>;
export type SearchOptions = z.infer<typeof SearchOptionsSchema>;
export type AggregationRequest = z.infer<typeof AggregationRequestSchema>;
export type EventSearchRequest = z.infer<typeof EventSearchRequestSchema>;
export type EventDetailResponse = z.infer<typeof EventDetailResponseSchema>;
export type SearchEventsResponse = z.infer<typeof SearchEventsResponseSchema>;
export type EventFilters = z.infer<typeof EventFiltersSchema>;
export type RedisEventFrame = z.infer<typeof RedisEventFrameSchema>;
export type SSEEventData = z.infer<typeof SSEEventDataSchema>;
export type LogVolumeMetrics = z.infer<typeof LogVolumeMetricsSchema>;
export type EventDetail = z.infer<typeof EventDetailSchema>;
export type EventSearchResponse = z.infer<typeof EventSearchResponseSchema>;
export type RoutingRule = z.infer<typeof RoutingRuleSchema>;
export type RoutingRulesListResponse = z.infer<typeof RoutingRulesListResponseSchema>;
export type RecentAlert = z.infer<typeof RecentAlertSchema>;
export type AlertDetail = z.infer<typeof AlertDetailSchema>;
export type AlertsResponse = z.infer<typeof AlertsResponseSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type RulesResponse = z.infer<typeof RulesResponseSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type AssetsResponse = z.infer<typeof AssetsResponseSchema>;
export type Case = z.infer<typeof CaseSchema>;
export type CasesResponse = z.infer<typeof CasesResponseSchema>;
export type DashboardStats = z.infer<typeof DashboardStatsSchema>;
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
export type AlertsOverTimeData = z.infer<typeof AlertsOverTimeDataSchema>;
export type TopLogSourceData = z.infer<typeof TopLogSourceDataSchema>;
export type RecentAlertV2 = z.infer<typeof RecentAlertV2Schema>;
export type DashboardV2Response = z.infer<typeof DashboardV2ResponseSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
export type AuthTokens = z.infer<typeof AuthTokensSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;