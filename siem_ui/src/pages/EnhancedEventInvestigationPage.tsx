import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  Filter,
  Plus,
  X,
  RefreshCw,
  Play,
  Pause,
  Download,
  AlertCircle,
  Clock,
  Activity,
  Database,
  Eye,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown
} from 'lucide-react';
import { useLogStream } from '../hooks/useLogStream';
import { useEventFilters } from '../stores/eventFiltersStore';
import { useDashboard } from '../hooks/useDashboard';
import { EventFilter, TIME_RANGE_PRESETS, COMMON_FIELDS, FILTER_OPERATORS } from '../types/events';

// Removed unused ConnectionStatus interface

// Helper function to format bytes
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const EnhancedEventInvestigationPage: React.FC = () => {
  // State management
  const [searchText, setSearchText] = useState('');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [realtimeEventCount, setRealtimeEventCount] = useState(0);
  // Removed unused connectionStatus state
  const [newFilter, setNewFilter] = useState<EventFilter>({
    field: '',
    operator: '=',
    value: ''
  });

  // Debounced search functionality
  const searchTimeoutRef = useRef<number | null>(null);

  // Event filters store
  const {
    filters,
    freeText,
    sortConfig,
    addFilter,
    removeFilter,
    setTimeRange,
    setFreeText,
    setSortConfig,
    clearAllFilters,
  } = useEventFilters();

  // Log stream hook
  const {
    events,
    totalCount,
    hasMore,
    loading,
    error,
    refresh,
    isStreaming,
  } = useLogStream({ liveMode: isLiveMode });
  
  // Debug logging
  useEffect(() => {
    console.log('Events in component:', events.length, 'Total count:', totalCount);
  }, [events.length, totalCount]);

  // Dashboard data hook for additional metrics
  const {
    data: dashboardData,
    loading: dashboardLoading,
    refetch: refetchDashboard
  } = useDashboard();

  // Track real-time events
  const prevEventsLengthRef = useRef(events.length);
  useEffect(() => {
    if (isLiveMode && isStreaming && events.length > prevEventsLengthRef.current) {
      const newEventsCount = events.length - prevEventsLengthRef.current;
      setRealtimeEventCount(prev => prev + newEventsCount);
    }
    prevEventsLengthRef.current = events.length;
  }, [events.length, isLiveMode, isStreaming]);

  // Auto-refresh dashboard data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetchDashboard();
    }, 30000);

    return () => clearInterval(interval);
  }, [refetchDashboard]);

  // Auto-search when freeText changes (debounced)
  useEffect(() => {
    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Set new timeout for auto-search
    searchTimeoutRef.current = window.setTimeout(() => {
      if (freeText.trim() !== '') {
        refresh();
      }
    }, 1000); // 1 second delay
    
    // Cleanup timeout on unmount
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [freeText, refresh]);

  // Handle search input change
  const handleSearchChange = useCallback((value: string) => {
    setSearchText(value);
    setFreeText(value);
  }, [setFreeText]);

  // Handle live mode toggle
  const handleLiveModeToggle = useCallback(() => {
    const newLiveMode = !isLiveMode;
    setIsLiveMode(newLiveMode);
    
    if (newLiveMode) {
      // Reset real-time counter when entering live mode
      setRealtimeEventCount(0);
    }
  }, [isLiveMode]);

  // Handle manual refresh
  const handleRefresh = useCallback(() => {
    if (!isLiveMode) {
      refresh();
    }
  }, [refresh, isLiveMode]);

  // Handle filter addition
  const handleAddFilter = useCallback(() => {
    if (newFilter.field && (newFilter.value || ['exists', 'not_exists'].includes(newFilter.operator))) {
      addFilter(newFilter);
      setNewFilter({ field: '', operator: '=', value: '' });
      setIsFilterModalOpen(false);
    }
  }, [newFilter, addFilter]);

  // Handle column sorting
  const handleSort = useCallback((field: string) => {
    const newDirection = sortConfig.field === field && sortConfig.direction === 'desc' ? 'asc' : 'desc';
    setSortConfig({ field, direction: newDirection });
  }, [sortConfig, setSortConfig]);

  // Get sort icon for column
  const getSortIcon = useCallback((field: string) => {
    if (sortConfig.field !== field) {
      return <ChevronsUpDown className="w-4 h-4 text-gray-400" />;
    }
    return sortConfig.direction === 'asc' ? 
      <ChevronUp className="w-4 h-4 text-blue-500" /> : 
      <ChevronDown className="w-4 h-4 text-blue-500" />;
  }, [sortConfig]);

  // Handle export
  const handleExport = useCallback(() => {
    const csvContent = [
      // CSV header
      'Timestamp,Tenant ID,Source IP,Category,Action,Outcome,Raw Event',
      // CSV data
      ...events.map(event => [
        new Date(event.event_timestamp * 1000).toISOString(),
        event.tenant_id,
        event.source_ip,
        event.event_category,
        event.event_action,
        event.event_outcome,
        `"${event.raw_event.replace(/"/g, '""')}"`, // Escape quotes
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `siem-events-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [events]);

  // Format timestamp
  const formatTimestamp = (timestamp: number) => {
    // Handle invalid timestamps (0 or very small values)
    if (!timestamp || timestamp < 1000000000) {
      return 'Invalid Date';
    }
    return new Date(timestamp * 1000).toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  // Get connection status indicator
  const getConnectionStatusColor = () => {
    if (!isLiveMode) return 'bg-gray-400';
    return isStreaming ? 'bg-green-400' : 'bg-red-400';
  };

  return (
    <div className="p-6 space-y-6 min-h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-text">Enhanced Event Investigation</h1>
          <p className="text-secondary-text mt-1">
            Advanced security event analysis with real-time streaming and enhanced search capabilities
          </p>
        </div>
        <div className="flex items-center space-x-4 text-sm text-secondary-text">
          <div className="flex items-center space-x-1">
            <div className={`w-2 h-2 rounded-full ${
              loading ? 'bg-yellow-400 animate-pulse' : getConnectionStatusColor()
            }`} />
            <span>{isLiveMode ? 'Live Stream' : 'Static View'}</span>
          </div>
          {totalCount > 0 && (
            <span>• {totalCount.toLocaleString()} events</span>
          )}
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-blue-500" />
            <div>
              <div className="text-lg font-semibold text-primary-text">
                {totalCount.toLocaleString()}
                {isLiveMode && realtimeEventCount > 0 && (
                  <span className="ml-2 text-sm text-green-600 font-normal">
                    (+{realtimeEventCount} live)
                  </span>
                )}
              </div>
              <div className="text-sm text-secondary-text">
                {isLiveMode ? 'Total Events (Real-time)' : 'Total Events'}
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center space-x-2">
            <Eye className="w-5 h-5 text-green-500" />
            <div>
              <div className="text-lg font-semibold text-primary-text">
                {events.length.toLocaleString()}
              </div>
              <div className="text-sm text-secondary-text">Displayed Events</div>
            </div>
          </div>
        </div>
        
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-purple-500" />
            <div>
              <div className="text-lg font-semibold text-primary-text">
                {isLiveMode ? 'Live' : 'Static'}
              </div>
              <div className="text-sm text-secondary-text">Stream Mode</div>
            </div>
          </div>
        </div>
        
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-orange-500" />
            <div>
              <div className="text-lg font-semibold text-primary-text">
                {filters.length}
              </div>
              <div className="text-sm text-secondary-text">Active Filters</div>
            </div>
          </div>
        </div>

        {/* New Dashboard Metrics Cards */}
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-yellow-500" />
            <div>
              <div className="text-lg font-semibold text-primary-text">
                {dashboardLoading ? '...' : dashboardData?.kpis.queue_counter.toLocaleString() || '0'}
              </div>
              <div className="text-sm text-secondary-text">Queue Counter</div>
            </div>
          </div>
        </div>
        
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-red-500" />
            <div>
              <div className="text-lg font-semibold text-primary-text">
                {dashboardLoading ? '...' : formatBytes(dashboardData?.kpis.total_storage_bytes || 0)}
              </div>
              <div className="text-sm text-secondary-text">Total Storage</div>
            </div>
          </div>
        </div>
        
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-indigo-500" />
            <div>
              <div className="text-lg font-semibold text-primary-text">
                {dashboardLoading ? '...' : formatBytes(dashboardData?.kpis.filtered_storage_bytes || 0)}
              </div>
              <div className="text-sm text-secondary-text">Filtered Storage</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-card rounded-lg border border-border p-4 space-y-4">
        {/* Top Row: Time Range and Search */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center space-y-4 lg:space-y-0 lg:space-x-4">
          <div className="flex-shrink-0">
            <select 
              className="px-3 py-2 border border-border bg-card text-primary-text rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onChange={(e) => {
                const selectedLabel = e.target.value;
                const preset = TIME_RANGE_PRESETS.find(p => p.label === selectedLabel);
                if (preset) {
                  setTimeRange(preset.getValue());
                }
              }}
            >
              {TIME_RANGE_PRESETS.map((preset) => (
                <option key={preset.label} value={preset.label}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-secondary-text w-4 h-4" />
            <input
              type="text"
              placeholder="Search events (supports multi-word queries)..."
              value={searchText}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-10 py-2 border border-border bg-card text-primary-text rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchText && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-secondary-text hover:text-primary-text"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleLiveModeToggle}
              disabled={loading}
              className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isLiveMode
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isLiveMode ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isLiveMode ? 'Stop' : 'Live'}</span>
            </button>
            
            <button
              onClick={handleRefresh}
              disabled={loading || isLiveMode}
              className="flex items-center space-x-1 px-3 py-2 border border-border bg-card text-primary-text rounded-md hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            
            <button
              onClick={() => setIsFilterModalOpen(true)}
              className="flex items-center space-x-1 px-3 py-2 border border-border bg-card text-primary-text rounded-md hover:bg-border"
            >
              <Filter className="w-4 h-4" />
              <span>Filter</span>
            </button>
            
            <button
              onClick={handleExport}
              disabled={events.length === 0}
              className="flex items-center space-x-1 px-3 py-2 border border-border bg-card text-primary-text rounded-md hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
            
            {(filters.length > 0 || freeText) && (
              <button
                onClick={clearAllFilters}
                className="flex items-center space-x-1 px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
              >
                <X className="w-4 h-4" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Applied Filters */}
        {(filters.length > 0 || freeText) && (
          <div className="flex flex-wrap gap-2">
            {freeText && (
              <div className="flex items-center space-x-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm">
                <span>Search: &quot;{freeText}&quot;</span>
                <button
                  onClick={() => {
                    setSearchText('');
                    setFreeText('');
                  }}
                  className="text-blue-600 hover:text-blue-800"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {filters.map((filter, index) => (
              <div key={index} className="flex items-center space-x-1 px-2 py-1 bg-purple-100 text-purple-800 rounded-md text-sm">
                <span>{filter.field} {filter.operator} &quot;{filter.value}&quot;</span>
                <button
                  onClick={() => removeFilter(index)}
                  className="text-purple-600 hover:text-purple-800"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-red-700">{error}</span>
          </div>
        </div>
      )}

      {/* Events Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-border">
              <tr>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider cursor-pointer hover:bg-border select-none"
                  onClick={() => handleSort('event_timestamp')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Timestamp</span>
                    {getSortIcon('event_timestamp')}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider cursor-pointer hover:bg-border select-none"
                  onClick={() => handleSort('tenant_id')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Tenant ID</span>
                    {getSortIcon('tenant_id')}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider cursor-pointer hover:bg-border select-none"
                  onClick={() => handleSort('source_ip')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Source IP</span>
                    {getSortIcon('source_ip')}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider cursor-pointer hover:bg-border select-none"
                  onClick={() => handleSort('event_category')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Category</span>
                    {getSortIcon('event_category')}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider cursor-pointer hover:bg-border select-none"
                  onClick={() => handleSort('event_action')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Action</span>
                    {getSortIcon('event_action')}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider cursor-pointer hover:bg-border select-none"
                  onClick={() => handleSort('event_outcome')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Outcome</span>
                    {getSortIcon('event_outcome')}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider">
                  Raw Event
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
                      <span className="text-secondary-text">Loading events...</span>
                    </div>
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center">
                    <span className="text-secondary-text">No events found matching your criteria</span>
                  </td>
                </tr>
              ) : (
                events.map((event, index) => (
                  <tr key={`${event.event_id}-${index}`} className="hover:bg-border">
                    <td className="px-4 py-3 text-sm font-mono text-primary-text">
                      {formatTimestamp(event.event_timestamp)}
                    </td>
                    <td className="px-4 py-3 text-sm text-primary-text">
                      {event.tenant_id}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-primary-text">
                      {event.source_ip}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        event.event_category === 'Unknown' 
                          ? 'bg-gray-100 text-gray-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {event.event_category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-primary-text">
                      {event.event_action}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        event.event_outcome === 'Success' 
                          ? 'bg-green-100 text-green-800'
                          : event.event_outcome === 'Failure'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {event.event_outcome}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-primary-text max-w-xs">
                      <div className="truncate" title={event.raw_event}>
                        {event.raw_event}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Load More Button */}
      {hasMore && !isLiveMode && (
        <div className="flex justify-center">
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 border border-border bg-card text-primary-text rounded-md hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            <span>{loading ? 'Loading...' : 'Load More Events'}</span>
          </button>
        </div>
      )}

      {/* Add Filter Modal */}
      {isFilterModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-primary-text">Add Filter</h3>
              <button
                onClick={() => setIsFilterModalOpen(false)}
                className="text-secondary-text hover:text-primary-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="filter-field" className="block text-sm font-medium text-primary-text mb-1">
                  Field
                </label>
                <select
                  id="filter-field"
                  value={newFilter.field}
                  onChange={(e) => setNewFilter({ ...newFilter, field: e.target.value })}
                  className="w-full px-3 py-2 border border-border bg-card text-primary-text rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select field...</option>
                  {COMMON_FIELDS.map((field) => (
                    <option key={field.value} value={field.value}>
                      {field.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label htmlFor="filter-operator" className="block text-sm font-medium text-primary-text mb-1">
                  Operator
                </label>
                <select
                  id="filter-operator"
                  value={newFilter.operator}
                  onChange={(e) => setNewFilter({ ...newFilter, operator: e.target.value })}
                  className="w-full px-3 py-2 border border-border bg-card text-primary-text rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {FILTER_OPERATORS.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label htmlFor="filter-value" className="block text-sm font-medium text-primary-text mb-1">
                  Value
                </label>
                <input
                  id="filter-value"
                  type="text"
                  value={newFilter.value}
                  onChange={(e) => setNewFilter({ ...newFilter, value: e.target.value })}
                  placeholder="Enter filter value..."
                  className="w-full px-3 py-2 border border-border bg-card text-primary-text rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={() => setIsFilterModalOpen(false)}
                className="px-4 py-2 border border-border bg-card text-primary-text rounded-md hover:bg-border"
              >
                Cancel
              </button>
              <button
                onClick={handleAddFilter}
                disabled={!newFilter.field || !newFilter.value}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Filter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedEventInvestigationPage;