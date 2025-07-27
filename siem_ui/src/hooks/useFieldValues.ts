import { useState, useEffect, useCallback } from 'react';
import { fieldValuesApi, FieldValuesResponse, MultiFieldValuesResponse } from '@/services/fieldValuesApi';
import { useToast } from '@/hooks/useToast';

interface UseFieldValuesReturn {
  fieldValues: Record<string, string[]>;
  isLoading: boolean;
  error: string | null;
  loadFieldValues: (field: string) => Promise<void>;
  loadMultipleFieldValues: (fields: string[]) => Promise<void>;
  loadCommonFieldValues: () => Promise<void>;
  clearFieldValues: () => void;
}

export function useFieldValues(): UseFieldValuesReturn {
  const [fieldValues, setFieldValues] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadFieldValues = useCallback(async (field: string) => {
    // Return early if we already have values for this field
    if (fieldValues[field] && fieldValues[field].length > 0) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response: FieldValuesResponse = await fieldValuesApi.getFieldValues(field, 100);
      setFieldValues(prev => ({
        ...prev,
        [field]: response.values
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load field values';
      setError(errorMessage);
      console.error('Error loading field values:', err);
      
      // Show toast notification for error
      toast({
        title: 'Error Loading Field Values',
        description: `Failed to load values for field '${field}': ${errorMessage}`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [fieldValues, toast]);

  const loadMultipleFieldValues = useCallback(async (fields: string[]) => {
    // Filter out fields we already have values for
    const fieldsToLoad = fields.filter(field => !fieldValues[field] || fieldValues[field].length === 0);
    
    if (fieldsToLoad.length === 0) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response: MultiFieldValuesResponse = await fieldValuesApi.getMultipleFieldValues(fieldsToLoad, 50);
      setFieldValues(prev => ({
        ...prev,
        ...response.field_values
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load field values';
      setError(errorMessage);
      console.error('Error loading multiple field values:', err);
      
      toast({
        title: 'Error Loading Field Values',
        description: `Failed to load values for fields: ${errorMessage}`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [fieldValues, toast]);

  const loadCommonFieldValues = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response: MultiFieldValuesResponse = await fieldValuesApi.getCommonFieldValues();
      setFieldValues(prev => ({
        ...prev,
        ...response.field_values
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load common field values';
      setError(errorMessage);
      console.error('Error loading common field values:', err);
      
      toast({
        title: 'Error Loading Field Values',
        description: `Failed to load common field values: ${errorMessage}`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const clearFieldValues = useCallback(() => {
    setFieldValues({});
    setError(null);
  }, []);

  // Load common field values on mount
  useEffect(() => {
    loadCommonFieldValues();
  }, [loadCommonFieldValues]);

  return {
    fieldValues,
    isLoading,
    error,
    loadFieldValues,
    loadMultipleFieldValues,
    loadCommonFieldValues,
    clearFieldValues
  };
}