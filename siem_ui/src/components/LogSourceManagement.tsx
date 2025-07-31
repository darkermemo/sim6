import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Search, Filter, Server, Globe, Monitor, FileCode } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
// Using native input for now - Input component not available
import { Select } from '@/components/ui/Select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/Sheet';
import { useTypedLogSources, useDeleteLogSource, getLogSourceTypeBadgeVariant, getValidLogSourceTypes, type LogSource } from '@/hooks/api/useTypedLogSources';
import { useAuthStore } from '@/stores/authStore';
// import { useToast } from '@/hooks/useToast'; // Currently unused
import { stopPropagation } from '@/lib/dom';
import { LogSourceDetailDrawer } from './LogSourceDetailDrawer';
import type { LogSourceFilters, LogSourceType } from '@/types/api';

/**
 * LogSourceManagement - Admin interface for managing SIEM log sources
 * 
 * Features:
 * - View all configured log sources
 * - Create new log source configurations  
 * - Delete existing log sources
 * - Filter by source type and search by name/IP
 * - Admin-only access with authentication guard
 * 
 * Backend endpoints:
 * - GET /v1/log_sources - List sources
 * - POST /v1/log_sources - Create source
 * - DELETE /v1/log_sources/{id} - Delete source
 * 
 * @example
 * <LogSourceManagement />
 */
export function LogSourceManagement() {
  // Toast for error notifications - currently handled by useDeleteLogSource hook
  // const { toast } = useToast();
  const deleteLogSourceMutation = useDeleteLogSource();
  
  // State for filters and UI
  const [filters, setFilters] = useState<LogSourceFilters>({
    search: '',
    source_type: undefined,
    page: 1,
    limit: 50,
  });
  const [selectedSource, setSelectedSource] = useState<LogSource | null>(null);
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Fetch log sources with conditional authentication
  const { data, isLoading, error, refetch } = useTypedLogSources();
  const { accessToken } = useAuthStore();
  const isAuthenticated = !!accessToken;
  
  const logSources = data?.log_sources || [];
  const total = data?.total || 0;

  // Memoize filtered results for performance
  const filteredLogSources = useMemo(() => {
    return logSources.filter((source) => {
      const matchesSearch = !filters.search || 
        source.source_name.toLowerCase().includes(filters.search.toLowerCase());
      
      const matchesType = !filters.source_type || source.source_type === filters.source_type;
      
      return matchesSearch && matchesType;
    });
  }, [logSources, filters.search, filters.source_type]);

  // Handle search input change
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilters((prev: LogSourceFilters) => ({ ...prev, search: event.target.value, page: 1 }));
  };

  // Handle source type filter change
  const handleSourceTypeChange = (value: string) => {
    setFilters((prev: LogSourceFilters) => ({ 
      ...prev, 
      source_type: value === 'all' ? undefined : value as LogSourceType,
      page: 1 
    }));
  };

  // Delete logic moved inline to button onClick

  // Handle create success
  const handleCreateSuccess = () => {
    setIsCreateDrawerOpen(false);
    refetch(); // Refresh the list
  };

  // Get icon for source type
  const getSourceTypeIcon = (sourceType: LogSourceType) => {
    switch (sourceType) {
      case 'Syslog':
        return <Server className="h-4 w-4" />;
      case 'JSON':
        return <FileCode className="h-4 w-4" />;
      case 'Windows':
        return <Monitor className="h-4 w-4" />;
      case 'Apache':
        return <Server className="h-4 w-4" />;
      case 'Nginx':
        return <Globe className="h-4 w-4" />;
      default:
        return <Server className="h-4 w-4" />;
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-10 w-32 bg-muted animate-pulse rounded" />
        </div>
        <Card className="p-6">
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4">
                <div className="h-12 w-12 bg-muted animate-pulse rounded" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                  <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                </div>
                <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                <div className="h-8 w-8 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-destructive mb-2">Error Loading Log Sources</h3>
          <p className="text-muted-foreground mb-4">
            {error?.response?.status === 403 
              ? 'You need Admin privileges to manage log sources.' 
              : 'Failed to load log sources. Please try again.'}
          </p>
          <Button onClick={() => refetch()} variant="outline">
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  // Not authenticated state
  if (!isAuthenticated) {
    return (
      <Card className="p-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Authentication Required</h3>
          <p className="text-muted-foreground">
            Please log in to manage log sources.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Log Source Management</h1>
          <p className="text-muted-foreground">
            Configure and manage SIEM log source ingestion points
          </p>
        </div>
        
        <Button 
          onClick={() => setIsCreateDrawerOpen(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Log Source
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-64">
            <label htmlFor="log-source-search" className="sr-only">Search log sources</label>
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              id="log-source-search"
              placeholder="Search by name or IP address..."
              value={filters.search}
              onChange={handleSearchChange}
              className="pl-10 px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Source Type Filter */}
          <div>
            <span className="sr-only">Filter by source type</span>
            <Select 
              value={filters.source_type || 'all'} 
              onValueChange={handleSourceTypeChange}
              aria-label="Filter by source type"
            >
              <option value="all">All Types</option>
              {getValidLogSourceTypes().map((type: string) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
            </Select>
          </div>

          {/* Filter Toggle for Mobile */}
          <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
            <Button 
              variant="outline" 
              size="sm" 
              className="lg:hidden" 
              onClick={() => setIsFilterOpen(true)}
              data-testid="mobile-filter-toggle"
            >
              <Filter className="h-4 w-4" />
            </Button>
            <SheetContent side="right" data-testid="filter-sheet">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription>Filter log sources by type and search criteria</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 mt-6">
                <div>
                  <label htmlFor="log-source-search" className="text-sm font-medium mb-2 block">Search</label>
                                     <input
                     id="log-source-search"
                     type="text"
                     placeholder="Search by name or IP..."
                     value={filters.search}
                     onChange={handleSearchChange}
                     className="px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                   />
                </div>
                <div>
                  <label htmlFor="log-source-type-select" className="text-sm font-medium mb-2 block">Source Type</label>
                  <div id="log-source-type-select">
                    <Select 
                    value={filters.source_type || 'all'} 
                    onValueChange={handleSourceTypeChange}
                  >
                    <option value="all">All Types</option>
                                         {getValidLogSourceTypes().map((type: string) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                  </Select>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* Results count */}
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            {filteredLogSources.length} of {total} sources
          </div>
        </div>
      </Card>

      {/* Log Sources Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4 font-medium">Source</th>
                <th className="text-left p-4 font-medium">Type</th>
                <th className="text-left p-4 font-medium">IP Address</th>
                <th className="text-left p-4 font-medium">Created</th>
                <th className="text-right p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogSources.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center p-12">
                    <div className="text-muted-foreground">
                      {filters.search || filters.source_type ? (
                        <>No log sources match your current filters</>
                      ) : (
                        <>No log sources configured yet</>
                      )}
                    </div>
                    {!filters.search && !filters.source_type && (
                      <Button 
                        onClick={() => setIsCreateDrawerOpen(true)}
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
                filteredLogSources.map((source: LogSource) => (
                  <tr 
                    key={source.source_id} 
                    className="border-b border-border hover:bg-muted/50 cursor-pointer"
                    onClick={() => setSelectedSource(source)}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {getSourceTypeIcon(source.source_type as LogSourceType || 'Syslog')}
                        <div>
                          <div className="font-medium">{source.source_name}</div>
                          <div className="text-sm text-muted-foreground">
                            ID: {source.source_id.slice(0, 8)}...
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge variant={getLogSourceTypeBadgeVariant(source.source_type) as "default" | "secondary" | "success" | "warning" | "outline" | "critical" | "high" | "medium" | "low" | "info"}>
                        {source.source_type}
                      </Badge>
                    </td>
                    <td className="p-4 font-mono text-sm">{source.source_ip}</td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {new Date(source.created_at * 1000).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                                                 <Button
                           variant="ghost"
                           size="sm"
                           onClick={stopPropagation(async () => {
                             if (!confirm(`Are you sure you want to delete log source "${source.source_name}"? This action cannot be undone.`)) {
                               return;
                             }
                             try {
                               await deleteLogSourceMutation.mutateAsync(source.source_id);
                                refetch();
                             } catch (error) {
                               console.error('Failed to delete log source:', error);
                             }
                           })}
                           disabled={deleteLogSourceMutation.isPending}
                           className="text-destructive hover:text-destructive hover:bg-destructive/10"
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

      {/* Create Log Source Drawer */}
      <LogSourceDetailDrawer
          isOpen={isCreateDrawerOpen}
          onClose={() => setIsCreateDrawerOpen(false)}
          onSuccess={handleCreateSuccess}
          mode="create"
        />

      {/* View Log Source Detail Drawer */}
      {selectedSource && (
        <LogSourceDetailDrawer
          isOpen={!!selectedSource}
          onClose={() => setSelectedSource(null)}
          logSource={selectedSource}
          mode="view"
        />
      )}
    </div>
  );
}