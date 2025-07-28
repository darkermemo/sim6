import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/Sheet';
import { Plus, Search, Edit, Users } from 'lucide-react';
import {
  PolicyResponse,
  CreatePolicyRequest,
  UpdatePolicyRequest,
  PolicyListResponse,
  AssignPolicyRequest,
} from '@/types/api';

interface AgentManagementProps {
  userRole: string;
}

/**
 * AgentManagement component for managing SIEM agent policies and assignments.
 * 
 * Features:
 * - Create, update, and manage agent policies
 * - Assign policies to specific agents
 * - Role-based access control (Admin/SuperAdmin only)
 * - JSON configuration validation
 * - Real-time policy management
 * 
 * @param userRole - Current user's role for access control
 * @returns JSX element for agent management interface
 */
const AgentManagement: React.FC<AgentManagementProps> = ({ userRole }) => {
  const [policies, setPolicies] = useState<PolicyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [isAssignSheetOpen, setIsAssignSheetOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyResponse | null>(null);
  const [formData, setFormData] = useState({
    policy_name: '',
    config_json: '{}',
  });
  const [assignData, setAssignData] = useState({
    asset_id: '',
    policy_id: '',
  });

  // Check if user has Admin role
  const isAdmin = userRole === 'Admin' || userRole === 'SuperAdmin';

  useEffect(() => {
    if (isAdmin) {
      fetchPolicies();
    } else {
      setError('Access denied. Admin role required.');
      setLoading(false);
    }
  }, [isAdmin]);

  /**
   * Fetches all agent policies from the backend API.
   * Handles authentication and error states.
   */
  const fetchPolicies = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      const response = await fetch('/api/v1/agents/policies', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required');
        }
        throw new Error('Failed to fetch policies');
      }

      const data: PolicyListResponse = await response.json();
      setPolicies(data.policies);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Creates a new agent policy with JSON configuration validation.
   * Validates JSON format before sending to backend.
   */
  const handleCreatePolicy = async () => {
    try {
      // Validate JSON
      JSON.parse(formData.config_json);
      
      const token = localStorage.getItem('access_token');
      const createRequest: CreatePolicyRequest = {
        policy_name: formData.policy_name,
        config_json: formData.config_json,
      };

      const response = await fetch('/api/v1/agents/policies', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createRequest),
      });

      if (!response.ok) {
        throw new Error('Failed to create policy');
      }

      setIsCreateSheetOpen(false);
      setFormData({ policy_name: '', config_json: '{}' });
      fetchPolicies();
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON configuration');
      } else {
        setError('Failed to create policy');
      }
    }
  };

  /**
   * Updates an existing agent policy.
   * Validates JSON configuration and handles authentication.
   */
  const handleUpdatePolicy = async () => {
    if (!selectedPolicy) return;

    try {
      // Validate JSON
      JSON.parse(formData.config_json);
      
      const token = localStorage.getItem('token');
      const updateRequest: UpdatePolicyRequest = {
        policy_name: formData.policy_name,
        config_json: formData.config_json,
      };

      const response = await fetch(`/api/v1/agents/policies/${selectedPolicy.policy_id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateRequest),
      });

      if (!response.ok) {
        throw new Error('Failed to update policy');
      }

      setIsEditSheetOpen(false);
      setSelectedPolicy(null);
      setFormData({ policy_name: '', config_json: '{}' });
      fetchPolicies();
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON configuration');
      } else {
        setError('Failed to update policy');
      }
    }
  };

  /**
   * Assigns a policy to a specific agent asset.
   * Links policy configuration to agent for enforcement.
   */
  const handleAssignPolicy = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const assignRequest: AssignPolicyRequest = {
        asset_id: assignData.asset_id,
        policy_id: assignData.policy_id,
      };

      const response = await fetch('/api/v1/agents/assignments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(assignRequest),
      });

      if (!response.ok) {
        throw new Error('Failed to assign policy');
      }

      setIsAssignSheetOpen(false);
      setAssignData({ asset_id: '', policy_id: '' });
    } catch (err) {
      setError('Failed to assign policy');
    }
  };

  const openEditSheet = (policy: PolicyResponse) => {
    setSelectedPolicy(policy);
    setFormData({
      policy_name: policy.policy_name,
      config_json: policy.config_json,
    });
    setIsEditSheetOpen(true);
  };

  const openAssignSheet = (policy: PolicyResponse) => {
    setAssignData({ ...assignData, policy_id: policy.policy_id });
    setIsAssignSheetOpen(true);
  };

  const filteredPolicies = policies.filter(policy =>
    policy.policy_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <Card className="p-6">
        <div className="text-center text-red-600">
          Access denied. Admin role required to manage agents and policies.
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="text-center">Loading policies...</div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center text-red-600">{error}</div>
        <div className="text-center mt-4">
          <Button onClick={fetchPolicies}>
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
          <h1 className="text-2xl font-semibold tracking-tight">Agent & Policy Management</h1>
          <p className="text-muted-foreground">
            Manage agent configuration policies and assignments
          </p>
        </div>
        <Button onClick={() => setIsCreateSheetOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Policy
        </Button>
      </div>

      {/* Search */}
      <Card className="p-4">
        <div className="relative">
          <label htmlFor="policy-search" className="sr-only">Search policies</label>
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            id="policy-search"
            placeholder="Search policies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </Card>

      {/* Policies List */}
      <Card className="p-6">
        <div className="space-y-4">
          {filteredPolicies.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No policies found
            </div>
          ) : (
            filteredPolicies.map((policy) => (
              <div key={policy.policy_id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <h3 className="font-medium">{policy.policy_name}</h3>
                  <p className="text-sm text-muted-foreground">
                    Created: {new Date(policy.created_at * 1000).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Last Updated: {new Date(policy.updated_at * 1000).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openAssignSheet(policy)}
                  >
                    <Users className="h-4 w-4 mr-1" />
                    Assign
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditSheet(policy)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Create Policy Sheet */}
      <Sheet open={isCreateSheetOpen} onOpenChange={setIsCreateSheetOpen}>
        <SheetContent className="w-[600px] sm:w-[600px]">
          <SheetHeader>
            <SheetTitle>Create New Policy</SheetTitle>
            <SheetDescription>
              Create a new agent configuration policy
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <label htmlFor="create-policy-name" className="block text-sm font-medium mb-2">Policy Name</label>
              <input
                type="text"
                id="create-policy-name"
                value={formData.policy_name}
                onChange={(e) => setFormData({ ...formData, policy_name: e.target.value })}
                placeholder="Enter policy name"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="create-config-json" className="block text-sm font-medium mb-2">Configuration JSON</label>
              <textarea
                id="create-config-json"
                value={formData.config_json}
                onChange={(e) => setFormData({ ...formData, config_json: e.target.value })}
                placeholder="Enter JSON configuration"
                rows={10}
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setIsCreateSheetOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreatePolicy}>
                Create
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Policy Sheet */}
      <Sheet open={isEditSheetOpen} onOpenChange={setIsEditSheetOpen}>
        <SheetContent className="w-[600px] sm:w-[600px]">
          <SheetHeader>
            <SheetTitle>Edit Policy</SheetTitle>
            <SheetDescription>
              Update policy configuration
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <label htmlFor="edit-policy-name" className="block text-sm font-medium mb-2">Policy Name</label>
              <input
                type="text"
                id="edit-policy-name"
                value={formData.policy_name}
                onChange={(e) => setFormData({ ...formData, policy_name: e.target.value })}
                placeholder="Enter policy name"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="edit-config-json" className="block text-sm font-medium mb-2">Configuration JSON</label>
              <textarea
                id="edit-config-json"
                value={formData.config_json}
                onChange={(e) => setFormData({ ...formData, config_json: e.target.value })}
                placeholder="Enter JSON configuration"
                rows={10}
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setIsEditSheetOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdatePolicy}>
                Update
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Assign Policy Sheet */}
      <Sheet open={isAssignSheetOpen} onOpenChange={setIsAssignSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Assign Policy</SheetTitle>
            <SheetDescription>
              Assign policy to an agent
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <label htmlFor="assign-asset-id" className="block text-sm font-medium mb-2">Asset ID</label>
              <input
                type="text"
                id="assign-asset-id"
                value={assignData.asset_id}
                onChange={(e) => setAssignData({ ...assignData, asset_id: e.target.value })}
                placeholder="Enter agent ID"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="assign-policy-id" className="block text-sm font-medium mb-2">Policy ID</label>
              <input
                type="text"
                id="assign-policy-id"
                value={assignData.policy_id}
                onChange={(e) => setAssignData({ ...assignData, policy_id: e.target.value })}
                placeholder="Policy ID"
                disabled
                className="w-full px-3 py-2 border border-border rounded-md bg-gray-50 text-gray-500"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setIsAssignSheetOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAssignPolicy}>
                Assign
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default AgentManagement;