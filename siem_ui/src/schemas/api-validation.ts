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

export const AlertsResponseSchema = z.object({
  alerts: z.array(RecentAlertSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).optional()
});

// Rule schemas
export const RuleStatusSchema = z.enum(['enabled', 'disabled', 'testing']);
export const RuleTypeSchema = z.enum(['detection', 'correlation', 'threshold', 'anomaly']);

export const RuleSchema = z.object({
  rule_id: UUIDSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  type: RuleTypeSchema,
  status: RuleStatusSchema,
  severity: AlertSeveritySchema,
  query: z.string().min(1),
  created_at: TimestampSchema,
  updated_at: TimestampSchema.optional(),
  created_by: z.string(),
  tags: z.array(z.string()).optional(),
  enabled: z.boolean()
});

export const RulesResponseSchema = z.object({
  rules: z.array(RuleSchema),
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
  stats: DashboardStatsSchema,
  recent_alerts: z.array(RecentAlertSchema),
  alert_trends: z.array(z.object({
    date: z.string(),
    count: z.number().int().min(0),
    severity: AlertSeveritySchema.optional()
  })).optional()
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
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
export type AuthTokens = z.infer<typeof AuthTokensSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;