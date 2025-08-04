import React, { useState, useCallback, useMemo } from 'react';
import { useEventSearch } from '../hooks/useEventSearch';
import { useLiveEvents } from '../hooks/useLiveEvents';
import { useAuthStore } from '../stores/authStore';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Badge } from './ui/Badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/Select';
import { Switch } from './ui/Switch';
import {
  Play,
  Pause,
  RotateCcw,
  Filter,
  Activity,
  ChevronLeft,
  ChevronRight,
  Search,
  Calendar,
  Database
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type ColumnDef
} from '@tanstack/react-table';
// import { useVirtualizer } from '@tanstack/react-virtual';
import type {
  // EventSearchRequest,
  EventDetailResponse,
  TimeRange,
  FilterValue,
  SortField
} from '../types/api';

interface EventInvestigationPageProps {
  className?: string;
}

interface FilterState {
  query: string;
  timeRange: TimeRange | null;
  sourceIp: string;
  destinationIp: string;
  eventCategory: string;
  severity: string;
  tenantId: string;
}

const TIME_RANGE_PRESETS = [
  { label: 'Last 15 minutes', value: { start: new Date(Date.now() - 15 * 60 * 1000).toISOString(), end: new Date().toISOString() } },
  { label: 'Last hour', value: { start: new Date(Date.now() - 60 * 60 * 1000).toISOString(), end: new Date().toISOString() } },
  { label: 'Last 24 hours', value: { start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), end: new Date().toISOString() } },
  { label: 'Last 7 days', value: { start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), end: new Date().toISOString() } }
];

const SEVERITY_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Critical', value: 'critical' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
  { label: 'Info', value: 'info' }
];

// const columnHelper = createColumnHelper<EventDetailResponse>();

const EventInvestigationPage: React.FC<EventInvestigationPageProps> = ({ className }) => {
  const { tenantId } = useAuthStore();
  
  // State management
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(100);
  const [sortField] = useState<SortField>({
    field: 'event_timestamp',
    direction: 'desc'
  });
  
  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    query: '',
    timeRange: TIME_RANGE_PRESETS[1].value, // Default to last hour
    sourceIp: '',
    destinationIp: '',
    eventCategory: '',
    severity: 'all',
    tenantId: tenantId || ''
  });

  // Build search params for useEventSearch
  const searchParams = useMemo(() => {
    const filterValues: FilterValue[] = [];
    
    if (filters.sourceIp) {
      filterValues.push(filters.sourceIp);
    }
    if (filters.destinationIp) {
      filterValues.push(filters.destinationIp);
    }
    if (filters.eventCategory) {
      filterValues.push(filters.eventCategory);
    }
    if (filters.severity && filters.severity !== 'all') {
      filterValues.push(filters.severity);
    }

    return {
      timeRange: filters.timeRange || undefined,
      freeText: filters.query || undefined,
      filters: filterValues.length > 0 ? filterValues : undefined,
      pagination: {
        page: currentPage,
        size: pageSize,
        includeTotal: true
      },
      sort: sortField,
      searchOptions: {
        includeRaw: true
      }
    };
  }, [filters, currentPage, pageSize, sortField]);

  // Data hooks
  const {
    data: searchData, // eslint-disable-line @typescript-eslint/no-unused-vars
    events: searchEvents,
    totalCount,
    hasMore,
    isLoading: isLoadingEvents,
    error: searchError,
    refetch: refetchEvents
  } = useEventSearch(searchParams);

  const {
    events: liveEvents,
    isConnected: isLiveConnected,
    error: liveError,
    connect: connectLive,
    disconnect: disconnectLive
  } = useLiveEvents({
    filters: {
      tenantId: filters.tenantId,
      sourceType: filters.eventCategory || undefined,
      severity: filters.severity || undefined
    }
  });

  // Event handlers
  const handleFilterChange = useCallback((key: keyof FilterState, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1); // Reset to first page when filters change
  }, []);

  // const handleTimeRangePreset = useCallback((preset: { start: number; end: number }) => {
  //   handleFilterChange('timeRange', preset);
  // }, [handleFilterChange]);

  // const handleLiveModeToggle = useCallback(() => {
  //   if (isLiveMode) {
  //     disconnectLive();
  //     setIsLiveMode(false);
  //   } else {
  //     connectLive();
  //     setIsLiveMode(true);
  //   }
  // }, [isLiveMode, connectLive, disconnectLive]);

  const handleRefresh = useCallback(() => {
    refetchEvents();
    if (isLiveMode) {
      disconnectLive();
      setTimeout(() => connectLive(), 100);
    }
  }, [refetchEvents, isLiveMode, connectLive, disconnectLive]);

  // Table columns
  const columns = useMemo<ColumnDef<EventDetailResponse>[]>(() => [
    {
      accessorKey: 'timestamp',
      header: 'Timestamp',
      cell: ({ getValue }) => new Date(getValue() as string).toLocaleString(),
      size: 180
    },
    {
      accessorKey: 'sourceIp',
      header: 'Source IP',
      cell: ({ getValue }) => getValue() || '-',
      size: 120
    },
    {
      accessorKey: 'fields',
      header: 'Dest IP',
      cell: ({ getValue }) => {
        const fields = getValue() as Record<string, any>;
        return fields?.destination_ip || fields?.dest_ip || '-';
      },
      size: 120
    },
    {
      accessorKey: 'sourceType',
      header: 'Category',
      cell: ({ getValue }) => (
         <Badge variant="outline" className="text-xs">
           {(getValue() as string) || 'Unknown'}
         </Badge>
       ),
      size: 100
    },
    {
      accessorKey: 'severity',
      header: 'Severity',
      cell: ({ getValue }) => {
         const severity = getValue() as string;
         const variant = severity === 'critical' || severity === 'high' ? 'destructive' :
                        severity === 'medium' ? 'default' : 'secondary';
         return (
           <Badge variant={variant as any} className="text-xs">
             {severity || 'Unknown'}
           </Badge>
         );
       },
      size: 80
    },
    {
      id: 'action',
      header: 'Action',
      cell: ({ row }) => {
        const fields = row.original.fields as Record<string, any>;
        return fields?.event_action || fields?.action || '-';
      },
      size: 120
    },
    {
      accessorKey: 'rawMessage',
      header: 'Message',
      cell: ({ getValue }) => (
         <div className="max-w-md truncate text-sm text-muted-foreground">
           {(getValue() as string) || '-'}
         </div>
       ),
      size: 300
    }
  ], []);

  // Combine historical and live events
  const allEvents = useMemo(() => {
    const historical = searchEvents || [];
    if (isLiveMode && liveEvents.length > 0) {
      // Merge live events with historical, removing duplicates by ID
      const historicalIds = new Set(historical.map(e => e.id));
      const newLiveEvents = liveEvents.filter(e => !historicalIds.has(e.id));
      return [...newLiveEvents, ...historical];
    }
    return historical;
  }, [searchEvents, liveEvents, isLiveMode]);

  // Table setup
  const table = useReactTable({
    data: allEvents,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  // Calculate metrics
  const totalEventsCount = totalCount || 0;
  const logVolumeGB = useMemo(() => {
    // Estimate based on average event size (rough calculation)
    const avgEventSizeBytes = 512; // Average event size estimate
    const totalBytes = totalEventsCount * avgEventSizeBytes;
    return (totalBytes / (1024 * 1024 * 1024)).toFixed(2);
  }, [totalEventsCount]);

  const canGoNext = hasMore;
  const canGoPrevious = currentPage > 1;

  return (
    <div className={cn('flex flex-col h-full space-y-4', className)}>
      {/* Header with metrics */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold">Event Investigation</h1>
          <div className="flex items-center space-x-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <Badge variant="secondary" className="text-sm">
              {totalEventsCount.toLocaleString()} events / {logVolumeGB} GB
            </Badge>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoadingEvents}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          
          <div className="flex items-center space-x-2">
            <Switch
               checked={isLiveMode}
               onChange={setIsLiveMode}
               disabled={isLoadingEvents}
             />
            <span className="text-sm font-medium">Live Mode</span>
            {isLiveMode && (
              <div className="flex items-center space-x-1">
                {isLiveConnected ? (
                  <Play className="h-3 w-3 text-green-500" />
                ) : (
                  <Pause className="h-3 w-3 text-red-500" />
                )}
                <span className="text-xs text-muted-foreground">
                  {isLiveConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-4 w-4" />
            <span>Search & Filters</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search bar */}
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search events..."
              value={filters.query}
              onChange={(e) => handleFilterChange('query', e.target.value)}
              className="flex-1"
            />
          </div>
          
          {/* Time range presets */}
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Time Range:</span>
            <div className="flex space-x-2">
              {TIME_RANGE_PRESETS.map((preset, index) => (
                <Button
                  key={index}
                  variant={filters.timeRange === preset.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    const timeRange: TimeRange = {
                      start: preset.value.start,
                      end: preset.value.end
                    };
                    handleFilterChange('timeRange', timeRange);
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>
          
          {/* Filter controls */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Source IP</label>
              <Input
                placeholder="e.g., 192.168.1.1"
                value={filters.sourceIp}
                onChange={(e) => handleFilterChange('sourceIp', e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Destination IP</label>
              <Input
                placeholder="e.g., 10.0.0.1"
                value={filters.destinationIp}
                onChange={(e) => handleFilterChange('destinationIp', e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <Input
                placeholder="e.g., authentication"
                value={filters.eventCategory}
                onChange={(e) => handleFilterChange('eventCategory', e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Severity</label>
              <Select
                value={filters.severity}
                onValueChange={(value) => handleFilterChange('severity', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card className="flex-1 flex flex-col">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Activity className="h-4 w-4" />
              <span>Events</span>
              {isLoadingEvents && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
              )}
            </CardTitle>
            
            {/* Pagination controls */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">
                Page {currentPage} • {allEvents.length} events
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={!canGoPrevious || isLoadingEvents}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={!canGoNext || isLoadingEvents}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 overflow-hidden">
          {searchError && (
            <div className="text-red-500 text-sm mb-4">
              Error loading events: {searchError.message}
            </div>
          )}
          
          {liveError && (
            <div className="text-orange-500 text-sm mb-4">
              Live stream error: {liveError}
            </div>
          )}
          
          <div className="h-full overflow-auto border rounded-md">
            <table className="w-full">
              <thead className="bg-muted/50 sticky top-0">
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <th
                        key={header.id}
                        className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                        style={{ width: header.getSize() }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="bg-background divide-y divide-border">
                {table.getRowModel().rows.map(row => (
                  <tr key={row.id} className="hover:bg-muted/50">
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-4 py-3 whitespace-nowrap">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            
            {allEvents.length === 0 && !isLoadingEvents && (
              <div className="text-center py-8 text-muted-foreground">
                No events found. Try adjusting your search criteria.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export { EventInvestigationPage };