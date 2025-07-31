import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { DataTable } from './DataTable';
import { useEventsStore } from '../stores/eventsStore';
import { useEventStream } from '../hooks/useEventStream';
import { Event } from '../types/events';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { AlertCircle, Shield, Activity } from 'lucide-react';

interface LogActivitiesTableProps {
  height?: number;
  autoScroll?: boolean;
  maxRows?: number;
}

const LogActivitiesTable: React.FC<LogActivitiesTableProps> = ({
  height = 600,
  autoScroll = true,
  maxRows = 50,
}) => {
  const {
    events,
    filters,
    isLoading,
    error,
    appendEvents,
  } = useEventsStore();

  const tableRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(autoScroll);

  // Setup event stream
  const { isConnected, isConnecting, setOnEvent } = useEventStream({
    filters,
    autoReconnect: true,
    maxReconnectAttempts: 10,
  });

  // Handle incoming events from stream
  const handleNewEvent = useCallback((event: Event) => {
    appendEvents([event]);
    
    // Auto-scroll to bottom if enabled
    if (shouldAutoScroll.current && tableRef.current) {
      setTimeout(() => {
        tableRef.current?.scrollTo({
          top: tableRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
    }
  }, [appendEvents]);

  // Set up event handler
  useEffect(() => {
    setOnEvent(handleNewEvent);
  }, [setOnEvent, handleNewEvent]);

  // Limit events to maxRows for performance
  const displayEvents = useMemo(() => {
    return events.slice(-maxRows);
  }, [events, maxRows]);

  // Column definitions for the table
  const columns = useMemo(() => [
    {
      key: 'event_timestamp',
      label: 'Timestamp',
      render: (value: number) => (
        <span className="text-xs font-mono text-gray-600">
          {format(new Date(value * 1000), 'yyyy-MM-dd HH:mm:ss')}
        </span>
      ),
    },
    {
      key: 'source_ip',
      label: 'Source IP',
      render: (value: string) => (
        <span className="font-mono text-sm">{value}</span>
      ),
    },
    {
      key: 'source_type',
      label: 'Source Type',
      render: (value: string) => (
        <Badge variant="outline" className="text-xs">
          {value}
        </Badge>
      ),
    },
    {
      key: 'event_category',
      label: 'Category',
      render: (value: string) => (
        <Badge variant="secondary" className="text-xs">
          {value}
        </Badge>
      ),
    },
    {
      key: 'event_action',
      label: 'Action',
      render: (value: string) => (
        <span className="text-sm">{value}</span>
      ),
    },
    {
      key: 'event_outcome',
      label: 'Outcome',
      render: (value: string) => {
        const getOutcomeColor = (outcome: string) => {
          switch (outcome?.toLowerCase()) {
            case 'success': return 'text-green-600';
            case 'failure': return 'text-red-600';
            case 'unknown': return 'text-yellow-600';
            default: return 'text-gray-600';
          }
        };
        return (
          <span className={`text-sm font-medium ${getOutcomeColor(value)}`}>
            {value}
          </span>
        );
      },
    },
    {
      key: 'is_threat',
      label: 'Threat',
      render: (value: number) => {
        if (value === 1) {
          return (
            <div className="flex items-center space-x-1">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="text-red-600 text-xs font-medium">Yes</span>
            </div>
          );
        }
        return (
          <div className="flex items-center space-x-1">
            <Shield className="w-4 h-4 text-green-500" />
            <span className="text-green-600 text-xs font-medium">No</span>
          </div>
        );
      },
    },
  ], []);

  // Connection status indicator
  const ConnectionStatus = () => {
    if (isConnecting) {
      return (
        <div className="flex items-center space-x-2 text-yellow-600">
          <Activity className="w-4 h-4 animate-pulse" />
          <span className="text-sm">Connecting...</span>
        </div>
      );
    }
    
    if (isConnected) {
      return (
        <div className="flex items-center space-x-2 text-green-600">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm">Live Stream Active</span>
        </div>
      );
    }
    
    return (
      <div className="flex items-center space-x-2 text-red-600">
        <div className="w-2 h-2 bg-red-500 rounded-full" />
        <span className="text-sm">Disconnected</span>
      </div>
    );
  };

  if (error) {
    return (
      <Card className="p-6">
        <div className="flex items-center space-x-2 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <span>Error loading events: {error}</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col">
      {/* Header with connection status */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-semibold">Live Log Activities</h3>
          <span className="text-sm text-gray-500">
            {displayEvents.length} events (max {maxRows})
          </span>
        </div>
        <ConnectionStatus />
      </div>

      {/* Table header */}
      <div className="bg-gray-50 border-b border-gray-200">
        <div className="flex items-center px-4 py-3 space-x-4">
          {columns.map((column) => (
            <div key={column.key} className="flex-1 min-w-0">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                {column.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Events table */}
      <div className="flex-1 overflow-auto" ref={tableRef} style={{ height: height - 120 }}>
        <DataTable
          data={displayEvents}
          columns={columns}
          loading={isLoading}
          emptyMessage={isConnecting ? 'Connecting to event stream...' : 'No events to display'}
        />
      </div>

      {/* Footer with loading indicator */}
      {isLoading && (
        <div className="flex items-center justify-center py-2 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-2 text-gray-600 text-sm">
            <Activity className="w-4 h-4 animate-spin" />
            <span>Loading events...</span>
          </div>
        </div>
      )}
    </Card>
  );
};

export default LogActivitiesTable;