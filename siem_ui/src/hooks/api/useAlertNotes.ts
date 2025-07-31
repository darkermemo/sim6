import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { validatedFetch } from '../useValidatedApi';
import { useToast } from '@/hooks/useToast';
import { z } from 'zod';

// Zod schemas for alert notes
const AlertNoteSchema = z.object({
  id: z.string().uuid(),
  alertId: z.string().uuid(),
  content: z.string(),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
}).transform((data) => ({
  id: data.id,
  alertId: data.alertId,
  content: data.content,
  createdBy: data.createdBy,
  createdAt: data.createdAt,
  updatedAt: data.updatedAt,
}));

const AlertNotesListSchema = z.array(AlertNoteSchema);

const CreateAlertNoteRequestSchema = z.object({
  content: z.string().min(1),
});

type AlertNote = z.infer<typeof AlertNoteSchema>;
type CreateAlertNoteRequest = z.infer<typeof CreateAlertNoteRequestSchema>;

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
          id: `temp-${Date.now()}`,
          alertId: alertId,
          content,
          createdBy: 'You', // Temporary author
          createdAt: new Date().toISOString(),
          updatedAt: undefined,
        };

        await mutate(
          ['alert-notes', alertId],
          (currentNotes: AlertNote[] = []) => [optimisticNote, ...currentNotes],
          { revalidate: false }
        );
      }

      // Make API call
      const response = await addAlertNote(alertId, { content } as CreateAlertNoteRequest);

      // Revalidate to ensure data consistency
      await mutate(['alert-notes', alertId]);

      if (showToast) {
        toast({
          title: 'Note Added',
          description: 'Your note has been added to the alert',
          variant: 'success',
        });
      }

      return response;
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
  const token = localStorage.getItem('access_token');
  return validatedFetch(
    `/alerts/${alertId}/notes`,
    AlertNotesListSchema,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );
}

async function addAlertNote(
  alertId: string,
  noteData: CreateAlertNoteRequest
): Promise<AlertNote> {
  const token = localStorage.getItem('access_token');
  return validatedFetch(
    `/alerts/${alertId}/notes`,
    AlertNoteSchema,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(noteData),
    }
  );
}