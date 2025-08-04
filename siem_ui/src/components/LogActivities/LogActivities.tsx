import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FixedSizeList as List } from 'react-window';
import { useEvents, useEventCount, useEventStream } from '../../hooks/api/useEvents';
import { Event, TimeRange } from '../../types/events';
import { useAuthStore } from '../../stores/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { Switch } from '../ui/Switch';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Filter,
  Activity,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { TIME_RANGE_PRESETS } from '../../types/events';

interface LogActivitiesProps {
  className?: string;
}

interface FilterState {
  query: string;
  timeRange: TimeRange | null;
  sourceIp: string;
  eventCategory: string;
  eventOutcome: string;
  eventAction: string;
  sourceType: string;
}

const LogActivities: React.FC<LogActivitiesProps> = ({ className }) => {
  // Auth state
  const { tenantId } = useAuthStore();
  
  // State management
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  const [liveEvents, setLiveEvents] = useState<Event[]>([]);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(undefined);
  const [useCursorPagination, setUseCursorPagination] = useState(false);
  
  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    query: '',
    timeRange: TIME_RANGE_PRESETS[1].getValue(), // Default to last hour
    sourceIp: '',
    eventCategory: '',
    eventOutcome: '',
    eventAction: '',
    sourceType: ''
  });
  
  // Refs
  const listRef = useRef<List>(null);
  const liveListRef = useRef<List>(null);
  
  // API hooks with cursor-based pagination support
  const { 
    events: historicalEvents, 
    totalCount: historicalCount, 
    isLoading: isLoadingEvents,
    nextCursor,
    previousCursor
  } = useEvents({
    tenantId: tenantId || undefined,
    query: filters.query || undefined,
    page: useCursorPagination ? undefined : currentPage,
    limit: pageSize,
    startTime: filters.timeRange?.start_unix,
    endTime: filters.timeRange?.end_unix,
    sourceIp: filters.sourceIp || undefined,
    eventCategory: filters.eventCategory || undefined,
    eventOutcome: filters.eventOutcome || undefined,
    eventAction: filters.eventAction || undefined,
    sourceType: filters.sourceType || undefined,
    cursor: useCursorPagination ? currentCursor : undefined,
    enableStreaming: useCursorPagination // Enable streaming for cursor-based pagination
  });
  
  const { 
    totalCount: totalEventCount, 
    isLoading: isLoadingCount
  } = useEventCount({
    tenantId: tenantId || undefined,
    query: filters.query || undefined,
    startTime: filters.timeRange?.start_unix,
    endTime: filters.timeRange?.end_unix,
    sourceIp: filters.sourceIp || undefined,
    eventCategory: filters.eventCategory || undefined,
    eventOutcome: filters.eventOutcome || undefined,
    eventAction: filters.eventAction || undefined,
    sourceType: filters.sourceType || undefined
  });
  
  const { createEventSource } = useEventStream({ tenantId: tenantId || undefined });

  // Live stream management
  useEffect(() => {
    if (isLiveMode && !eventSource) {
      const source = createEventSource();
      
      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'event') {
            setLiveEvents(prev => {
              const newEvents = [data.event, ...prev];
              // Keep only last 1000 live events to prevent memory issues
              return newEvents.slice(0, 1000);
            });
          }
        } catch (error) {
          console.error('Failed to parse SSE data:', error);
        }
      };
      
      source.onerror = (error) => {
        console.error('SSE connection error:', error);
        setEventSource(null);
      };
      
      setEventSource(source);
    } else if (!isLiveMode && eventSource) {
      eventSource.close();
      setEventSource(null);
    }
    
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [isLiveMode, createEventSource]);

  // Auto-scroll effects
  useEffect(() => {
    if (autoScroll && isLiveMode && liveListRef.current && liveEvents.length > 0) {
      liveListRef.current.scrollToItem(0, 'start');
    }
  }, [liveEvents, autoScroll, isLiveMode]);

  // Automatically switch to cursor-based pagination for large datasets
  useEffect(() => {
    if (totalEventCount && totalEventCount > 100000) { // Switch to cursor pagination for datasets > 100k
      setUseCursorPagination(true);
      setCurrentPage(1); // Reset to first page when switching
      setCurrentCursor(undefined); // Reset cursor
    } else if (totalEventCount && totalEventCount <= 100000) {
      setUseCursorPagination(false);
      setCurrentCursor(undefined);
    }
  }, [totalEventCount]);

  // Navigation functions for cursor-based pagination
  const handleNextPage = useCallback(() => {
    if (useCursorPagination && nextCursor) {
      setCurrentCursor(nextCursor);
    } else if (!useCursorPagination) {
      setCurrentPage(prev => prev + 1);
    }
  }, [useCursorPagination, nextCursor]);

  const handlePreviousPage = useCallback(() => {
    if (useCursorPagination && previousCursor) {
      setCurrentCursor(previousCursor);
    } else if (!useCursorPagination && currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  }, [useCursorPagination, previousCursor, currentPage]);

  const canGoNext = useCursorPagination ? !!nextCursor : (currentPage * pageSize < (historicalCount || 0));
  const canGoPrevious = useCursorPagination ? !!previousCursor : currentPage > 1;

  useEffect(() => {
    if (autoScroll && !isLiveMode && listRef.current && historicalEvents.length > 0) {
      listRef.current.scrollToItem(historicalEvents.length - 1, 'end');
    }
  }, [historicalEvents, autoScroll, isLiveMode]);

  // Event handlers
  const handleFilterChange = useCallback((key: keyof FilterState, value: any) => {
    // Convert 'all' to empty string for API compatibility
    const processedValue = value === 'all' ? '' : value;
    setFilters(prev => ({ ...prev, [key]: processedValue }));
    setCurrentPage(1); // Reset to first page when filters change
  }, []);

  const handleTimeRangePreset = useCallback((preset: TimeRange) => {
    handleFilterChange('timeRange', preset);
  }, [handleFilterChange]);

  const toggleLiveMode = useCallback(() => {
    setIsLiveMode(prev => !prev);
    if (!isLiveMode) {
      setLiveEvents([]); // Clear live events when entering live mode
    }
  }, [isLiveMode]);

  const clearAllFilters = useCallback(() => {
    setFilters({
      query: '',
      timeRange: TIME_RANGE_PRESETS[1].getValue(),
      sourceIp: '',
      eventCategory: '',
      eventOutcome: '',
      eventAction: '',
      sourceType: ''
    });
    setCurrentPage(1);
    setCurrentCursor(undefined); // Reset cursor when clearing filters
  }, []);

  // Utility functions
  const getSeverityColor = (outcome: string) => {
    switch (outcome?.toLowerCase()) {
      case 'success': return 'bg-green-100 text-green-800';
      case 'failure': return 'bg-red-100 text-red-800';
      case 'unknown': return 'bg-gray-100 text-gray-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  // Event row renderer
  const EventRow = ({ index, style, data }: { index: number; style: any; data: Event[] }) => {
    const event = data[index];
    if (!event) return null;

    return (
      <div style={style} className="flex items-center space-x-4 p-2 border-b border-gray-200 hover:bg-gray-50">
        <div className="flex-shrink-0 w-32 text-xs text-gray-500">
          {formatTimestamp(event.event_timestamp)}
        </div>
        <div className="flex-shrink-0 w-24">
          <Badge className={getSeverityColor(event.event_outcome)}>
            {event.event_outcome}
          </Badge>
        </div>
        <div className="flex-shrink-0 w-32 text-sm">
          {event.source_ip}
        </div>
        <div className="flex-shrink-0 w-32 text-sm">
          {event.event_category}
        </div>
        <div className="flex-shrink-0 w-32 text-sm">
          {event.event_action}
        </div>
        <div className="flex-1 text-sm truncate">
          {event.source_type}
        </div>
        <div className="flex-shrink-0 w-16">
          {event.is_threat === 1 && (
            <Badge className="bg-red-100 text-red-800">Threat</Badge>
          )}
        </div>
      </div>
    );
  };

  const currentEvents = isLiveMode ? liveEvents : historicalEvents;
  const currentCount = isLiveMode ? liveEvents.length : totalEventCount;
  const totalPages = Math.ceil(historicalCount / pageSize);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header with stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoadingCount ? '...' : currentCount.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Live Buffer</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {liveEvents.length.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Connection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <div className={cn(
                'w-2 h-2 rounded-full',
                eventSource ? 'bg-green-500' : 'bg-red-500'
              )} />
              <span className="text-sm">
                {eventSource ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Mode</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Switch
                 checked={isLiveMode}
                 onChange={toggleLiveMode}
               />
              <span className="text-sm">
                {isLiveMode ? 'Live' : 'Historical'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <Input
                placeholder="Search events..."
                value={filters.query}
                onChange={(e) => handleFilterChange('query', e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Source IP</label>
              <Input
                placeholder="e.g., 192.168.1.1"
                value={filters.sourceIp}
                onChange={(e) => handleFilterChange('sourceIp', e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Event Category</label>
              <Input
                placeholder="e.g., authentication"
                value={filters.eventCategory}
                onChange={(e) => handleFilterChange('eventCategory', e.target.value)}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Event Outcome</label>
              <Select
                value={filters.eventOutcome || 'all'}
                onValueChange={(value) => handleFilterChange('eventOutcome', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failure">Failure</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Time Range</label>
              <Select
                value={TIME_RANGE_PRESETS.findIndex(p => 
                  p.getValue().start_unix === filters.timeRange?.start_unix
                ).toString()}
                onValueChange={(value) => {
                  const preset = TIME_RANGE_PRESETS[parseInt(value)];
                  if (preset) {
                    handleTimeRangePreset(preset.getValue());
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGE_PRESETS.map((preset, index) => (
                    <SelectItem key={index} value={index.toString()}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Actions</label>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearAllFilters}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Clear
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAutoScroll(!autoScroll)}
                >
                  {autoScroll ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                  Auto-scroll
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4" />
              <span>{isLiveMode ? 'Live Events' : 'Historical Events'}</span>
            </div>
            {!isLiveMode && (
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousPage}
                  disabled={!canGoPrevious}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm">
                  {useCursorPagination ? (
                    `Showing ${historicalEvents.length} events ${totalEventCount ? `(${totalEventCount.toLocaleString()} total)` : ''}`
                  ) : (
                    `Page ${currentPage} of ${totalPages}`
                  )}
                  {useCursorPagination && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      Optimized for large dataset
                    </Badge>
                  )}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={!canGoNext}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Table Header */}
          <div className="flex items-center space-x-4 p-2 border-b-2 border-gray-300 font-medium text-sm bg-gray-50">
            <div className="flex-shrink-0 w-32">Timestamp</div>
            <div className="flex-shrink-0 w-24">Outcome</div>
            <div className="flex-shrink-0 w-32">Source IP</div>
            <div className="flex-shrink-0 w-32">Category</div>
            <div className="flex-shrink-0 w-32">Action</div>
            <div className="flex-1">Source Type</div>
            <div className="flex-shrink-0 w-16">Threat</div>
          </div>
          
          {/* Events List */}
          {isLoadingEvents ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-500">Loading events...</div>
            </div>
          ) : currentEvents.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-500">No events found</div>
            </div>
          ) : (
            <List
               ref={isLiveMode ? liveListRef : listRef}
               height={400}
               width="100%"
               itemCount={currentEvents.length}
               itemSize={60}
               itemData={currentEvents}
             >
               {EventRow}
             </List>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LogActivities;