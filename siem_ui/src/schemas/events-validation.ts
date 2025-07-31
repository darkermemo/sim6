import { z } from 'zod';

/**
 * Zod schema for ClickHouse event data validation
 * Based on the dev.events table structure
 */
export const EventSchema = z.object({
  event_id: z.string(),
  tenant_id: z.string(),
  event_timestamp: z.number(), // Unix timestamp
  source_ip: z.string(),
  source_type: z.string(),
  message: z.string().optional(), // Nullable
  severity: z.string().optional(), // Nullable
});

export const EventsListSchema = z.array(EventSchema);

export type Event = z.infer<typeof EventSchema>;
export type EventsList = z.infer<typeof EventsListSchema>;

/**
 * Event filters for API requests
 */
export const EventFiltersSchema = z.object({
  page: z.number().optional(),
  limit: z.number().optional(),
  search: z.string().optional(),
  severity: z.string().optional(),
  source_type: z.string().optional(),
  start_time: z.number().optional(),
  end_time: z.number().optional(),
});

export type EventFilters = z.infer<typeof EventFiltersSchema>;