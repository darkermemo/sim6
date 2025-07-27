import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { apiClient } from '@/services/api';
import { useToast } from '@/hooks/useToast';
import type { AlertNote, CreateAlertNoteRequest } from '@/types/api';

/**
 * Hook to fetch alert notes
 */
export function useAlertNotes(alertId: string | null) {
  const key = alertId ? ['alert-notes', alertId] : null;

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate: mutateNotes
  } = useSWR<AlertNote[]>(
    alertId ? key : null,
    () => fetchAlertNotes(alertId!),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      errorRetryCount: 3,
      errorRetryInterval: 5000,
    }
  );

  return {
    /** Alert notes data from API */
    data: data || [],
    /** Loading state - true during initial load */
    isLoading,
    /** Validating state - true during background refresh */
    isValidating,
    /** Error object if request failed */
    error,
    /** Whether data is empty/null */
    isEmpty: !data || data.length === 0,
    /** Manual refresh function */
    refresh: mutateNotes,
  };
}

/**
 * Hook to add notes to alerts with optimistic updates
 */
export function useAddAlertNote() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const addNote = async (
    alertId: string,
    content: string,
    options: {
      optimistic?: boolean;
      showToast?: boolean;
    } = { optimistic: true, showToast: true }
  ) => {
    const { optimistic = true, showToast = true } = options;
    
    setIsLoading(true);

    try {
      // Optimistic update - add note to UI before API call
      if (optimistic) {
        const optimisticNote: AlertNote = {
          note_id: `temp-${Date.now()}`,
          alert_id: alertId,
          tenant_id: '', // Will be filled by backend
          author: 'You', // Temporary author
          content,
          created_at: Math.floor(Date.now() / 1000),
        };

        await mutate(
          ['alert-notes', alertId],
          (currentNotes: AlertNote[] = []) => [optimisticNote, ...currentNotes],
          { revalidate: false }
        );
      }

      // Make API call
      const response = await apiClient.post(
        `/api/v1/alerts/${alertId}/notes`,
        { content } as CreateAlertNoteRequest
      );

      if (response.data) {
        // Revalidate to ensure data consistency
        await mutate(['alert-notes', alertId]);

        if (showToast) {
          toast({
            title: 'Note Added',
            description: 'Your note has been added to the alert',
            variant: 'success',
          });
        }

        return response.data;
      } else {
        throw new Error('Failed to add note');
      }
    } catch (error) {
      // Revert optimistic update on error
      if (optimistic) {
        await mutate(['alert-notes', alertId]);
      }

      if (showToast) {
        toast({
          title: 'Failed to Add Note',
          description: 'Unable to add note. Please try again.',
          variant: 'destructive',
        });
      }

      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    /** Add note function */
    addNote,
    /** Loading state */
    isLoading,
  };
}

/**
 * Fetch alert notes from API
 */
async function fetchAlertNotes(alertId: string): Promise<AlertNote[]> {
  const response = await apiClient.get(`/api/v1/alerts/${alertId}/notes`);
  
  // Handle ClickHouse JSON format
  if (response.data?.data && Array.isArray(response.data.data)) {
    return response.data.data.map((row: any[]) => ({
      note_id: row[0],
      alert_id: row[1],
      tenant_id: row[2],
      author: row[3],
      content: row[4],
      created_at: row[5],
    }));
  }
  
  return response.data || [];
} 