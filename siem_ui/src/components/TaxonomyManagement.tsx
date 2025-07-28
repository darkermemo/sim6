import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/Sheet';
import { Plus, Search, Edit, Trash2 } from 'lucide-react';
import {
  TaxonomyMapping,
  CreateTaxonomyMappingRequest,
  TaxonomyMappingListResponse,
} from '@/types/api';

interface TaxonomyManagementProps {
  userRole: string;
}

/**
 * TaxonomyManagement component for managing event taxonomy mappings.
 * 
 * Features:
 * - Create, update, and delete taxonomy mappings
 * - Map log source fields to standardized event categories
 * - Role-based access control (Admin/SuperAdmin only)
 * - Support for various event categories and outcomes
 * - Real-time mapping management
 * 
 * @param userRole - Current user's role for access control
 * @returns JSX element for taxonomy management interface
 */
const TaxonomyManagement: React.FC<TaxonomyManagementProps> = ({ userRole }) => {
  const [mappings, setMappings] = useState<TaxonomyMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [selectedMapping, setSelectedMapping] = useState<TaxonomyMapping | null>(null);
  const [formData, setFormData] = useState({
    source_type: '',
    field_to_check: '',
    value_to_match: '',
    event_category: 'Authentication' as 'Authentication' | 'Network' | 'Process' | 'File' | 'System' | 'Application' | 'Database',
    event_outcome: 'Success' as 'Success' | 'Failure' | 'Unknown',
    event_action: '',
  });

  // Check if user has Admin role
  const isAdmin = userRole === 'Admin' || userRole === 'SuperAdmin';

  useEffect(() => {
    if (isAdmin) {
      fetchMappings();
    } else {
      setError('Access denied. Admin role required.');
      setLoading(false);
    }
  }, [isAdmin]);

  /**
   * Fetches all taxonomy mappings from the backend API.
   * Handles authentication and error states.
   */
  const fetchMappings = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      const response = await fetch('/api/v1/taxonomy/mappings', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required');
        }
        throw new Error('Failed to fetch taxonomy mappings');
      }

      const data: TaxonomyMappingListResponse = await response.json();
      setMappings(data.mappings);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Creates a new taxonomy mapping for event categorization.
   * Maps log source fields to standardized event taxonomy.
   */
  const handleCreateMapping = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const createRequest: CreateTaxonomyMappingRequest = {
        source_type: formData.source_type,
        field_to_check: formData.field_to_check,
        value_to_match: formData.value_to_match,
        event_category: formData.event_category,
        event_outcome: formData.event_outcome,
        event_action: formData.event_action,
      };

      const response = await fetch('/api/v1/taxonomy/mappings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createRequest),
      });

      if (!response.ok) {
        throw new Error('Failed to create taxonomy mapping');
      }

      setIsCreateSheetOpen(false);
      resetForm();
      fetchMappings();
    } catch (err) {
      setError('Failed to create taxonomy mapping');
    }
  };

  /**
   * Updates an existing taxonomy mapping.
   * Modifies field-to-category mappings for event classification.
   */
  const handleUpdateMapping = async () => {
    if (!selectedMapping) return;

    try {
      const token = localStorage.getItem('token');
      const updateRequest: CreateTaxonomyMappingRequest = {
        source_type: formData.source_type,
        field_to_check: formData.field_to_check,
        value_to_match: formData.value_to_match,
        event_category: formData.event_category,
        event_outcome: formData.event_outcome,
        event_action: formData.event_action,
      };

      const response = await fetch(`/api/v1/taxonomy/mappings/${selectedMapping.mapping_id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateRequest),
      });

      if (!response.ok) {
        throw new Error('Failed to update taxonomy mapping');
      }

      setIsEditSheetOpen(false);
      setSelectedMapping(null);
      resetForm();
      fetchMappings();
    } catch (err) {
      setError('Failed to update taxonomy mapping');
    }
  };

  /**
   * Deletes a taxonomy mapping after user confirmation.
   * @param mappingId - Unique identifier of the mapping to delete
   */
  const handleDeleteMapping = async (mappingId: string) => {
    if (!confirm('Are you sure you want to delete this taxonomy mapping?')) {
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`/api/v1/taxonomy/mappings/${mappingId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete taxonomy mapping');
      }

      fetchMappings();
    } catch (err) {
      setError('Failed to delete taxonomy mapping');
    }
  };

  const openEditSheet = (mapping: TaxonomyMapping) => {
    setSelectedMapping(mapping);
    setFormData({
      source_type: mapping.source_type,
      field_to_check: mapping.field_to_check,
      value_to_match: mapping.value_to_match,
      event_category: mapping.event_category as 'Authentication' | 'Network' | 'Process' | 'File' | 'System' | 'Application' | 'Database',
      event_outcome: mapping.event_outcome as 'Success' | 'Failure' | 'Unknown',
      event_action: mapping.event_action,
    });
    setIsEditSheetOpen(true);
  };

  const resetForm = () => {
    setFormData({
      source_type: '',
      field_to_check: '',
      value_to_match: '',
      event_category: 'Authentication',
      event_outcome: 'Success',
      event_action: '',
    });
  };

  const getCategoryBadgeVariant = (category: string) => {
    switch (category) {
      case 'Authentication': return 'default';
      case 'Network': return 'secondary';
      case 'Process': return 'outline';
      case 'File': return 'critical';
      case 'System': return 'default';
      case 'Application': return 'secondary';
      case 'Database': return 'outline';
      default: return 'outline';
    }
  };

  const getOutcomeBadgeVariant = (outcome: string) => {
    switch (outcome) {
      case 'Success': return 'success';
      case 'Failure': return 'critical';
      case 'Unknown': return 'secondary';
      default: return 'outline';
    }
  };

  const filteredMappings = mappings.filter(mapping =>
    mapping.source_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    mapping.field_to_check.toLowerCase().includes(searchTerm.toLowerCase()) ||
    mapping.value_to_match.toLowerCase().includes(searchTerm.toLowerCase()) ||
    mapping.event_category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    mapping.event_action.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <Card className="p-6">
        <div className="text-center text-red-600">
          Access denied. Admin role required to manage taxonomy mappings.
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="text-center">Loading taxonomy mappings...</div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center text-red-600">{error}</div>
        <div className="text-center mt-4">
          <Button onClick={fetchMappings}>
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
          <h1 className="text-2xl font-semibold tracking-tight">Taxonomy Management</h1>
          <p className="text-muted-foreground">
            Manage event taxonomy mappings for standardized categorization
          </p>
        </div>
        <Button onClick={() => setIsCreateSheetOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Mapping
        </Button>
      </div>

      {/* Search */}
      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search mappings..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </Card>

      {/* Mappings List */}
      <Card className="p-6">
        <div className="space-y-4">
          {filteredMappings.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No taxonomy mappings found
            </div>
          ) : (
            filteredMappings.map((mapping) => (
              <div key={mapping.mapping_id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="font-medium">{mapping.source_type}</h3>
                    <Badge variant={getCategoryBadgeVariant(mapping.event_category)}>
                      {mapping.event_category}
                    </Badge>
                    <Badge variant={getOutcomeBadgeVariant(mapping.event_outcome)}>
                      {mapping.event_outcome}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Field:</strong> {mapping.field_to_check}</p>
                    <p><strong>Value:</strong> {mapping.value_to_match}</p>
                    <p><strong>Action:</strong> {mapping.event_action}</p>
                    <p><strong>Created:</strong> {new Date(mapping.created_at * 1000).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditSheet(mapping)}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteMapping(mapping.mapping_id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Create Mapping Sheet */}
      <Sheet open={isCreateSheetOpen} onOpenChange={setIsCreateSheetOpen}>
        <SheetContent className="w-[600px] sm:w-[600px]">
          <SheetHeader>
            <SheetTitle>Create Taxonomy Mapping</SheetTitle>
            <SheetDescription>
              Create a new taxonomy mapping rule for event categorization
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <label htmlFor="taxonomy-source-type" className="block text-sm font-medium mb-2">Source Type</label>
              <input
                id="taxonomy-source-type"
                type="text"
                value={formData.source_type}
                onChange={(e) => setFormData({ ...formData, source_type: e.target.value })}
                placeholder="e.g., apache, nginx, windows"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="taxonomy-field-check" className="block text-sm font-medium mb-2">Field to Check</label>
              <input
                id="taxonomy-field-check"
                type="text"
                value={formData.field_to_check}
                onChange={(e) => setFormData({ ...formData, field_to_check: e.target.value })}
                placeholder="e.g., status_code, event_id, action"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="taxonomy-value-match" className="block text-sm font-medium mb-2">Value to Match</label>
              <input
                id="taxonomy-value-match"
                type="text"
                value={formData.value_to_match}
                onChange={(e) => setFormData({ ...formData, value_to_match: e.target.value })}
                placeholder="e.g., 200, 4624, login"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="taxonomy-event-category" className="block text-sm font-medium mb-2">Event Category</label>
              <select
                id="taxonomy-event-category"
                value={formData.event_category}
                onChange={(e) => setFormData({ ...formData, event_category: e.target.value as 'Authentication' | 'Network' | 'Process' | 'File' | 'System' | 'Application' | 'Database' })}
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Authentication">Authentication</option>
                <option value="Network">Network</option>
                <option value="Process">Process</option>
                <option value="File">File</option>
                <option value="System">System</option>
                <option value="Application">Application</option>
                <option value="Database">Database</option>
              </select>
            </div>
            <div>
              <label htmlFor="taxonomy-event-outcome" className="block text-sm font-medium mb-2">Event Outcome</label>
              <select
                id="taxonomy-event-outcome"
                value={formData.event_outcome}
                onChange={(e) => setFormData({ ...formData, event_outcome: e.target.value as 'Success' | 'Failure' | 'Unknown' })}
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Success">Success</option>
                <option value="Failure">Failure</option>
                <option value="Unknown">Unknown</option>
              </select>
            </div>
            <div>
              <label htmlFor="taxonomy-event-action" className="block text-sm font-medium mb-2">Event Action</label>
              <input
                id="taxonomy-event-action"
                type="text"
                value={formData.event_action}
                onChange={(e) => setFormData({ ...formData, event_action: e.target.value })}
                placeholder="e.g., user_login, file_access, network_connection"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => { setIsCreateSheetOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button onClick={handleCreateMapping}>
                Create
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Mapping Sheet */}
      <Sheet open={isEditSheetOpen} onOpenChange={setIsEditSheetOpen}>
        <SheetContent className="w-[600px] sm:w-[600px]">
          <SheetHeader>
            <SheetTitle>Edit Taxonomy Mapping</SheetTitle>
            <SheetDescription>
              Update the taxonomy mapping rule
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <label className="block text-sm font-medium mb-2">Source Type</label>
              <input
                type="text"
                value={formData.source_type}
                onChange={(e) => setFormData({ ...formData, source_type: e.target.value })}
                placeholder="e.g., apache, nginx, windows"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Field to Check</label>
              <input
                type="text"
                value={formData.field_to_check}
                onChange={(e) => setFormData({ ...formData, field_to_check: e.target.value })}
                placeholder="e.g., status_code, event_id, action"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Value to Match</label>
              <input
                type="text"
                value={formData.value_to_match}
                onChange={(e) => setFormData({ ...formData, value_to_match: e.target.value })}
                placeholder="e.g., 200, 4624, login"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Event Category</label>
              <select
                value={formData.event_category}
                onChange={(e) => setFormData({ ...formData, event_category: e.target.value as 'Authentication' | 'Network' | 'Process' | 'File' | 'System' | 'Application' | 'Database' })}
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Authentication">Authentication</option>
                <option value="Network">Network</option>
                <option value="Process">Process</option>
                <option value="File">File</option>
                <option value="System">System</option>
                <option value="Application">Application</option>
                <option value="Database">Database</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Event Outcome</label>
              <select
                value={formData.event_outcome}
                onChange={(e) => setFormData({ ...formData, event_outcome: e.target.value as 'Success' | 'Failure' | 'Unknown' })}
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Success">Success</option>
                <option value="Failure">Failure</option>
                <option value="Unknown">Unknown</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Event Action</label>
              <input
                type="text"
                value={formData.event_action}
                onChange={(e) => setFormData({ ...formData, event_action: e.target.value })}
                placeholder="e.g., user_login, file_access, network_connection"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => { setIsEditSheetOpen(false); setSelectedMapping(null); resetForm(); }}>
                Cancel
              </Button>
              <Button onClick={handleUpdateMapping}>
                Update
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default TaxonomyManagement;