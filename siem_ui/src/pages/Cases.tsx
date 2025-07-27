import React, { useState } from 'react';
import { useCases, useCaseDetail } from '../hooks/useCases';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { FileText, Plus, Eye, User, Clock, AlertTriangle } from 'lucide-react';
import type { Case, CreateCaseRequest } from '../types/api';

const Cases: React.FC = () => {
  const { cases, loading, error, createCase, refetch } = useCases();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'critical':
        return 'bg-red-500 text-white';
      case 'high':
        return 'bg-orange-500 text-white';
      case 'medium':
        return 'bg-yellow-500 text-black';
      case 'low':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'open':
        return 'bg-red-100 text-red-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'resolved':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Ensure cases is always an array to prevent filter errors
  const safeCases = Array.isArray(cases) ? cases : [];
  
  const filteredCases = safeCases.filter((caseItem: Case) => {
    const matchesStatus = statusFilter === 'all' || caseItem.status.toLowerCase() === statusFilter;
    const matchesPriority = priorityFilter === 'all' || caseItem.priority.toLowerCase() === priorityFilter;
    const matchesSearch = searchTerm === '' || 
      caseItem.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      caseItem.case_id.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesStatus && matchesPriority && matchesSearch;
  });

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading cases...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card title="Error">
          <div className="text-red-600">{error}</div>
          <Button onClick={refetch} className="mt-4">
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileText className="h-8 w-8" />
          Cases
        </h1>
        <div className="flex gap-2">
          <Button onClick={refetch} variant="outline">
            Refresh
          </Button>
          <Button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Case
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card title="Filters">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Search</label>
            <Input
              type="text"
              placeholder="Search cases..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value)}
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Priority</label>
            <Select
              value={priorityFilter}
              onValueChange={(value) => setPriorityFilter(value)}
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
          </div>
          <div className="flex items-end">
            <Button 
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setPriorityFilter('all');
              }}
              variant="outline"
            >
              Clear Filters
            </Button>
          </div>
        </div>
      </Card>

      {/* Cases Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card title="Total Cases">
          <div className="text-2xl font-bold">{safeCases.length}</div>
        </Card>
        <Card title="Critical">
          <div className="text-2xl font-bold text-red-600">
            {safeCases.filter(c => c.priority.toLowerCase() === 'critical').length}
          </div>
        </Card>
        <Card title="High">
          <div className="text-2xl font-bold text-orange-600">
            {safeCases.filter(c => c.priority.toLowerCase() === 'high').length}
          </div>
        </Card>
        <Card title="Open">
          <div className="text-2xl font-bold text-blue-600">
            {safeCases.filter(c => c.status.toLowerCase() === 'open').length}
          </div>
        </Card>
      </div>

      {/* Cases Table */}
      <Card title={`Cases (${filteredCases.length})`}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Case ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assigned To
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {filteredCases.map((caseItem) => (
                <tr key={caseItem.case_id} className="hover:bg-border">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                    {caseItem.case_id.substring(0, 8)}...
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {caseItem.title}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge className={getPriorityColor(caseItem.priority)}>
                      {caseItem.priority}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge className={getStatusColor(caseItem.status)}>
                      {caseItem.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      {caseItem.assigned_to || 'Unassigned'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {new Date(caseItem.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Button
                      size="sm"
                      onClick={() => setSelectedCaseId(caseItem.case_id)}
                      className="flex items-center gap-1"
                    >
                      <Eye className="h-4 w-4" />
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {filteredCases.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No cases found matching the current filters.
            </div>
          )}
        </div>
      </Card>

      {/* Create Case Modal */}
      {showCreateModal && (
        <CreateCaseModal 
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            refetch();
          }}
          createCase={createCase}
        />
      )}

      {/* Case Detail Modal */}
      {selectedCaseId && (
        <CaseDetailPanel 
          caseId={selectedCaseId} 
          onClose={() => setSelectedCaseId(null)}
        />
      )}
    </div>
  );
};

// Create Case Modal Component
interface CreateCaseModalProps {
  onClose: () => void;
  onSuccess: () => void;
  createCase: (caseData: CreateCaseRequest) => Promise<any>;
}

const CreateCaseModal: React.FC<CreateCaseModalProps> = ({ onClose, onSuccess, createCase }) => {
  const [formData, setFormData] = useState<CreateCaseRequest>({
    title: '',
    description: '',
    priority: 'Medium',
    alert_ids: [],
  });
  const [alertIds, setAlertIds] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const caseData = {
        ...formData,
        alert_ids: alertIds.split(',').map(id => id.trim()).filter(id => id.length > 0),
      };

      const result = await createCase(caseData);
      if (result) {
        onSuccess();
      } else {
        setError('Failed to create case');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create case');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Create New Case</h2>
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title *</label>
              <Input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Enter case title..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter case description..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Priority *</label>
              <Select
                required
                value={formData.priority}
                onValueChange={(value) => setFormData({ ...formData, priority: value })}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Alert IDs</label>
              <Input
                type="text"
                value={alertIds}
                onChange={(e) => setAlertIds(e.target.value)}
                placeholder="Enter alert IDs separated by commas..."
              />
              <p className="text-sm text-gray-500 mt-1">
                Enter alert IDs separated by commas (optional)
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" onClick={onClose} variant="outline">
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Case'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// Case Detail Panel Component
interface CaseDetailPanelProps {
  caseId: string;
  onClose: () => void;
}

const CaseDetailPanel: React.FC<CaseDetailPanelProps> = ({ caseId, onClose }) => {
  const { caseDetail, loading, error, updateCase } = useCaseDetail(caseId);
  const [newStatus, setNewStatus] = useState<string>('');
  const [newAssignee, setNewAssignee] = useState<string>('');

  const handleStatusUpdate = async () => {
    if (newStatus && await updateCase({ status: newStatus })) {
      setNewStatus('');
    }
  };

  const handleAssigneeUpdate = async () => {
    if (await updateCase({ assigned_to: newAssignee || undefined })) {
      setNewAssignee('');
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-card p-6 rounded-lg">
          <div className="text-lg">Loading case details...</div>
        </div>
      </div>
    );
  }

  if (error || !caseDetail) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-card p-6 rounded-lg max-w-md">
          <div className="text-red-600 mb-4">{error || 'Case not found'}</div>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Case Details</h2>
            <Button onClick={onClose} variant="outline">
              Close
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Info */}
            <Card title="Basic Information">
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-500">Case ID</label>
                  <div className="font-mono text-sm">{caseDetail.case_id}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Title</label>
                  <div className="font-medium">{caseDetail.title}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Description</label>
                  <div className="text-sm">{caseDetail.description || 'No description'}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Priority</label>
                  <div>
                    <Badge className={`inline-block ${
                      caseDetail.priority.toLowerCase() === 'critical' ? 'bg-red-500 text-white' :
                      caseDetail.priority.toLowerCase() === 'high' ? 'bg-orange-500 text-white' :
                      caseDetail.priority.toLowerCase() === 'medium' ? 'bg-yellow-500 text-black' :
                      'bg-blue-500 text-white'
                    }`}>
                      {caseDetail.priority}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <div>
                    <Badge className={`inline-block ${
                      caseDetail.status.toLowerCase() === 'open' ? 'bg-red-100 text-red-800' :
                      caseDetail.status.toLowerCase() === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                      caseDetail.status.toLowerCase() === 'resolved' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {caseDetail.status}
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>

            {/* Assignment & Timeline */}
            <Card title="Assignment & Timeline">
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-500">Assigned To</label>
                  <div className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    {caseDetail.assigned_to || 'Unassigned'}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Created By</label>
                  <div className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    {caseDetail.created_by}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Created At</label>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {new Date(caseDetail.created_at).toLocaleString()}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Updated At</label>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {new Date(caseDetail.updated_at).toLocaleString()}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Related Alerts */}
          {caseDetail.alert_ids.length > 0 && (
            <Card title="Related Alerts" className="mt-6">
              <div className="space-y-2">
                {caseDetail.alert_ids.map((alertId, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    <span className="font-mono text-sm">{alertId}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Related Assets */}
          {caseDetail.related_assets.length > 0 && (
            <Card title="Related Assets" className="mt-6">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Criticality</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {caseDetail.related_assets.map((asset) => (
                      <tr key={asset.asset_id}>
                        <td className="px-4 py-2 text-sm">{asset.asset_name}</td>
                        <td className="px-4 py-2 text-sm font-mono">{asset.asset_ip}</td>
                        <td className="px-4 py-2 text-sm">{asset.asset_type}</td>
                        <td className="px-4 py-2 text-sm">
                          <Badge variant="outline">{asset.criticality}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Actions */}
          <Card title="Actions" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Update Status</label>
                <div className="flex gap-2">
                  <Select
                    value={newStatus}
                    onValueChange={(value) => setNewStatus(value)}
                  >
                    <option value="">Select status...</option>
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </Select>
                  <Button onClick={handleStatusUpdate} disabled={!newStatus}>
                    Update
                  </Button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Assign To</label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="User ID..."
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                  />
                  <Button onClick={handleAssigneeUpdate}>
                    Assign
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Cases;