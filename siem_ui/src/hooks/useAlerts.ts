import { useState, useEffect } from 'react';
import type { 
  Alert, 
  AlertDetail, 
  AlertNote, 
  CreateAlertNoteRequest, 
  UpdateAlertStatusRequest, 
  UpdateAlertAssigneeRequest 
} from '../types/api';

interface UseAlertsResult {
  alerts: Alert[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UseAlertDetailResult {
  alert: AlertDetail | null;
  loading: boolean;
  error: string | null;
  updateStatus: (status: string) => Promise<boolean>;
  updateAssignee: (assigneeId: string | null) => Promise<boolean>;
  refetch: () => Promise<void>;
}

interface UseAlertNotesResult {
  notes: AlertNote[];
  loading: boolean;
  error: string | null;
  addNote: (content: string) => Promise<boolean>;
  refetch: () => Promise<void>;
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
};

export const useAlerts = (): UseAlertsResult => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch events from the events endpoint instead of alerts
      const response = await fetch('/api/v1/events', {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch events');
      }

      const data = await response.json();
      
      // Extract events from the search response structure
      let eventsArray: any[] = [];
      if (data.hits && Array.isArray(data.hits.hits)) {
        // Standard search response format
        eventsArray = data.hits.hits.map((hit: any) => hit.source || hit._source || hit);
      } else if (Array.isArray(data)) {
        // Direct array response
        eventsArray = data;
      } else if (data.events && Array.isArray(data.events)) {
        // Events wrapped in events property
        eventsArray = data.events;
      }
      
      // Transform Event data to Alert format and filter for alert-worthy events
      const transformedAlerts = eventsArray
        .filter((event: any) => {
          // Filter for events that represent alerts (have severity indicating alert level)
          return event && 
                 typeof event === 'object' && 
                 event.event_id && 
                 event.severity && 
                 ['critical', 'high', 'medium'].includes(event.severity.toLowerCase());
        })
        .map((event: any) => {
          // Transform Event to Alert interface
          const alertTimestamp = event.event_timestamp 
            ? (typeof event.event_timestamp === 'string' 
                ? new Date(event.event_timestamp).getTime() 
                : event.event_timestamp * 1000) // Convert Unix timestamp to milliseconds
            : Date.now();
            
          return {
            alert_id: event.event_id,
            id: event.event_id,
            tenant_id: event.tenant_id || '',
            rule_id: event.rule_id || '',
            rule_name: event.message || 'Unknown Alert', // Use message as rule name
            event_id: event.event_id,
            alert_timestamp: alertTimestamp,
            severity: event.severity || 'low',
            status: 'New', // Default status since Event doesn't have status
            created_at: alertTimestamp
          } as Alert;
        });
      
      setAlerts(transformedAlerts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  return {
    alerts,
    loading,
    error,
    refetch: fetchAlerts,
  };
};

export const useAlertDetail = (alertId: string): UseAlertDetailResult => {
  const [alert, setAlert] = useState<AlertDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlert = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/v1/alerts/${alertId}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch alert details');
      }

      const data: AlertDetail = await response.json();
      setAlert(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch alert details');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (status: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/v1/alerts/${alertId}/status`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status } as UpdateAlertStatusRequest),
      });

      if (!response.ok) {
        throw new Error('Failed to update alert status');
      }

      await fetchAlert(); // Refresh alert data
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update alert status');
      return false;
    }
  };

  const updateAssignee = async (assigneeId: string | null): Promise<boolean> => {
    try {
      const response = await fetch(`/api/v1/alerts/${alertId}/assignee`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ assignee_id: assigneeId } as UpdateAlertAssigneeRequest),
      });

      if (!response.ok) {
        throw new Error('Failed to update alert assignee');
      }

      await fetchAlert(); // Refresh alert data
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update alert assignee');
      return false;
    }
  };

  useEffect(() => {
    if (alertId) {
      fetchAlert();
    }
  }, [alertId]);

  return {
    alert,
    loading,
    error,
    updateStatus,
    updateAssignee,
    refetch: fetchAlert,
  };
};

export const useAlertNotes = (alertId: string): UseAlertNotesResult => {
  const [notes, setNotes] = useState<AlertNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotes = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/v1/alerts/${alertId}/notes`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch alert notes');
      }

      const data = await response.json();
      setNotes(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch alert notes');
    } finally {
      setLoading(false);
    }
  };

  const addNote = async (content: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/v1/alerts/${alertId}/notes`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ content } as CreateAlertNoteRequest),
      });

      if (!response.ok) {
        throw new Error('Failed to add note');
      }

      await fetchNotes(); // Refresh notes
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add note');
      return false;
    }
  };

  useEffect(() => {
    if (alertId) {
      fetchNotes();
    }
  }, [alertId]);

  return {
    notes,
    loading,
    error,
    addNote,
    refetch: fetchNotes,
  };
};