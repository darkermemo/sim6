import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Search, Filter, Server, Globe, Monitor, FileCode, Users, BarChart3, Activity, Edit, Eye, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/Sheet';
import { useToast } from '@/hooks/useToast';
import { stopPropagation } from '@/lib/dom';
import { logSourceApi } from '@/services/api';
import type { LogSource, LogSourceFilters } from '@/types/api';

// Mock types for enhanced features until API is implemented
interface LogSourceGroup {
  group_id: string;
  name: string;
  description: string;
  log_source_ids: string[];
  tenant_id: string;
  created_at: number;
  updated_at: number;
}

interface LogSourceStats {
  log_source_id: string;
  name: string;
  status: string;
  eps: number;
  event_count: number;
  last_seen: string;
  daily_events: number;
  parse_failures: number;
  parse_partials: number;
}

interface LogSourceOverallStats {
  total_sources: number;
  active_sources: number;
  degraded_sources: number;
  inactive_sources: number;
  total_eps: number;
  total_events_today: number;
  parsing_success_rate: number;
  avg_latency_ms: number;
}

/**
 * Enhanced Log Source Management Interface
 * 
 * Features:
 * - Manage individual log sources and groups
 * - View real-time statistics and activity
 * - Enhanced parsing status tracking
 * - Group-based organization
 * - Activity monitoring and EPS tracking
 */
export function EnhancedLogSourceManagement() {
  const { toast } = useToast();
  
  // State management
  const [activeTab, setActiveTab] = useState<'sources' | 'groups' | 'stats'>('sources');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<LogSource | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<LogSourceGroup | null>(null);
  const [isCreateSourceOpen, setIsCreateSourceOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // State for API data
  const [logSources, setLogSources] = useState<LogSource[]>([]);
  const [logSourceGroups, setLogSourceGroups] = useState<LogSourceGroup[]>([]);
  const [stats, setStats] = useState<LogSourceStats[]>([]);
  const [overallStats, setOverallStats] = useState<LogSourceOverallStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load data on component mount
  useEffect(() => {
    loadAllData();
  }, []);

  /**
   * Load all data from API
   */
  const loadAllData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Use basic log sources API since enhanced endpoints are not available
      const sourcesRes = await logSourceApi.getLogSources();
      
      // Extract log sources array from response
      const logSourcesArray = sourcesRes.log_sources || [];
      setLogSources(logSourcesArray);
      
      // Mock groups and stats data until enhanced API is implemented
      const mockGroups: LogSourceGroup[] = [];
      const mockStats: LogSourceStats[] = logSourcesArray.map((source: LogSource) => ({
        log_source_id: source.id,
        name: source.name,
        status: source.status || 'active',
        eps: source.eps || 0,
        event_count: source.event_count || 0,
        last_seen: new Date().toISOString(),
        daily_events: 0,
        parse_failures: 0,
        parse_partials: 0
      }));
      
      setLogSourceGroups(mockGroups);
      setStats(mockStats);
      
      // Calculate overall stats from mock stats data
      const totalSources = mockStats.length || 0;
      const activeSources = mockStats.filter(s => s.status === 'active').length || 0;
      const degradedSources = mockStats.filter(s => s.status === 'degraded').length || 0;
      const inactiveSources = mockStats.filter(s => s.status === 'inactive').length || 0;
      const totalEps = mockStats.reduce((sum, s) => sum + s.eps, 0) || 0;
      const totalEventsToday = mockStats.reduce((sum, s) => sum + s.daily_events, 0) || 0;
      const totalParseFailures = mockStats.reduce((sum, s) => sum + s.parse_failures, 0) || 0;
      const totalEvents = mockStats.reduce((sum, s) => sum + s.daily_events + s.parse_failures, 0) || 1;
      const parsingSuccessRate = ((totalEvents - totalParseFailures) / totalEvents) * 100;
      
      setOverallStats({
        total_sources: totalSources,
        active_sources: activeSources,
        degraded_sources: degradedSources,
        inactive_sources: inactiveSources,
        total_eps: totalEps,
        total_events_today: totalEventsToday,
        parsing_success_rate: Math.round(parsingSuccessRate * 10) / 10,
        avg_latency_ms: 125 // Hardcoded - Mock Data
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load data';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Filter log sources based on search and filter criteria
   */
  const filteredLogSources = useMemo(() => {
    return logSources.filter(source => {
      const matchesSearch = !searchTerm || 
        source.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        source.type.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || source.status === statusFilter;
      const matchesType = typeFilter === 'all' || source.type === typeFilter;
      
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [logSources, searchTerm, statusFilter, typeFilter]);

  /**
   * Get status badge variant based on log source status
   */
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'degraded': return 'warning';
      case 'inactive': return 'critical';
      default: return 'secondary';
    }
  };

  /**
   * Get icon for log source type
   */
  const getSourceTypeIcon = (type: string) => {
    switch (type) {
      case 'Syslog': return <Server className="h-4 w-4" />;
      case 'JSON': return <FileCode className="h-4 w-4" />;
      case 'Windows': return <Monitor className="h-4 w-4" />;
      case 'Apache':
      case 'Nginx': return <Globe className="h-4 w-4" />;
      default: return <Server className="h-4 w-4" />;
    }
  };

  /**
   * Format timestamp for display
   */
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  /**
   * Handle log source deletion with proper error handling
   */
  const handleDeleteSource = async (sourceId: string, sourceName: string) => {
    if (!confirm(`Are you sure you want to delete log source "${sourceName}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      setIsLoading(true);
      await logSourceApi.deleteLogSource(sourceId);
      
      setLogSources(prev => prev.filter(s => s.id !== sourceId));
      
      // Refresh data after deletion
      await loadAllData();
      
      toast({
        title: 'Success',
        description: `Log source "${sourceName}" has been deleted.`,
        variant: 'default'
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete log source';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle log source group deletion
   */
  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    if (!confirm(`Are you sure you want to delete group "${groupName}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      setIsLoading(true);
      // Note: deleteLogSourceGroup endpoint not implemented yet - Mock Data
      // await logSourceApi.deleteLogSourceGroup(groupId);
      
      setLogSourceGroups(prev => prev.filter(g => g.group_id !== groupId));
      
      toast({
        title: 'Success',
        description: `Group "${groupName}" has been deleted.`,
        variant: 'default'
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete group';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Render statistics overview with proper accessibility
   */
  const renderStatsOverview = () => {
    if (!overallStats) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center space-x-2">
                <div className="h-5 w-5 bg-muted rounded animate-pulse" />
                <div>
                  <div className="h-8 w-16 bg-muted rounded animate-pulse mb-1" />
                  <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center space-x-2">
            <Server className="h-5 w-5 text-blue-500" aria-hidden="true" />
            <div>
              <div className="text-2xl font-bold">{overallStats.total_sources}</div>
              <div className="text-sm text-muted-foreground">Total Sources</div>
            </div>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center space-x-2">
            <Activity className="h-5 w-5 text-green-500" aria-hidden="true" />
            <div>
              <div className="text-2xl font-bold">{overallStats.active_sources}</div>
              <div className="text-sm text-muted-foreground">Active Sources</div>
            </div>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5 text-purple-500" aria-hidden="true" />
            <div>
              <div className="text-2xl font-bold">{overallStats.total_eps.toFixed(1)}</div>
              <div className="text-sm text-muted-foreground">Total EPS</div>
            </div>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center space-x-2">
            <FileCode className="h-5 w-5 text-orange-500" aria-hidden="true" />
            <div>
              <div className="text-2xl font-bold">{overallStats.parsing_success_rate}%</div>
              <div className="text-sm text-muted-foreground">Parse Success</div>
            </div>
          </div>
        </Card>
      </div>
    );
  };

  /**
   * Render log sources table with accessibility features
   */
  const renderSourcesTable = () => (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full" role="table" aria-label="Log sources table">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-4 font-medium">Source</th>
              <th className="text-left p-4 font-medium">Type</th>
              <th className="text-left p-4 font-medium">Status</th>
              <th className="text-left p-4 font-medium">EPS</th>
              <th className="text-left p-4 font-medium">Last Seen</th>
              <th className="text-right p-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogSources.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center p-12">
                  <div className="text-muted-foreground">
                    {searchTerm || statusFilter !== 'all' || typeFilter !== 'all' ? (
                      <>No log sources match your current filters</>
                    ) : (
                      <>No log sources configured yet</>
                    )}
                  </div>
                  {!searchTerm && statusFilter === 'all' && typeFilter === 'all' && (
                    <Button 
                      onClick={() => setIsCreateSourceOpen(true)}
                      variant="outline" 
                      className="mt-4"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add First Log Source
                    </Button>
                  )}
                </td>
              </tr>
            ) : (
              filteredLogSources.map((source) => (
                <tr 
                  key={source.id} 
                  className="border-b border-border hover:bg-muted/50 cursor-pointer"
                  onClick={() => setSelectedSource(source)}
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      {getSourceTypeIcon(source.type)}
                      <div>
                        <div className="font-medium">{source.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {source.subtype}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <Badge variant="outline">{source.type}</Badge>
                  </td>
                  <td className="p-4">
                    <Badge variant={getStatusBadgeVariant(source.status)}>
                      {source.status}
                    </Badge>
                  </td>
                  <td className="p-4 font-mono text-sm">
                    {source.eps.toFixed(1)}
                  </td>
                  <td className="p-4 text-sm text-muted-foreground">
                    {formatTimestamp(source.last_seen)}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={stopPropagation(() => setSelectedSource(source))}
                        aria-label={`View details for ${source.name}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={stopPropagation(() => handleDeleteSource(source.id, source.name))}
                        disabled={isLoading}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        aria-label={`Delete ${source.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );

  /**
   * Render log source groups table
   */
  const renderGroupsTable = () => (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full" role="table" aria-label="Log source groups table">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-4 font-medium">Group Name</th>
              <th className="text-left p-4 font-medium">Description</th>
              <th className="text-left p-4 font-medium">Sources</th>
              <th className="text-left p-4 font-medium">Created</th>
              <th className="text-right p-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {logSourceGroups.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center p-12">
                  <div className="text-muted-foreground">No log source groups configured yet</div>
                  <Button 
                    onClick={() => setIsCreateGroupOpen(true)}
                    variant="outline" 
                    className="mt-4"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Group
                  </Button>
                </td>
              </tr>
            ) : (
              logSourceGroups.map((group) => (
                <tr 
                  key={group.group_id} 
                  className="border-b border-border hover:bg-muted/50 cursor-pointer"
                  onClick={() => setSelectedGroup(group)}
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <Users className="h-4 w-4" />
                      <div className="font-medium">{group.name}</div>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-muted-foreground">
                    {group.description}
                  </td>
                  <td className="p-4">
                    <Badge variant="outline">
                      {group.log_source_ids.length} sources
                    </Badge>
                  </td>
                  <td className="p-4 text-sm text-muted-foreground">
                    {formatTimestamp(group.created_at)}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={stopPropagation(() => setSelectedGroup(group))}
                        aria-label={`View details for ${group.name}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={stopPropagation(() => handleDeleteGroup(group.group_id, group.name))}
                        disabled={isLoading}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        aria-label={`Delete ${group.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Enhanced Log Source Management</h1>
          <p className="text-muted-foreground">
            Manage log sources, groups, and monitor real-time activity
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => setIsCreateGroupOpen(true)}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Users className="h-4 w-4" />
            Create Group
          </Button>
          <Button 
            onClick={() => setIsCreateSourceOpen(true)}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Log Source
          </Button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <Card className="p-4 border-destructive">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>{error}</span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={loadAllData}
              disabled={isLoading}
              className="ml-auto"
            >
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* Statistics Overview */}
      {renderStatsOverview()}

      {/* Tab Navigation with accessibility */}
      <div className="flex space-x-1 bg-muted p-1 rounded-lg w-fit" role="tablist" aria-label="Log source management tabs">
        <button
          onClick={() => setActiveTab('sources')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'sources'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          role="tab"
          aria-selected={activeTab === 'sources'}
          aria-controls="sources-panel"
        >
          Log Sources
        </button>
        <button
          onClick={() => setActiveTab('groups')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'groups'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          role="tab"
          aria-selected={activeTab === 'groups'}
          aria-controls="groups-panel"
        >
          Groups
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'stats'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          role="tab"
          aria-selected={activeTab === 'stats'}
          aria-controls="stats-panel"
        >
          Statistics
        </button>
      </div>

      {/* Filters - Only show for sources tab */}
      {activeTab === 'sources' && (
        <Card className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Search with accessibility */}
            <div className="relative flex-1 min-w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input
                type="text"
                placeholder="Search by name or type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                aria-label="Search log sources by name or type"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="degraded">Degraded</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>

            {/* Type Filter */}
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Syslog">Syslog</SelectItem>
                <SelectItem value="JSON">JSON</SelectItem>
                <SelectItem value="Windows">Windows</SelectItem>
                <SelectItem value="Apache">Apache</SelectItem>
                <SelectItem value="Nginx">Nginx</SelectItem>
              </SelectContent>
            </Select>

            {/* Results count */}
            <div className="text-sm text-muted-foreground whitespace-nowrap">
              {filteredLogSources.length} of {logSources.length} sources
            </div>
          </div>
        </Card>
      )}

      {/* Tab Content */}
      {activeTab === 'sources' && renderSourcesTable()}
      {activeTab === 'groups' && renderGroupsTable()}
      {activeTab === 'stats' && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Detailed Statistics</h3>
          {!overallStats ? (
            <div className="space-y-4">
              <div className="h-4 w-32 bg-muted rounded animate-pulse" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex justify-between">
                      <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                      <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex justify-between">
                      <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                      <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium mb-2">Source Status Distribution</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Active Sources:</span>
                    <span className="font-mono">{overallStats.active_sources}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Degraded Sources:</span>
                    <span className="font-mono">{overallStats.degraded_sources}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Inactive Sources:</span>
                    <span className="font-mono">{overallStats.inactive_sources}</span>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-2">Performance Metrics</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Total Events Today:</span>
                    <span className="font-mono">{overallStats.total_events_today.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Average Latency:</span>
                    <span className="font-mono">{overallStats.avg_latency_ms}ms - Hardcoded</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Parse Success Rate:</span>
                    <span className="font-mono">{overallStats.parsing_success_rate}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Create Source Sheet */}
      <Sheet open={isCreateSourceOpen} onOpenChange={setIsCreateSourceOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Create Log Source</SheetTitle>
            <SheetDescription>
              Configure a new log source for data ingestion
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <p className="text-sm text-muted-foreground">
              Log source creation form would be implemented here.
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Create Group Sheet */}
      <Sheet open={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Create Log Source Group</SheetTitle>
            <SheetDescription>
              Group related log sources for easier management
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <p className="text-sm text-muted-foreground">
              Log source group creation form would be implemented here.
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Source Detail Sheet */}
      {selectedSource && (
        <Sheet open={!!selectedSource} onOpenChange={() => setSelectedSource(null)}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{selectedSource.name}</SheetTitle>
              <SheetDescription>
                Log source details and configuration
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Source ID</label>
                <div className="font-mono text-sm">{selectedSource.id}</div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Type</label>
                <div>{selectedSource.type} - {selectedSource.subtype}</div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Status</label>
                <div>
                  <Badge variant={getStatusBadgeVariant(selectedSource.status)}>
                    {selectedSource.status}
                  </Badge>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Events Per Second</label>
                <div className="font-mono">{selectedSource.eps.toFixed(2)}</div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Total Events</label>
                <div className="font-mono">{selectedSource.event_count.toLocaleString()}</div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}