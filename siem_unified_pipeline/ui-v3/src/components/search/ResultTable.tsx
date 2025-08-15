'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { normalizeSeverity } from '@/lib/severity';
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
    return events.map(event => ({
      ...event,
      formattedTime: new Date(event.timestamp).toLocaleString(),
      normalizedSeverity: normalizeSeverity(event.severity),
      truncatedMessage: event.message.length > 100 
        ? event.message.substring(0, 100) + '...' 
        : event.message
    }));
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
    switch (normalizeSeverity(severity)) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'info': return 'bg-sky-100 text-sky-800 border-sky-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
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
      <div className="bg-card rounded-lg p-6">
        <div className="space-y-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-8 h-8 bg-muted rounded"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg shadow-lg overflow-hidden">
      {/* Table Header Controls */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Events</h3>
            <span className="text-sm text-muted-foreground">
              {events.length.toLocaleString()} results
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Columns className="h-4 w-4 mr-2" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {ALL_COLUMNS.map(column => (
                  <DropdownMenuCheckboxItem
                    key={column.key}
                    checked={visibleColumns.has(column.key)}
                    onCheckedChange={() => handleColumnToggle(column.key)}
                    disabled={column.essential && visibleColumns.has(column.key) && visibleColumns.size === 1}
                  >
                    {column.label}
                    {column.essential && <span className="ml-2 text-xs text-muted-foreground">(required)</span>}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Virtualized Table */}
      <div className="overflow-auto" style={{ maxHeight }}>
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              {visibleColumnList.map(column => (
                <TableHead 
                  key={column.key} 
                  style={{ width: column.width }}
                  className="font-medium"
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
                  <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No events found</p>
                </TableCell>
              </TableRow>
            ) : (
              formattedEvents.map((event, index) => {
                const SourceIcon = getSourceIcon(event.source);
                
                return (
                  <TableRow 
                    key={event.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
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

      {/* Table Footer with stats */}
      <div className="p-4 border-t border-border bg-muted/30">
        <div className="flex justify-between items-center text-sm text-muted-foreground">
          <span>
            Showing {formattedEvents.length} events
          </span>
          <span>
            Click any row to inspect details
          </span>
        </div>
      </div>
    </div>
  );
}