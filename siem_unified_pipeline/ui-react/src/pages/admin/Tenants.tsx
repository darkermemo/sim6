import React, { useState } from 'react';
import { Plus, Search, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface Tenant {
  tenant_id: number;
  slug: string;
  name: string;
  status: string;
  region: string;
  created_at: string;
}

interface TenantLimits {
  tenant_id: number;
  eps_hard: number;
  eps_soft: number;
  burst: number;
  retention_days: number;
  export_daily_mb: number;
  updated_at: string;
}

interface ApiKey {
  tenant_id: number;
  key_id: string;
  prefix: string;
  role: string;
  created_at: string;
  last_used_at: string;
  revoked: boolean;
}

export function AdminTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showLimitsDialog, setShowLimitsDialog] = useState(false);
  const [showApiKeysDialog, setShowApiKeysDialog] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Form states
  const [createForm, setCreateForm] = useState({
    tenant_id: '',
    slug: '',
    name: '',
    region: 'default',
    status: 'ACTIVE'
  });

  const [editForm, setEditForm] = useState({
    slug: '',
    name: '',
    region: '',
    status: ''
  });

  const [limitsForm, setLimitsForm] = useState({
    eps_hard: 1000,
    eps_soft: 500,
    burst: 2000,
    retention_days: 90,
    export_daily_mb: 100
  });

  const [apiKeyForm, setApiKeyForm] = useState({
    role: 'analyst'
  });

  const handleCreateTenant = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/v2/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...createForm,
          tenant_id: createForm.tenant_id ? parseInt(createForm.tenant_id) : undefined
        })
      });

      if (response.ok) {
        const newTenant = await response.json();
        setTenants([...tenants, newTenant.tenant]);
        setShowCreateDialog(false);
        setCreateForm({ tenant_id: '', slug: '', name: '', region: 'default', status: 'ACTIVE' });
        toast({
          title: 'Success',
          description: 'Tenant created successfully',
        });
      } else {
        throw new Error('Failed to create tenant');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create tenant',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditTenant = async () => {
    if (!selectedTenant) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/v2/admin/tenants/${selectedTenant.tenant_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });

      if (response.ok) {
        const updatedTenants = tenants.map(t => 
          t.tenant_id === selectedTenant.tenant_id 
            ? { ...t, ...editForm }
            : t
        );
        setTenants(updatedTenants);
        setShowEditDialog(false);
        toast({
          title: 'Success',
          description: 'Tenant updated successfully',
        });
      } else {
        throw new Error('Failed to update tenant');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update tenant',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateLimits = async () => {
    if (!selectedTenant) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/v2/admin/tenants/${selectedTenant.tenant_id}/limits`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(limitsForm)
      });

      if (response.ok) {
        setShowLimitsDialog(false);
        toast({
          title: 'Success',
          description: 'Tenant limits updated successfully',
        });
      } else {
        throw new Error('Failed to update limits');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update limits',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateApiKey = async () => {
    if (!selectedTenant) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/v2/admin/tenants/${selectedTenant.tenant_id}/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiKeyForm)
      });

      if (response.ok) {
        const result = await response.json();
        setShowApiKeysDialog(false);
        toast({
          title: 'API Key Created',
          description: `Key: ${result.prefix}...${result.secret.slice(-4)}`,
        });
      } else {
        throw new Error('Failed to create API key');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create API key',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setEditForm({
      slug: tenant.slug,
      name: tenant.name,
      region: tenant.region,
      status: tenant.status
    });
    setShowEditDialog(true);
  };

  const openLimitsDialog = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setShowLimitsDialog(true);
  };

  const openApiKeysDialog = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setShowApiKeysDialog(true);
  };

  const filteredTenants = tenants.filter(tenant =>
    tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tenant.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Tenant Management</h1>
          <p className="text-muted-foreground">Manage multi-tenant operations and limits</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Tenant
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Search tenants..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tenants Table */}
      <Card>
        <CardHeader>
          <CardTitle>Tenants</CardTitle>
          <CardDescription>All registered tenants in the system</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredTenants.map((tenant) => (
              <div key={tenant.tenant_id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <div className="font-medium">{tenant.name}</div>
                  <div className="text-sm text-muted-foreground">
                    ID: {tenant.tenant_id} • Slug: {tenant.slug} • Region: {tenant.region}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Created: {new Date(tenant.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={tenant.status === 'ACTIVE' ? 'default' : 'secondary'}>
                    {tenant.status}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(tenant)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openLimitsDialog(tenant)}>
                    Limits
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openApiKeysDialog(tenant)}>
                    API Keys
                  </Button>
                </div>
              </div>
            ))}
            {filteredTenants.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No tenants found
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create Tenant Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Tenant</DialogTitle>
            <DialogDescription>Add a new tenant to the system</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="tenant-id">Tenant ID (optional)</Label>
              <Input
                id="tenant-id"
                type="number"
                value={createForm.tenant_id}
                onChange={(e) => setCreateForm({ ...createForm, tenant_id: e.target.value })}
                placeholder="Auto-generated if not provided"
              />
            </div>
            <div>
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={createForm.slug}
                onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value })}
                placeholder="unique-identifier"
              />
            </div>
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="Display name"
              />
            </div>
            <div>
              <Label htmlFor="region">Region</Label>
              <Select value={createForm.region} onValueChange={(value) => setCreateForm({ ...createForm, region: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="us-west">US West</SelectItem>
                  <SelectItem value="us-east">US East</SelectItem>
                  <SelectItem value="eu-west">EU West</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={createForm.status} onValueChange={(value) => setCreateForm({ ...createForm, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateTenant} disabled={loading}>
              {loading ? 'Creating...' : 'Create Tenant'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Tenant Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tenant</DialogTitle>
            <DialogDescription>Update tenant information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-slug">Slug</Label>
              <Input
                id="edit-slug"
                value={editForm.slug}
                onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-region">Region</Label>
              <Select value={editForm.region} onValueChange={(value) => setEditForm({ ...editForm, region: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="us-west">US West</SelectItem>
                  <SelectItem value="us-east">US East</SelectItem>
                  <SelectItem value="eu-west">EU West</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-status">Status</Label>
              <Select value={editForm.status} onValueChange={(value) => setEditForm({ ...editForm, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={handleEditTenant} disabled={loading}>
              {loading ? 'Updating...' : 'Update Tenant'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Limits Dialog */}
      <Dialog open={showLimitsDialog} onOpenChange={setShowLimitsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tenant Limits</DialogTitle>
            <DialogDescription>Configure quotas and limits for {selectedTenant?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="eps-hard">EPS Hard Limit</Label>
                <Input
                  id="eps-hard"
                  type="number"
                  value={limitsForm.eps_hard}
                  onChange={(e) => setLimitsForm({ ...limitsForm, eps_hard: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label htmlFor="eps-soft">EPS Soft Limit</Label>
                <Input
                  id="eps-soft"
                  type="number"
                  value={limitsForm.eps_soft}
                  onChange={(e) => setLimitsForm({ ...limitsForm, eps_soft: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="burst">Burst Limit</Label>
              <Input
                id="burst"
                type="number"
                value={limitsForm.burst}
                onChange={(e) => setLimitsForm({ ...limitsForm, burst: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label htmlFor="retention">Retention (days)</Label>
              <Input
                id="retention"
                type="number"
                value={limitsForm.retention_days}
                onChange={(e) => setLimitsForm({ ...limitsForm, retention_days: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label htmlFor="export">Daily Export (MB)</Label>
              <Input
                id="export"
                type="number"
                value={limitsForm.export_daily_mb}
                onChange={(e) => setLimitsForm({ ...limitsForm, export_daily_mb: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLimitsDialog(false)}>Cancel</Button>
            <Button onClick={handleUpdateLimits} disabled={loading}>
              {loading ? 'Updating...' : 'Update Limits'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* API Keys Dialog */}
      <Dialog open={showApiKeysDialog} onOpenChange={setShowApiKeysDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Keys</DialogTitle>
            <DialogDescription>Manage API keys for {selectedTenant?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="role">Role</Label>
              <Select value={apiKeyForm.role} onValueChange={(value) => setApiKeyForm({ ...apiKeyForm, role: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="analyst">Analyst</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApiKeysDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateApiKey} disabled={loading}>
              {loading ? 'Creating...' : 'Create API Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
