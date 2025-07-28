import React, { useState } from 'react';
import { useAlerts } from '../hooks/useAlerts';
import { useUiStore } from '../stores/uiStore';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { AlertTriangle, Eye } from 'lucide-react';
import type { Alert } from '../types/api';

const Alerts: React.FC = () => {
  const { alerts, loading, error, refetch } = useAlerts();
  const { openAlertDrawer } = useUiStore();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
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
      case 'investigating':
        return 'bg-yellow-100 text-yellow-800';
      case 'resolved':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredAlerts = alerts.filter((alert: Alert) => {
    const matchesStatus = statusFilter === 'all' || alert.status.toLowerCase() === statusFilter;
    const matchesSeverity = severityFilter === 'all' || alert.severity.toLowerCase() === severityFilter;
    const matchesSearch = searchTerm === '' || 
      alert.rule_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alert.alert_id.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesStatus && matchesSeverity && matchesSearch;
  });

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading alerts...</div>
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
          <AlertTriangle className="h-8 w-8" />
          Alerts
        </h1>
        <Button onClick={refetch}>
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card title="Filters">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Search</label>
            <Input
              type="text"
              placeholder="Search alerts..."
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
              <option value="investigating">Investigating</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Severity</label>
            <Select
              value={severityFilter}
              onValueChange={(value) => setSeverityFilter(value)}
            >
              <option value="all">All Severities</option>
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
                setSeverityFilter('all');
              }}
              variant="outline"
            >
              Clear Filters
            </Button>
          </div>
        </div>
      </Card>

      {/* Alerts Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card title="Total Alerts">
          <div className="text-2xl font-bold">{alerts.length}</div>
        </Card>
        <Card title="Critical">
          <div className="text-2xl font-bold text-red-600">
            {alerts.filter(a => a.severity.toLowerCase() === 'critical').length}
          </div>
        </Card>
        <Card title="High">
          <div className="text-2xl font-bold text-orange-600">
            {alerts.filter(a => a.severity.toLowerCase() === 'high').length}
          </div>
        </Card>
        <Card title="Open">
          <div className="text-2xl font-bold text-blue-600">
            {alerts.filter(a => a.status.toLowerCase() === 'open').length}
          </div>
        </Card>
      </div>

      {/* Alerts Table */}
      <Card title={`Alerts (${filteredAlerts.length})`}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Alert ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rule Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Severity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {filteredAlerts.map((alert) => (
                <tr key={alert.alert_id} className="hover:bg-border">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                    {alert.alert_id ? alert.alert_id.substring(0, 8) + '...' : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {alert.rule_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge className={getSeverityColor(alert.severity)}>
                      {alert.severity}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge className={getStatusColor(alert.status)}>
                      {alert.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(alert.alert_timestamp * 1000).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Button
                      size="sm"
                      onClick={() => openAlertDrawer(alert.alert_id)}
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
          
          {filteredAlerts.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No alerts found matching the current filters.
            </div>
          )}
        </div>
      </Card>

      {/* Alert details are handled by the global AlertDetailDrawer component */}
    </div>
  );
};



export default Alerts;