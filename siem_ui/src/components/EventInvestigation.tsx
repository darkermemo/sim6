import { useState } from 'react';
import { Clock, AlertTriangle, Download, Eye } from 'lucide-react';
import { VisualQueryBuilder } from './VisualQueryBuilder';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/hooks/useToast';
import { stopPropagation } from '@/lib/dom';
import { formatTimestamp } from '@/lib/utils';
import { useLogStream } from '@/hooks/useLogStream';
import { useEventFilters } from '@/stores/eventFiltersStore';
import { useTenants } from '@/hooks/useTenants';
import type { Event } from '@/types/events';

interface EventInvestigationProps {
  events?: Event[];
  loading?: boolean;
  error?: string | null;
  totalCount?: number;
  hasMore?: boolean;
  refresh?: () => void;
}

/**
 * EventInvestigation - Advanced event search and investigation interface
 * 
 * Features:
 * - Visual Query Builder with SPL-style syntax
 * - Real-time event search with ClickHouse backend
 * - Interactive results table with sorting and filtering
 * - Event detail viewing with raw data
 * - Export functionality for search results
 * 
 * @example
 * <EventInvestigation events={events} loading={loading} refresh={refresh} />
 */
export function EventInvestigation({
  events: propEvents,
  loading: propLoading,
  error: propError,
  totalCount: propTotalCount,
  refresh: propRefresh
}: EventInvestigationProps = {}) {
  const { toast } = useToast();
  
  // Use either props or hook data
  const {
    events: hookEvents,
    loading: hookLoading,
    error: hookError,
    totalCount: hookTotalCount,
    refresh: hookRefresh
  } = useLogStream();
  
  const {
    freeText,
    setFreeText
  } = useEventFilters();
  
  const { getTenantName } = useTenants();
  
  // Use props if provided, otherwise use hook data
  const events = propEvents || hookEvents;
  const loading = propLoading !== undefined ? propLoading : hookLoading;
  const error = propError !== undefined ? propError : hookError;
  const totalCount = propTotalCount !== undefined ? propTotalCount : hookTotalCount;

  const refresh = propRefresh || hookRefresh;
  
  // Display state
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showEventDetail, setShowEventDetail] = useState(false);

  // Handle search execution
  const handleSearch = async (query: string) => {
    if (query.trim()) {
      setFreeText(query.trim());
      if (refresh) {
        refresh();
      }
    }
  };

  // Handle event row click
  const handleEventClick = (event: Event) => {
    setSelectedEvent(event);
    setShowEventDetail(true);
  };



  // Handle export
  const handleExport = () => {
    if (!events || events.length === 0) return;
    
    const csvData = events.map(event => ({
      timestamp: formatTimestamp(event.event_timestamp),
      tenant: getTenantName(event.tenant_id),
      category: event.event_category,
      action: event.event_action,
      source_ip: event.source_ip || '',
      outcome: event.event_outcome || '',
      message: event.raw_event || ''
    }));

    // Create CSV content
    const headers = Object.keys(csvData[0]);
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => headers.map(header => `"${row[header as keyof typeof row]}"`).join(','))
    ].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `events_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Export Complete',
      description: `Exported ${events.length} events to CSV`,
      variant: 'success',
    });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary-text">Event Investigation</h1>
            <p className="text-secondary-text">
              Search and analyze security events using SPL-style queries
            </p>
          </div>
          
          {events && events.length > 0 && (
            <div className="flex items-center space-x-2">
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          )}
        </div>

        {/* Visual Query Builder */}
        <VisualQueryBuilder
          onSearch={handleSearch}
          isLoading={loading}
          placeholder='Enter search query (e.g., "failed admin" or "malware 192.168.1.1 block")'
        />

        {/* Error Display */}
        {error && (
          <Card>
            <div className="p-4 text-center">
              <AlertTriangle className="mx-auto h-12 w-12 text-red-400 mb-4" />
              <h3 className="text-lg font-medium text-primary-text mb-2">Error</h3>
              <p className="text-secondary-text">{error}</p>
            </div>
          </Card>
        )}

        {/* Search Results */}
        {events && events.length > 0 && (
          <Card>
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <h2 className="text-lg font-semibold text-primary-text">Search Results</h2>
                  <Badge variant="secondary">
                    {totalCount?.toLocaleString() || events.length.toLocaleString()} events
                  </Badge>
                  {loading && (
                    <Badge variant="outline">
                      Loading...
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Events Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider">
                      Tenant
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider">
                      Source IP
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider">
                      Outcome
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider">
                      Raw Event
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-secondary-text uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-background divide-y divide-border">
                  {events.map((event) => (
                    <tr
                      key={event.event_id}
                      onClick={() => handleEventClick(event)}
                      className="hover:bg-muted cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-sm text-primary-text">
                        <div className="flex items-center space-x-1">
                          <Clock className="h-3 w-3 text-gray-400" />
                          <span>{formatTimestamp(event.event_timestamp)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-primary-text">
                        <Badge variant="secondary" className="text-xs">
                          {getTenantName(event.tenant_id)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Badge variant="outline">{event.event_category}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-primary-text">
                        {event.event_action}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-primary-text">
                        {event.source_ip || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-primary-text">
                        {event.event_outcome || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-primary-text">
                        <div className="max-w-xs truncate">
                          {event.raw_event}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={stopPropagation(() => handleEventClick(event))}
                          className="h-6 w-6 p-0"
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Empty State */}
        {!events || (events.length === 0 && !loading) && (
          <Card>
            <div className="p-12 text-center">
              <AlertTriangle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-primary-text mb-2">No Events Found</h3>
              <p className="text-secondary-text mb-4">
                {freeText ? 'No events match your search criteria' : 'Enter a search query above to start investigating events'}
              </p>
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 text-left max-w-md mx-auto">
                <p className="text-sm text-blue-800 font-medium mb-2">Example Searches:</p>
                <ul className="text-xs text-blue-700 space-y-1">
                  <li>• <code>failed admin</code></li>
                  <li>• <code>malware 192.168.1.1 block</code></li>
                  <li>• <code>login authentication</code></li>
                  <li>• <code>network connection</code></li>
                </ul>
              </div>
            </div>
          </Card>
        )}

        {/* Loading State */}
        {loading && (!events || events.length === 0) && (
          <Card>
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <h3 className="text-lg font-medium text-primary-text mb-2">Loading Events</h3>
              <p className="text-secondary-text">
                Searching for events...
              </p>
            </div>
          </Card>
        )}

        {/* Event Detail Modal */}
        {showEventDetail && selectedEvent && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Event Details</h3>
                  <Button variant="ghost" onClick={() => setShowEventDetail(false)}>
                    ✕
                  </Button>
                </div>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-secondary-text">Event ID</label>
                    <p className="font-mono text-sm">{selectedEvent.event_id}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-secondary-text">Tenant</label>
                    <p className="text-sm">{getTenantName(selectedEvent.tenant_id)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-secondary-text">Timestamp</label>
                    <p className="text-sm">{formatTimestamp(selectedEvent.event_timestamp)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-secondary-text">Category</label>
                    <p className="text-sm">{selectedEvent.event_category}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-secondary-text">Action</label>
                    <p className="text-sm">{selectedEvent.event_action}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-secondary-text">Source IP</label>
                    <p className="text-sm">{selectedEvent.source_ip || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-secondary-text">Outcome</label>
                    <p className="text-sm">{selectedEvent.event_outcome || 'N/A'}</p>
                  </div>
                </div>
                {selectedEvent.raw_event && (
                  <div>
                    <label className="text-sm font-medium text-secondary-text">Raw Event</label>
                    <pre className="bg-gray-50 p-3 rounded-md text-xs font-mono overflow-x-auto border mt-2">
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(selectedEvent.raw_event), null, 2);
                        } catch (error) {
                          return selectedEvent.raw_event;
                        }
                      })()}
                    </pre>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}