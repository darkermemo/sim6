import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/Sheet';
import { Plus, Search, Edit } from 'lucide-react';
import {
  Tenant,
  CreateTenantRequest,
  UpdateTenantRequest,
  TenantListResponse,
} from '@/types/api';

interface TenantManagementProps {
  userRole: string;
}

const TenantManagement: React.FC<TenantManagementProps> = ({ userRole }) => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [formData, setFormData] = useState({
    tenant_name: '',
    is_active: 1,
  });

  // Check if user has SuperAdmin role
  const isSuperAdmin = userRole === 'SuperAdmin';

  useEffect(() => {
    if (isSuperAdmin) {
      fetchTenants();
    } else {
      setError('Access denied. SuperAdmin role required.');
      setLoading(false);
    }
  }, [isSuperAdmin]);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      // TODO: Replace with typed API call when tenant API is implemented
      const token = localStorage.getItem('access_token');
      const response = await fetch('/api/v1/tenants', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required');
        }
        throw new Error('Failed to fetch tenants');
      }

      const data: TenantListResponse = await response.json();
      setTenants(data.tenants);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTenant = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const createRequest: CreateTenantRequest = {
        tenant_name: formData.tenant_name,
      };

      const response = await fetch('/api/v1/tenants', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createRequest),
      });

      if (!response.ok) {
        throw new Error('Failed to create tenant');
      }

      setIsCreateSheetOpen(false);
      setFormData({ tenant_name: '', is_active: 1 });
      fetchTenants();
    } catch (err) {
      setError('Failed to create tenant');
    }
  };

  const handleUpdateTenant = async () => {
    if (!selectedTenant) return;

    try {
      const token = localStorage.getItem('access_token');
      const updateRequest: UpdateTenantRequest = {
        tenant_name: formData.tenant_name,
        is_active: formData.is_active,
      };

      const response = await fetch(`/api/v1/tenants/${selectedTenant.tenant_id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateRequest),
      });

      if (!response.ok) {
        throw new Error('Failed to update tenant');
      }

      setIsEditSheetOpen(false);
      setSelectedTenant(null);
      setFormData({ tenant_name: '', is_active: 1 });
      fetchTenants();
    } catch (err) {
      setError('Failed to update tenant');
    }
  };

  const openEditSheet = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setFormData({
      tenant_name: tenant.tenant_name,
      is_active: tenant.is_active,
    });
    setIsEditSheetOpen(true);
  };

  const filteredTenants = tenants.filter(tenant =>
    tenant.tenant_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isSuperAdmin) {
    return (
      <Card className="p-6">
        <div className="text-center text-red-600">
          Access denied. SuperAdmin role required to manage tenants.
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="text-center">Loading tenants...</div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center text-red-600">{error}</div>
        <div className="text-center mt-4">
          <Button onClick={fetchTenants}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tenant Management</h1>
          <p className="text-muted-foreground">
            Manage system tenants and their configurations
          </p>
        </div>
        <Button onClick={() => setIsCreateSheetOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Tenant
        </Button>
      </div>

      {/* Search */}
      <Card className="p-4">
        <div className="relative">
          <label htmlFor="tenant-search" className="sr-only">Search tenants</label>
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            id="tenant-search"
            type="text"
            placeholder="Search tenants..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </Card>

      {/* Tenants List */}
      <Card className="p-6">
        <div className="space-y-4">
          {filteredTenants.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No tenants found
            </div>
          ) : (
            filteredTenants.map((tenant) => (
              <div key={tenant.tenant_id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <h3 className="font-medium">{tenant.tenant_name}</h3>
                  <p className="text-sm text-muted-foreground">
                    Created: {new Date(tenant.created_at * 1000).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center space-x-3">
                  <Badge variant={tenant.is_active ? 'default' : 'secondary'}>
                    {tenant.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditSheet(tenant)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Create Tenant Sheet */}
      <Sheet open={isCreateSheetOpen} onOpenChange={setIsCreateSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Create New Tenant</SheetTitle>
            <SheetDescription>
              Add a new tenant to the system
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <label htmlFor="create-tenant-name" className="block text-sm font-medium mb-2">Tenant Name</label>
              <input
                id="create-tenant-name"
                type="text"
                value={formData.tenant_name}
                onChange={(e) => setFormData({ ...formData, tenant_name: e.target.value })}
                placeholder="Enter tenant name"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setIsCreateSheetOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateTenant}>
                Create
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Tenant Sheet */}
      <Sheet open={isEditSheetOpen} onOpenChange={setIsEditSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit Tenant</SheetTitle>
            <SheetDescription>
              Update tenant information
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <label htmlFor="edit-tenant-name" className="block text-sm font-medium mb-2">Tenant Name</label>
              <input
                id="edit-tenant-name"
                type="text"
                value={formData.tenant_name}
                onChange={(e) => setFormData({ ...formData, tenant_name: e.target.value })}
                placeholder="Enter tenant name"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="edit-tenant-status" className="block text-sm font-medium mb-2">Status</label>
              <select
                id="edit-tenant-status"
                value={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={1}>Active</option>
                <option value={0}>Inactive</option>
              </select>
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setIsEditSheetOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateTenant}>
                Update
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default TenantManagement;