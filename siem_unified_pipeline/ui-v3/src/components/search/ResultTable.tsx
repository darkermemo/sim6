'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toDate, formatTimestamp } from '@/lib/api';
import { normalizeSeverity, severityColors } from '@/lib/severity';

/**
 * Generate stable row key from event data
 * Priority: event.id > event.event_id > event._id > hash(ts, src_ip, user)
 */
function getStableRowKey(event: any, index: number): string {
  if (event.id) return String(event.id);
  if (event.event_id) return String(event.event_id);
  if (event._id) return String(event._id);
  
  // Fallback: create stable hash from deterministic fields + index
  const parts = [
    event.timestamp || event.event_timestamp || '',
    event.source_ip || '',
    event.user || '',
    index
  ];
  return `event-${parts.join('-').replace(/[^a-zA-Z0-9-]/g, '_')}`;
}
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Eye,
  Download,
  Settings,
  Columns,
  Clock,
  User,
  Globe,
  Shield,
  Database
} from 'lucide-react';
import { EventSummary } from '@/types/api';

export interface ResultTableProps {
  events: EventSummary[];
  loading: boolean;
  onRowClick: (event: EventSummary) => void;
  maxHeight?: string;
}

const ALL_COLUMNS = [
  { key: 'timestamp', label: 'Time', width: '160px', essential: true },
  { key: 'severity', label: 'Severity', width: '100px', essential: true },
  { key: 'event_type', label: 'Event Type', width: '150px', essential: true },
  { key: 'source', label: 'Source', width: '120px', essential: false },
  { key: 'message', label: 'Message', width: 'auto', essential: true },
  { key: 'source_ip', label: 'Source IP', width: '120px', essential: false },
  { key: 'destination_ip', label: 'Dest IP', width: '120px', essential: false },
  { key: 'user', label: 'User', width: '100px', essential: false },
  { key: 'host', label: 'Host', width: '120px', essential: false },
];

export function ResultTable({ events, loading, onRowClick, maxHeight = '600px' }: ResultTableProps) {
  const [visibleColumns, setVisibleColumns] = useState(
    new Set(ALL_COLUMNS.filter(col => col.essential).map(col => col.key))
  );

  // Memoize formatted events for performance
  const formattedEvents = useMemo(() => {
    return events.map(event => {
      // Safe timestamp parsing - try new tsIso field first, then fallback to timestamp
      const timestamp = event.tsIso || event.timestamp;
      let formattedTime = '—';
      if (timestamp) {
        formattedTime = formatTimestamp(timestamp, 'Invalid Date');
      }
      
      return {
        ...event,
        formattedTime,
        normalizedSeverity: normalizeSeverity(event.severity || 'unknown'),
        message: event.message ?? (event as any).msg ?? (event as any).event ?? '(no message)',
        truncatedMessage: (() => {
          const msg = event.message ?? (event as any).msg ?? (event as any).event ?? '(no message)';
          return msg.length > 100 ? msg.substring(0, 100) + '...' : msg;
        })()
      };
    });
  }, [events]);

  const handleColumnToggle = useCallback((columnKey: string) => {
    setVisibleColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(columnKey)) {
        newSet.delete(columnKey);
      } else {
        newSet.add(columnKey);
      }
      return newSet;
    });
  }, []);

  const getSeverityBadgeClass = (severity: string) => {
    const normalizedSeverity = normalizeSeverity(severity);
    return severityColors[normalizedSeverity] || severityColors.unknown;
  };

  const getSourceIcon = (source: string) => {
    const lowerSource = source?.toLowerCase() || '';
    if (lowerSource.includes('auth')) return User;
    if (lowerSource.includes('web') || lowerSource.includes('http')) return Globe;
    if (lowerSource.includes('firewall') || lowerSource.includes('security')) return Shield;
    return Database;
  };

  const visibleColumnList = ALL_COLUMNS.filter(col => visibleColumns.has(col.key));

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-3/4"></div>
              <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/2"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Table */}
      <div className="overflow-auto max-h-[var(--table-max-h)]">
        <Table>
          <TableHeader className="bg-card text-card-foreground border-b border-border sticky top-0 z-10">
            <TableRow>
              {visibleColumnList.map(column => (
                <TableHead 
                  key={column.key} 
                  className="font-medium h-10"
                  data-width={column.width}
                >
                  {column.label}
                </TableHead>
              ))}
              <TableHead className="w-16">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {formattedEvents.length === 0 ? (
              <TableRow>
                <TableCell 
                  colSpan={visibleColumnList.length + 1} 
                  className="text-center py-8 text-muted-foreground"
                >
                  <Database className="h-8 w-8 mx-auto mb-2 " />
                  <p>No events found</p>
                </TableCell>
              </TableRow>
            ) : (
              formattedEvents.map((event, index) => {
                const SourceIcon = getSourceIcon(event.source);
                
                return (
                  <TableRow 
                    key={getStableRowKey(event, index)}
                    className="cursor-pointer hover:bg-muted transition-colors h-9"
                    onClick={() => onRowClick(event)}
                  >
                    {visibleColumns.has('timestamp') && (
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {event.formattedTime}
                        </div>
                      </TableCell>
                    )}
                    {visibleColumns.has('severity') && (
                      <TableCell>
                        <Badge className={getSeverityBadgeClass(event.severity)}>
                          {event.normalizedSeverity}
                        </Badge>
                      </TableCell>
                    )}
                    {visibleColumns.has('event_type') && (
                      <TableCell className="font-medium">{event.event_type}</TableCell>
                    )}
                    {visibleColumns.has('source') && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <SourceIcon className="h-3 w-3 text-muted-foreground" />
                          {event.source}
                        </div>
                      </TableCell>
                    )}
                    {visibleColumns.has('message') && (
                      <TableCell className="max-w-md">
                        <div className="truncate" title={event.message}>
                          {event.truncatedMessage}
                        </div>
                      </TableCell>
                    )}
                    {visibleColumns.has('source_ip') && (
                      <TableCell className="font-mono text-sm">
                        {event.source_ip || '-'}
                      </TableCell>
                    )}
                    {visibleColumns.has('destination_ip') && (
                      <TableCell className="font-mono text-sm">
                        {event.destination_ip || '-'}
                      </TableCell>
                    )}
                    {visibleColumns.has('user') && (
                      <TableCell>
                        {event.user ? (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            {event.user}
                          </div>
                        ) : '-'}
                      </TableCell>
                    )}
                    {visibleColumns.has('host') && (
                      <TableCell>{event.host || '-'}</TableCell>
                    )}
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRowClick(event);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

    </div>
  );
}