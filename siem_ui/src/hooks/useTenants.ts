import { useState, useEffect } from 'react';
import { Tenant, TenantListResponse } from '@/types/api';

/**
 * Hook for managing tenant data and lookups
 * Provides tenant name resolution from tenant IDs
 */
export function useTenants() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create a lookup map for quick tenant name resolution
  const tenantLookup = tenants.reduce((acc, tenant) => {
    acc[tenant.tenant_id] = tenant.tenant_name;
    return acc;
  }, {} as Record<string, string>);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      
      if (!token) {
        setError('No authentication token found');
        return;
      }

      const response = await fetch('/api/v1/tenants', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError('Authentication required');
          return;
        }
        if (response.status === 403) {
          // User doesn't have permission to view all tenants
          // This is normal for non-SuperAdmin users
          setTenants([]);
          setError(null);
          return;
        }
        throw new Error('Failed to fetch tenants');
      }

      const data: TenantListResponse = await response.json();
      setTenants(data.tenants || []);
      setError(null);
    } catch (err) {
      console.warn('Failed to fetch tenants:', err);
      // Don't set error for permission issues - just use empty tenant list
      setTenants([]);
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  /**
   * Get tenant name by tenant ID
   * Returns the tenant name if found, otherwise returns the tenant ID
   */
  const getTenantName = (tenantId: string): string => {
    return tenantLookup[tenantId] || tenantId;
  };

  /**
   * Get tenant by ID
   */
  const getTenant = (tenantId: string): Tenant | undefined => {
    return tenants.find(t => t.tenant_id === tenantId);
  };

  return {
    tenants,
    loading,
    error,
    getTenantName,
    getTenant,
    refresh: fetchTenants,
  };
}