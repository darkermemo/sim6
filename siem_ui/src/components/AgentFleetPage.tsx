import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/DataTable';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/Sheet';
import { 
  Download, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Eye, 
  Settings, 
  Trash2,
  Circle,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';

interface FleetAgent {
  asset_id: string;
  asset_name: string;
  asset_ip: string;
  status: string;
  last_seen: number;
  agent_version: string;
  policy_name: string;
  metrics: {
    cpu_usage_percent: number;
    memory_usage_mb: number;
    logs_in_buffer: number;
  };
}

interface AgentFleetPageProps {
  userRole: string;
  onNavigate?: (page: string, params?: string) => void;
}

const AgentFleetPage: React.FC<AgentFleetPageProps> = ({ userRole, onNavigate }) => {
  const [agents, setAgents] = useState<FleetAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isDownloadSheetOpen, setIsDownloadSheetOpen] = useState(false);
  const [isAssignPolicyOpen, setIsAssignPolicyOpen] = useState(false);
  const [isDecommissionDialogOpen, setIsDecommissionDialogOpen] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<FleetAgent | null>(null);
  const [selectedOS, setSelectedOS] = useState<string>('');
  const [selectedArch, setSelectedArch] = useState<string>('');
  const [policies, setPolicies] = useState<any[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('');

  // Check if user has Admin role
  const isAdmin = userRole === 'Admin' || userRole === 'SuperAdmin';

  useEffect(() => {
    if (isAdmin) {
      fetchFleetStatus();
      fetchPolicies();
      // Set up polling for real-time updates
      const interval = setInterval(fetchFleetStatus, 30000); // Poll every 30 seconds
      return () => clearInterval(interval);
    } else {
      setError('Access denied. Admin role required.');
      setLoading(false);
    }
  }, [isAdmin]);

  const fetchFleetStatus = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch('/api/v1/agents/fleet', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required');
        }
        throw new Error('Failed to fetch fleet status');
      }

      const data = await response.json();
      setAgents(data.agents || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchPolicies = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch('/api/v1/agents/policies', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPolicies(data.policies || []);
      }
    } catch (err) {
      console.error('Failed to fetch policies:', err);
    }
  };

  const handleDownloadAgent = async () => {
    if (!selectedOS || !selectedArch) {
      setError('Please select both OS and architecture');
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`/api/v1/agents/download?os=${selectedOS}&arch=${selectedArch}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to download agent');
      }

      // Create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `siem-agent-${selectedOS}-${selectedArch}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setIsDownloadSheetOpen(false);
      setSelectedOS('');
      setSelectedArch('');
    } catch (err) {
      setError('Failed to download agent');
    }
  };

  const handleAssignPolicy = async () => {
    if (!selectedAgent || !selectedPolicyId) {
      setError('Please select a policy');
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch('/api/v1/agents/assignments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          asset_id: selectedAgent.asset_id,
          policy_id: selectedPolicyId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to assign policy');
      }

      setIsAssignPolicyOpen(false);
      setSelectedAgent(null);
      setSelectedPolicyId('');
      fetchFleetStatus(); // Refresh the list
    } catch (err) {
      setError('Failed to assign policy');
    }
  };

  const handleDecommissionAgent = async () => {
    if (!selectedAgent) return;

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`/api/v1/agents/${selectedAgent.asset_id}/decommission`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to decommission agent');
      }

      setIsDecommissionDialogOpen(false);
      setSelectedAgent(null);
      fetchFleetStatus(); // Refresh the list
    } catch (err) {
      setError('Failed to decommission agent');
    }
  };

  const handleViewLogs = (agent: FleetAgent) => {
    // Navigate to log activity page with pre-filled filter
    if (onNavigate) {
      onNavigate('events', `source_ip=${agent.asset_ip}`);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'online':
        return <Circle className="h-3 w-3 fill-green-500 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="h-3 w-3 fill-yellow-500 text-yellow-500" />;
      case 'offline':
        return <Circle className="h-3 w-3 fill-red-500 text-red-500" />;
      default:
        return <Circle className="h-3 w-3 fill-gray-500 text-gray-500" />;
    }
  };

  const formatLastSeen = (timestamp: number) => {
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    
    if (diff < 60) {
      return 'Just now';
    } else if (diff < 3600) {
      const minutes = Math.floor(diff / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else if (diff < 86400) {
      const hours = Math.floor(diff / 3600);
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else {
      const days = Math.floor(diff / 86400);
      return `${days} day${days > 1 ? 's' : ''} ago`;
    }
  };

  const filteredAgents = agents.filter(agent => {
    const matchesSearch = 
      agent.asset_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.asset_ip.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || 
      agent.status.toLowerCase() === statusFilter.toLowerCase();
    
    return matchesSearch && matchesStatus;
  });

  const columns = [
    {
      key: 'status',
      label: 'Status',
      render: (value: string, row: FleetAgent) => (
        <div className="flex items-center space-x-2">
          {getStatusIcon(row.status)}
          <span className="text-sm">{row.status}</span>
        </div>
      ),
    },
    {
      key: 'asset_name',
      label: 'Asset Name / IP',
      render: (value: string, row: FleetAgent) => (
        <div>
          <div className="font-medium">{row.asset_name}</div>
          <div className="text-sm text-muted-foreground">{row.asset_ip}</div>
        </div>
      ),
    },
    {
      key: 'last_seen',
      label: 'Last Seen',
      render: (value: number, row: FleetAgent) => (
        <span className="text-sm">{formatLastSeen(row.last_seen)}</span>
      ),
    },
    {
      key: 'agent_version',
      label: 'Agent Version',
      render: (value: string, row: FleetAgent) => (
        <span className="text-sm font-mono">{row.agent_version}</span>
      ),
    },
    {
      key: 'policy_name',
      label: 'Policy',
      render: (value: string, row: FleetAgent) => (
        <span className="text-sm">{row.policy_name || 'None'}</span>
      ),
    },
    {
      key: 'metrics',
      label: 'Buffer Size',
      render: (value: any, row: FleetAgent) => (
        <span className="text-sm">{row.metrics?.logs_in_buffer || 0} logs</span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (value: any, row: FleetAgent) => (
        <div className="relative">
          <Button 
            variant="ghost" 
            className="h-8 w-8 p-0"
            onClick={() => setShowActionsMenu(showActionsMenu === row.asset_id ? null : row.asset_id)}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          {showActionsMenu === row.asset_id && (
            <div className="absolute right-0 top-8 z-50 min-w-[160px] bg-card border border-border rounded-md shadow-lg">
              <div className="py-1">
                <button
                  className="flex items-center w-full px-4 py-2 text-sm text-primary-text hover:bg-border"
                  onClick={() => {
                    handleViewLogs(row);
                    setShowActionsMenu(null);
                  }}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  View Logs
                </button>
                <button
                  className="flex items-center w-full px-4 py-2 text-sm text-primary-text hover:bg-border"
                  onClick={() => {
                    setSelectedAgent(row);
                    setIsAssignPolicyOpen(true);
                    setShowActionsMenu(null);
                  }}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Assign Policy
                </button>
                <button
                  className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-border"
                  onClick={() => {
                    setSelectedAgent(row);
                    setIsDecommissionDialogOpen(true);
                    setShowActionsMenu(null);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Decommission Agent
                </button>
              </div>
            </div>
          )}
        </div>
      ),
    },
  ];

  if (!isAdmin) {
    return (
      <Card className="p-6">
        <div className="text-center text-red-600">
          Access denied. Admin role required to view agent fleet.
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="text-center">Loading agent fleet...</div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center text-red-600">{error}</div>
        <div className="text-center mt-4">
          <Button onClick={fetchFleetStatus}>
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
          <h1 className="text-2xl font-semibold tracking-tight">Agent Fleet Management</h1>
          <p className="text-muted-foreground">
            Monitor and manage your deployed SIEM agents
          </p>
        </div>
        <Button onClick={() => setIsDownloadSheetOpen(true)}>
          <Download className="h-4 w-4 mr-2" />
          Download Agent
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center space-x-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by asset name or IP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="degraded">Degraded</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Agent Fleet Table */}
      <Card className="p-6">
        <DataTable
          columns={columns}
          data={filteredAgents}
        />
      </Card>

      {/* Download Agent Sheet */}
      <Sheet open={isDownloadSheetOpen} onOpenChange={setIsDownloadSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Download Agent</SheetTitle>
            <SheetDescription>
              Select the operating system and architecture for the agent binary
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <label className="block text-sm font-medium mb-2">Operating System</label>
              <Select value={selectedOS} onValueChange={setSelectedOS}>
                <SelectTrigger>
                  <SelectValue placeholder="Select OS" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="linux">Linux</SelectItem>
                  <SelectItem value="windows">Windows</SelectItem>
                  <SelectItem value="darwin">macOS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Architecture</label>
              <Select value={selectedArch} onValueChange={setSelectedArch}>
                <SelectTrigger>
                  <SelectValue placeholder="Select architecture" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="x86_64">x86_64</SelectItem>
                  <SelectItem value="arm64">ARM64</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setIsDownloadSheetOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleDownloadAgent}>
                Download
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Assign Policy Sheet */}
      <Sheet open={isAssignPolicyOpen} onOpenChange={setIsAssignPolicyOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Assign Policy</SheetTitle>
            <SheetDescription>
              Assign a configuration policy to {selectedAgent?.asset_name}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <label className="block text-sm font-medium mb-2">Policy</label>
              <Select value={selectedPolicyId} onValueChange={setSelectedPolicyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select policy" />
                </SelectTrigger>
                <SelectContent>
                  {policies.map((policy) => (
                    <SelectItem key={policy.policy_id} value={policy.policy_id}>
                      {policy.policy_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setIsAssignPolicyOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAssignPolicy}>
                Assign
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Decommission Confirmation Modal */}
      {isDecommissionDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Decommission Agent</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to decommission the agent on {selectedAgent?.asset_name}? 
              This will mark the agent for removal and it will self-destruct on its next heartbeat.
            </p>
            <div className="flex justify-end space-x-3">
              <Button variant="outline" onClick={() => setIsDecommissionDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={handleDecommissionAgent}
              >
                Decommission
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentFleetPage;