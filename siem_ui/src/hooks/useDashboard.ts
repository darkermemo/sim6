import { useState, useEffect } from 'react';
import { DashboardResponse, DashboardFilters } from '../types/api';
import { apiClient } from '../services/api';

export const useDashboard = (filters?: DashboardFilters) => {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Build query parameters
      const params = new URLSearchParams();
      if (filters?.from) params.append('from', filters.from);
      if (filters?.to) params.append('to', filters.to);
      if (filters?.severity) params.append('severity', filters.severity);
      if (filters?.tenant_id) params.append('tenant_id', filters.tenant_id);
      if (filters?.limit) params.append('limit', filters.limit.toString());
      
      const queryString = params.toString();
      const url = `/api/v1/dashboard${queryString ? `?${queryString}` : ''}`;
      
      const response = await apiClient.get<DashboardResponse>(url);
      setData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [filters?.from, filters?.to, filters?.severity, filters?.tenant_id, filters?.limit]);

  return {
    data,
    loading,
    error,
    refetch: fetchDashboard
  };
};