import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/Select';
import { TenantFilter } from '../components/TenantFilter';
import { useDashboard } from '../hooks/useDashboard';
import { DashboardFilters, AlertsOverTimeData, TopLogSourceData, RecentAlert } from '../types/api';
import { Activity, AlertTriangle, FileText, Zap, RefreshCw } from 'lucide-react';

const Dashboard: React.FC = () => {
  const [selectedTenant, setSelectedTenant] = useState<string>('');
  const [filters, setFilters] = useState<DashboardFilters>({
    limit: 10
  });
  
  // Combine filters with selected tenant
  const combinedFilters = {
    ...filters,
    tenant_id: selectedTenant || undefined
  };
  
  const { data, loading, error, refetch } = useDashboard(combinedFilters);

  const handleFilterChange = (key: keyof DashboardFilters, value: string | number) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div>No dashboard data available</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Security Dashboard</h1>
        <Button onClick={refetch} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Tenant Filter */}
       <Card title="Tenant Filter">
         <TenantFilter
           value={selectedTenant}
           onChange={(tenantId) => setSelectedTenant(tenantId || '')}
         />
       </Card>

      {/* Filters */}
      <Card title="Filters">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">From</label>
            <Input
              type="datetime-local"
              value={filters.from || ''}
              onChange={(e) => handleFilterChange('from', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">To</label>
            <Input
              type="datetime-local"
              value={filters.to || ''}
              onChange={(e) => handleFilterChange('to', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Severity</label>
            <Select value={filters.severity || 'all'} onValueChange={(value) => handleFilterChange('severity', value === 'all' ? '' : value)}>
              <SelectTrigger>
                <SelectValue placeholder="All severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Limit</label>
            <Input
              type="number"
              value={filters.limit || 10}
              onChange={(e) => handleFilterChange('limit', parseInt(e.target.value) || 10)}
              min="1"
              max="50"
            />
          </div>
        </div>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card title="Total Events (24h)">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold">{data.kpis?.total_events_24h?.toLocaleString() || '0'}</div>
          <p className="text-xs text-muted-foreground">
            Previous: {data.trends?.total_events_24h?.toLocaleString() || '0'}
          </p>
        </Card>

        <Card title="New Alerts (24h)">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold">{data.kpis?.new_alerts_24h?.toLocaleString() || '0'}</div>
          <p className="text-xs text-muted-foreground">
            Previous: {data.trends?.new_alerts_24h?.toLocaleString() || '0'}
          </p>
        </Card>

        <Card title="Cases Opened">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold">{data.kpis?.cases_opened?.toLocaleString() || '0'}</div>
          <p className="text-xs text-muted-foreground">
            Previous: {data.trends?.cases_opened?.toLocaleString() || '0'}
          </p>
        </Card>

        <Card title="EPS Live">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Zap className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold">{data.kpis?.eps_live?.toFixed(2) || '0.00'}</div>
          <p className="text-xs text-muted-foreground">Events per second</p>
        </Card>
      </div>

      {/* Charts and Data */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alerts Over Time */}
        <Card title="Alerts Over Time">
          <div className="space-y-2">
            {data.alerts_over_time?.map((item: AlertsOverTimeData, index: number) => (
              <div key={index} className="flex items-center justify-between p-2 border rounded">
                <span className="text-sm font-medium">{item.hour}</span>
                <div className="flex space-x-2">
                  <Badge className="bg-red-500">Critical: {item.critical || 0}</Badge>
                  <Badge className="bg-orange-500">High: {item.high || 0}</Badge>
                  <Badge className="bg-yellow-500">Medium: {item.medium || 0}</Badge>
                  <Badge className="bg-blue-500">Low: {item.low || 0}</Badge>
                </div>
              </div>
            )) || <div className="text-center text-gray-500">No alert data available</div>}
          </div>
        </Card>

        {/* Top Log Sources */}
        <Card title="Top Log Sources">
          <div className="space-y-2">
            {data.top_log_sources?.map((source: TopLogSourceData, index: number) => (
              <div key={index} className="flex items-center justify-between p-2 border rounded">
                <span className="text-sm font-medium">{source.source}</span>
                <Badge variant="outline">{source.count?.toLocaleString() || '0'}</Badge>
              </div>
            )) || <div className="text-center text-gray-500">No log source data available</div>}
          </div>
        </Card>
      </div>

      {/* Recent Alerts */}
      <Card title="Recent Alerts">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">ID</th>
                <th className="text-left p-2">Severity</th>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Timestamp</th>
                <th className="text-left p-2">Source IP</th>
                <th className="text-left p-2">Dest IP</th>
                <th className="text-left p-2">User</th>
                <th className="text-left p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_alerts?.length > 0 ? data.recent_alerts.map((alert: RecentAlert) => (
                <tr key={alert.id} className="border-b hover:bg-border">
                  <td className="p-2 font-mono text-sm">{alert.id}</td>
                  <td className="p-2">
                    <Badge className={getSeverityColor(alert.severity)}>
                      {alert.severity}
                    </Badge>
                  </td>
                  <td className="p-2">{alert.name}</td>
                  <td className="p-2 text-sm">{new Date(alert.timestamp).toLocaleString()}</td>
                  <td className="p-2 font-mono text-sm">{alert.source_ip || 'N/A'}</td>
                  <td className="p-2 font-mono text-sm">{alert.dest_ip || 'N/A'}</td>
                  <td className="p-2">{alert.user || 'N/A'}</td>
                  <td className="p-2">
                    <Badge variant="outline">{alert.status}</Badge>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-gray-500">
                    No recent alerts available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default Dashboard;