import { useEffect, useState, useCallback, useRef } from 'react';
import { Clock, AlertTriangle, Download, RefreshCw, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/hooks/useToast';


/**
 * Type definition for dev.events table structure
 */
type DevEvent = {
  event_id: string;
  tenant_id: string;
  event_timestamp: number;
  source_ip: string;
  source_type: string;
  message?: string;
  severity?: string;
};

/**
 * Response structure from the dev events API
 */
type DevEventsResponse = {
  events: DevEvent[];
  total_count: number;
  has_more: boolean;
  query_time_ms: number;
};

/**
 * Filter parameters for querying dev events
 */
type EventFilters = {
  tenant_id?: string;
  source_ip?: string;
  source_type?: string;
  severity?: string;
  start_time?: number;
  end_time?: number;
};

/**
 * Props for the DevEventsTable component
 */
interface DevEventsTableProps {
  /** Custom API endpoint URL (defaults to localhost:8000) */
  apiEndpoint?: string;
  /** Initial page size (defaults to 100) */
  pageSize?: number;
  /** Whether to show filters (defaults to true) */
  showFilters?: boolean;
  /** Whether to auto-refresh data (defaults to false) */
  autoRefresh?: boolean;
  /** Auto-refresh interval in seconds (defaults to 30) */
  refreshInterval?: number;
}

/**
 * DevEventsTable - Interactive table component for displaying dev.events data
 * 
 * Features:
 * - Real-time data fetching from Rust backend
 * - Pagination with configurable page sizes
 * - Filtering by tenant, source IP, source type, and severity
 * - Time range filtering
 * - Export to CSV functionality
 * - Auto-refresh capability
 * - Error handling with user-friendly messages
 * - Loading states and performance metrics
 * 
 * @example
 * ```tsx
 * <DevEventsTable 
 *   apiEndpoint="/api"
 *   pageSize={50}
 *   showFilters={true}
 *   autoRefresh={true}
 *   refreshInterval={30}
 * />
 * ```
 */
export default function DevEventsTable({
  apiEndpoint = '/api',
  pageSize = 100,
  showFilters = true,
  autoRefresh = false,
  refreshInterval = 30
}: DevEventsTableProps) {
  const { toast } = useToast();
  
  // State management
  const [events, setEvents] = useState<DevEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [queryTime, setQueryTime] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  
  // Filter state
  const [filters, setFilters] = useState<EventFilters>({});
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  
  // Auto-refresh state
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  
  // Ref to track if component is mounted
  const isMountedRef = useRef(true);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  /**
   * Builds query parameters from current filters and pagination state
   */
  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    
    params.append('limit', pageSize.toString());
    params.append('offset', (currentPage * pageSize).toString());
    
    if (filters.tenant_id) params.append('tenant_id', filters.tenant_id);
    if (filters.source_ip) params.append('source_ip', filters.source_ip);
    if (filters.source_type) params.append('source_type', filters.source_type);
    if (filters.severity) params.append('severity', filters.severity);
    if (filters.start_time) params.append('start_time', filters.start_time.toString());
    if (filters.end_time) params.append('end_time', filters.end_time.toString());
    
    return params.toString();
  }, [filters, currentPage, pageSize]);
  
  /**
   * Fetches events from the Rust backend API
   */
  const fetchEvents = useCallback(async () => {
    // Check if component is still mounted
    if (!isMountedRef.current) {
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const queryParams = buildQueryParams();
      const url = `${apiEndpoint}/dev-events?${queryParams}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      // Check if component is still mounted after fetch
      if (!isMountedRef.current) {
        return;
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data: DevEventsResponse = await response.json();
      
      setEvents(data.events);
      setTotalCount(data.total_count);
      setHasMore(data.has_more);
      setQueryTime(data.query_time_ms);
      setLastRefresh(new Date());
      
      // Show success toast for manual refreshes
      if (!autoRefresh) {
        toast({
          title: 'Events Loaded',
          description: `Loaded ${data.events.length} events in ${data.query_time_ms}ms`,
          variant: 'success',
        });
      }
    } catch (err) {
      // Only show errors if component is still mounted
      if (!isMountedRef.current) {
        return;
      }
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to load events';
      setError(errorMessage);
      setEvents([]);
      
      toast({
        title: 'Error Loading Events',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [apiEndpoint, buildQueryParams, autoRefresh, toast]);
  
  /**
   * Manual refresh handler for button clicks
   */
  const handleRefresh = useCallback(() => {
    fetchEvents();
  }, [fetchEvents]);
  
  /**
   * Handles filter changes and resets pagination
   */
  const handleFilterChange = useCallback((newFilters: Partial<EventFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setCurrentPage(0); // Reset to first page when filters change
  }, []);
  
  /**
   * Clears all filters and resets pagination
   */
  const clearFilters = useCallback(() => {
    setFilters({});
    setCurrentPage(0);
  }, []);
  
  /**
   * Exports current events to CSV format
   */
  const handleExport = useCallback(() => {
    if (events.length === 0) {
      toast({
        title: 'No Data to Export',
        description: 'Load some events first before exporting',
        variant: 'destructive',
      });
      return;
    }
    
    // Prepare CSV data
    const csvData = events.map(event => ({
      timestamp: new Date(event.event_timestamp * 1000).toISOString(),
      tenant_id: event.tenant_id,
      source_ip: event.source_ip,
      source_type: event.source_type,
      message: event.message || '',
      severity: event.severity || '',
      event_id: event.event_id,
    }));
    
    // Create CSV content
    const headers = Object.keys(csvData[0]);
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => 
        headers.map(header => `"${row[header as keyof typeof row]}"`).join(',')
      )
    ].join('\n');
    
    // Download CSV file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dev-events-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Export Complete',
      description: `Exported ${events.length} events to CSV`,
      variant: 'success',
    });
  }, [events, toast]);
  
  /**
   * Pagination handlers
   */
  const goToNextPage = useCallback(() => {
    if (hasMore) {
      setCurrentPage(prev => prev + 1);
    }
  }, [hasMore]);
  
  const goToPreviousPage = useCallback(() => {
    if (currentPage > 0) {
      setCurrentPage(prev => prev - 1);
    }
  }, [currentPage]);
  
  // Initial data load
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);
  
  // Auto-refresh setup
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      if (isMountedRef.current) {
        fetchEvents();
      }
    }, refreshInterval * 1000);
    
    return () => {
      clearInterval(interval);
    };
  }, [autoRefresh, refreshInterval, fetchEvents]);
  
  /**
   * Formats severity with appropriate styling
   */
  const getSeverityBadge = (severity?: string) => {
    if (!severity) return <span className="text-gray-400">-</span>;
    
    const variant = {
      'critical': 'destructive',
      'high': 'destructive',
      'medium': 'secondary',
      'low': 'outline',
      'info': 'outline'
    }[severity.toLowerCase()] || 'outline';
    
    return <Badge variant={variant as any}>{severity}</Badge>;
  };
  
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary-text">Dev Events</h1>
            <p className="text-secondary-text">
              Real-time events from dev.events table
              {autoRefresh && (
                <span className="ml-2 text-sm">
                  (Auto-refresh: {refreshInterval}s)
                </span>
              )}
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            {showFilters && (
              <Button 
                variant="outline" 
                onClick={() => setShowFilterPanel(!showFilterPanel)}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </Button>
            )}
            
            <Button variant="outline" onClick={handleRefresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            
            {events.length > 0 && (
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            )}
          </div>
        </div>
        
        {/* Filter Panel */}
        {showFilters && showFilterPanel && (
          <Card>
            <div className="p-4">
              <h3 className="text-lg font-medium text-primary-text mb-4">Filters</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm font-medium text-secondary-text mb-1">
                    Tenant ID
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-primary-text"
                    placeholder="Filter by tenant"
                    value={filters.tenant_id || ''}
                    onChange={(e) => handleFilterChange({ tenant_id: e.target.value || undefined })}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-secondary-text mb-1">
                    Source IP
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-primary-text"
                    placeholder="Filter by IP"
                    value={filters.source_ip || ''}
                    onChange={(e) => handleFilterChange({ source_ip: e.target.value || undefined })}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-secondary-text mb-1">
                    Source Type
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-primary-text"
                    placeholder="Filter by type"
                    value={filters.source_type || ''}
                    onChange={(e) => handleFilterChange({ source_type: e.target.value || undefined })}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-secondary-text mb-1">
                    Severity
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-primary-text"
                    value={filters.severity || ''}
                    onChange={(e) => handleFilterChange({ severity: e.target.value || undefined })}
                  >
                    <option value="">All severities</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                    <option value="info">Info</option>
                  </select>
                </div>
                
                <div className="flex items-end">
                  <Button variant="outline" onClick={clearFilters} className="w-full">
                    Clear Filters
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}
        
        {/* Error Display */}
        {error && (
          <Card>
            <div className="p-4 text-center">
              <AlertTriangle className="mx-auto h-12 w-12 text-red-400 mb-4" />
              <h3 className="text-lg font-medium text-primary-text mb-2">Error Loading Events</h3>
              <p className="text-secondary-text mb-4">{error}</p>
              <Button onClick={handleRefresh}>Try Again</Button>
            </div>
          </Card>
        )}
        
        {/* Events Table */}
        {events.length > 0 && (
          <Card>
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <h2 className="text-lg font-semibold text-primary-text">Events</h2>
                  <Badge variant="secondary">
                    {totalCount.toLocaleString()} total events
                  </Badge>
                  <Badge variant="outline">
                    Page {currentPage + 1}
                  </Badge>
                  {queryTime > 0 && (
                    <Badge variant="outline">
                      {queryTime}ms
                    </Badge>
                  )}
                  {loading && (
                    <Badge variant="outline">
                      Loading...
                    </Badge>
                  )}
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={goToPreviousPage}
                    disabled={currentPage === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={goToNextPage}
                    disabled={!hasMore}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {autoRefresh && (
                <div className="mt-2 text-sm text-secondary-text">
                  Last updated: {lastRefresh.toLocaleTimeString()}
                </div>
              )}
            </div>
            
            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider">
                      <Clock className="inline h-4 w-4 mr-1" />
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider">
                      Tenant
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider">
                      Source IP
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider">
                      Source Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider">
                      Message
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider">
                      Severity
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider">
                      Event ID
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-background divide-y divide-border">
                  {events.map((event) => (
                    <tr 
                      key={event.event_id} 
                      className="hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => {
                        // Could add event detail modal here
                        console.log('Event clicked:', event);
                      }}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-primary-text">
                        {new Date(event.event_timestamp * 1000).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-primary-text">
                        <code className="bg-muted px-2 py-1 rounded text-xs">
                          {event.tenant_id}
                        </code>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-primary-text font-mono">
                        {event.source_ip}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-primary-text">
                        <Badge variant="outline">{event.source_type}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-primary-text max-w-md truncate">
                        {event.message || <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {getSeverityBadge(event.severity)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-secondary-text font-mono">
                        {event.event_id.substring(0, 8)}...
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        
        {/* Empty State */}
        {!loading && !error && events.length === 0 && (
          <Card>
            <div className="p-8 text-center">
              <Clock className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-primary-text mb-2">No Events Found</h3>
              <p className="text-secondary-text mb-4">
                No events match your current filters. Try adjusting your search criteria.
              </p>
              <Button onClick={clearFilters} variant="outline">
                Clear Filters
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}