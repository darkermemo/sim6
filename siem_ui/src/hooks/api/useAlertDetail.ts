import useSWR from 'swr';
import { useAuthStore } from '@/stores/authStore';
import { EventDetailSchema, type EventDetail, type AlertDetail } from '@/schemas/api-validation';

/**
 * Hook to fetch detailed alert information
 * Uses SWR for caching and automatic revalidation with Zod validation
 * Transforms EventDetail from /events endpoint to AlertDetail format
 */
export function useAlertDetail(alertId: string | null) {
  const key = alertId ? ['alert', alertId] : null;

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate
  } = useSWR<AlertDetail>(
    alertId ? key : null,
    () => fetchAlertDetail(alertId!),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      errorRetryCount: 3,
      errorRetryInterval: 5000,
    }
  );

  return {
    /** Alert detail data from API */
    data,
    /** Loading state - true during initial load */
    isLoading,
    /** Validating state - true during background refresh */
    isValidating,
    /** Error object if request failed */
    error,
    /** Whether data is empty/null */
    isEmpty: !data,
    /** Manual refresh function */
    refresh: mutate,
    /** Whether currently refreshing */
    isRefreshing: isValidating && !!data,
  };
}

/**
 * Transform EventDetail to AlertDetail format
 * Maps event fields to expected alert structure
 */
function transformEventToAlert(event: EventDetail): AlertDetail {
  return {
    id: event.id,
    name: event.message || `Alert from ${event.source}`,
    severity: mapSeverityToAlertSeverity(event.severity),
    source_ip: event.sourceIp || null,
    dest_ip: null, // EventDetail doesn't have dest_ip
    timestamp: event.timestamp,
    status: 'open', // Default status for events
    user: null, // EventDetail doesn't have user field
    asset_info: event.hostname || null,
    description: event.rawMessage || event.message,
    rule_id: undefined,
    raw_event: {
      ...event.fields,
      original_event: {
        id: event.id,
        timestamp: event.timestamp,
        source: event.source,
        hostname: event.hostname,
        message: event.message,
        raw_message: event.rawMessage,
        tags: event.tags
      }
    },
    tags: event.tags,
    assignee: null,
    created_at: event.createdAt,
    updated_at: event.updatedAt
  };
}

/**
 * Map event severity to alert severity enum
 */
function mapSeverityToAlertSeverity(severity: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
  const severityLower = severity.toLowerCase();
  switch (severityLower) {
    case 'critical':
    case 'crit':
      return 'critical';
    case 'high':
    case 'error':
    case 'err':
      return 'high';
    case 'medium':
    case 'warning':
    case 'warn':
      return 'medium';
    case 'low':
    case 'notice':
      return 'low';
    case 'info':
    case 'debug':
    default:
      return 'info';
  }
}

/**
 * Fetch alert detail from events API and transform to AlertDetail
 * Uses the /api/v1/events/search endpoint to find event by ID
 */
async function fetchAlertDetail(alertId: string): Promise<AlertDetail> {
  const { accessToken } = useAuthStore.getState();
  
  try {
    const searchResponse = await fetch('/api/v1/events/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        filters: {
          event_id: {
            operator: "Equals",
            value: alertId
          }
        },
        pagination: {
          page: 1,
          size: 1,
          include_total: true
        }
      })
    });
    
    if (!searchResponse.ok) {
      throw new Error(`Search failed: ${searchResponse.status} ${searchResponse.statusText}`);
    }
    
    const searchData = await searchResponse.json();
    
    if (searchData.events && searchData.events.length > 0) {
      const event = EventDetailSchema.parse(searchData.events[0]);
      return transformEventToAlert(event);
    }
    
    throw new Error(`Event not found with ID: ${alertId}`);
  } catch (error) {
    console.error('Failed to fetch alert details:', error);
    throw new Error(`Unable to fetch alert details for ID: ${alertId}. ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}