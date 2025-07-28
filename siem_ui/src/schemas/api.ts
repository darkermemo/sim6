/**
 * Zod schemas for API response validation
 * Ensures type safety and catches schema mismatches at runtime
 */
import { z } from 'zod';

// Base response schema
export const BaseResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional()
});

// User schema
export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().email(),
  role: z.string()
});

// Authentication response schema
export const AuthResponseSchema = BaseResponseSchema.extend({
  data: z.object({
    token: z.string(),
    user: UserSchema
  }).optional()
});

// Tenant schema
export const TenantSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.string(),
  created: z.string()
});

export const TenantsResponseSchema = BaseResponseSchema.extend({
  data: z.array(TenantSchema).optional()
});

// Log Source schema
export const LogSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  status: z.string(),
  eventsPerSec: z.number(),
  ipAddress: z.string().optional()
});

export const LogSourcesResponseSchema = BaseResponseSchema.extend({
  data: z.array(LogSourceSchema).optional()
});

// Alert schema
export const AlertSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: z.enum(['Low', 'Medium', 'High', 'Critical']),
  status: z.enum(['Open', 'Investigating', 'Resolved', 'Closed']),
  timestamp: z.string(),
  source: z.string(),
  description: z.string()
});

export const AlertsResponseSchema = BaseResponseSchema.extend({
  data: z.array(AlertSchema).optional()
});

// Rule schema
export const RuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  severity: z.enum(['Low', 'Medium', 'High', 'Critical']),
  enabled: z.boolean(),
  lastTriggered: z.string().nullable()
});

export const RulesResponseSchema = BaseResponseSchema.extend({
  data: z.array(RuleSchema).optional()
});

// Metrics schema
export const MetricsSchema = z.object({
  systemHealth: z.object({
    cpu: z.number(),
    memory: z.number(),
    disk: z.number(),
    network: z.number()
  }),
  eventMetrics: z.object({
    totalEvents: z.number(),
    eventsPerSecond: z.number(),
    alertsGenerated: z.number(),
    rulesTriggered: z.number()
  })
});

export const MetricsResponseSchema = BaseResponseSchema.extend({
  data: MetricsSchema.optional()
});

// Dashboard KPIs schema
export const DashboardKPIsSchema = z.object({
  totalEvents: z.number(),
  activeAlerts: z.number(),
  resolvedAlerts: z.number(),
  logSources: z.number(),
  rulesTriggered: z.number()
});

export const DashboardKPIsResponseSchema = BaseResponseSchema.extend({
  data: DashboardKPIsSchema.optional()
});

// Health check schema
export const HealthResponseSchema = z.object({
  status: z.string(),
  timestamp: z.string()
});

// Type exports for TypeScript
export type User = z.infer<typeof UserSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type Tenant = z.infer<typeof TenantSchema>;
export type TenantsResponse = z.infer<typeof TenantsResponseSchema>;
export type LogSource = z.infer<typeof LogSourceSchema>;
export type LogSourcesResponse = z.infer<typeof LogSourcesResponseSchema>;
export type Alert = z.infer<typeof AlertSchema>;
export type AlertsResponse = z.infer<typeof AlertsResponseSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type RulesResponse = z.infer<typeof RulesResponseSchema>;
export type Metrics = z.infer<typeof MetricsSchema>;
export type MetricsResponse = z.infer<typeof MetricsResponseSchema>;
export type DashboardKPIs = z.infer<typeof DashboardKPIsSchema>;
export type DashboardKPIsResponse = z.infer<typeof DashboardKPIsResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/**
 * Utility function to validate API responses
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Validated data or throws error
 */
export function validateApiResponse<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    console.error('API Response validation failed:', error);
    throw new Error(`API response validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}