import { apiClient } from './api';

export interface FieldValuesResponse {
  field: string;
  values: string[];
  total_count: number;
}

export interface MultiFieldValuesResponse {
  field_values: Record<string, string[]>;
}

export const fieldValuesApi = {
  /**
   * Get distinct values for a specific field
   */
  getFieldValues: async (field: string, limit?: number): Promise<FieldValuesResponse> => {
    const params = new URLSearchParams({ field });
    if (limit) {
      params.append('limit', limit.toString());
    }
    
    const response = await apiClient.get(`/api/v1/fields/values?${params.toString()}`);
    return response.data;
  },

  /**
   * Get distinct values for multiple fields in a single request
   */
  getMultipleFieldValues: async (fields: string[], limit?: number): Promise<MultiFieldValuesResponse> => {
    const params = new URLSearchParams({ fields: fields.join(',') });
    if (limit) {
      params.append('limit', limit.toString());
    }
    
    const response = await apiClient.get(`/api/v1/fields/values/multiple?${params.toString()}`);
    return response.data;
  },

  /**
   * Get values for commonly used fields in query builder
   */
  getCommonFieldValues: async (): Promise<MultiFieldValuesResponse> => {
    const commonFields = [
      'event_category',
      'event_action', 
      'event_outcome',
      'user_type',
      'auth_method',
      'protocol',
      'severity',
      'vendor',
      'product'
    ];
    
    return fieldValuesApi.getMultipleFieldValues(commonFields, 50);
  }
};