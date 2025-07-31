import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, RefreshCw, X } from 'lucide-react';
import type { Event, EventFilters } from '@/schemas/events-validation';

const EventsPage: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<EventFilters>({
    severity: undefined,
    source_type: undefined,
    search: undefined,
    limit: 100,
  });
  const [searchInput, setSearchInput] = useState('');

  const fetchEvents = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      if (filters.severity) params.append('severity', filters.severity);
      if (filters.source_type) params.append('source_type', filters.source_type);
      if (filters.search) params.append('search', filters.search);
      
      if (filters.limit) params.append('limit', filters.limit.toString());
      
      const response = await fetch(`/api/events?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch events');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [filters]);

  const handleSearch = () => {
    setFilters(prev => ({
      ...prev,
      search: searchInput || undefined,
    }));
  };

  const handleRefresh = () => {
    fetchEvents();
  };

  const handleClearFilters = () => {
    setFilters({
      severity: undefined,
      source_type: undefined,
      search: undefined,
      limit: 100,
    });
    setSearchInput('');
  };

  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getSeverityBadgeVariant = (severity: string): 'default' | 'secondary' | 'outline' => {
    switch (severity.toLowerCase()) {
      case 'critical':
      case 'high':
        return 'secondary';
      case 'medium':
        return 'outline';
      case 'low':
      case 'info':
        return 'default';
      default:
        return 'default';
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-red-600">
              Error loading events: {error}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Recent Events</h1>
        <Button onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <div className="flex space-x-2">
                <Input
                  placeholder="Search events..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button onClick={handleSearch} size="sm">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Severity</label>
              <Select
                value={filters.severity || ''}
                onValueChange={(value) => setFilters(prev => ({ ...prev, severity: value || undefined }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All severities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Source Type</label>
              <Select
                value={filters.source_type || ''}
                onValueChange={(value) => setFilters(prev => ({ ...prev, source_type: value || undefined }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All source types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All source types</SelectItem>
                  <SelectItem value="firewall">Firewall</SelectItem>
                  <SelectItem value="web_server">Web Server</SelectItem>
                  <SelectItem value="database">Database</SelectItem>
                  <SelectItem value="application">Application</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Actions</label>
              <Button onClick={handleClearFilters} variant="outline" className="w-full">
                <X className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Events {events && `(${events.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading events...</p>
            </div>
          ) : events && events.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Event ID</TableHead>
                    <TableHead>Tenant ID</TableHead>
                    <TableHead>Source IP</TableHead>
                    <TableHead>Source Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.event_id}>
                      <TableCell className="font-mono text-sm">
                        {formatTimestamp(event.event_timestamp)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {event.event_id}
                      </TableCell>
                      <TableCell>{event.tenant_id}</TableCell>
                      <TableCell className="font-mono">{event.source_ip}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{event.source_type}</Badge>
                      </TableCell>
                      <TableCell>
                        {event.severity ? (
                          <Badge variant={getSeverityBadgeVariant(event.severity)}>
                            {event.severity}
                          </Badge>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-md truncate">
                        {event.message || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No events found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EventsPage;