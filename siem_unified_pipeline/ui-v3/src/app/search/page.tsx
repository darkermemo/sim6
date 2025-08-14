"use client";

import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { searchEvents, getEventById } from "@/lib/api";
import { EventSearchQuery, EventSearchResponse, EventDetail } from "@/types/api";
import { 
  Search, 
  Filter, 
  Calendar, 
  Download, 
  RefreshCw, 
  Settings,
  ChevronDown,
  Clock,
  AlertTriangle,
  Database,
  User,
  Globe,
  Shield,
  Eye,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

export default function SearchPage() {
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<EventSearchResponse | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [filters, setFilters] = useState<EventSearchQuery>({
    limit: 50,
    offset: 0
  });

  // UI state
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<string>("timestamp");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Search function
  const performSearch = async () => {
    if (!searchQuery.trim() && !Object.keys(filters).some(key => key !== 'limit' && key !== 'offset' && filters[key as keyof EventSearchQuery])) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const searchParams: EventSearchQuery = {
        ...filters,
        search: searchQuery.trim() || undefined,
      };

      const results = await searchEvents(searchParams);
      setSearchResults(results);
      setCurrentPage(1);
    } catch (err) {
      console.error('Search error:', err);
      setError('Search is temporarily unavailable. The backend search service is currently experiencing issues. Please try again later.');
      // Show empty results instead of breaking the UI
      setSearchResults({ 
        events: [], 
        total_count: 0, 
        page_info: { 
          limit: 50, 
          offset: 0, 
          has_next: false, 
          has_previous: false,
          total_pages: 0,
          current_page: 1
        }
      });
    } finally {
      setLoading(false);
    }
  };

  // Auto-search when query changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        performSearch();
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load some sample data on page load to show the interface
  useEffect(() => {
    // Don't auto-search on page load to avoid 500 errors
    // Instead, show an empty state encouraging the user to search
  }, []);

  // Handle event selection
  const handleEventClick = async (eventId: string) => {
    try {
      const eventDetail = await getEventById(eventId);
      setSelectedEvent(eventDetail);
    } catch (err) {
      console.error('Failed to fetch event details:', err);
    }
  };

  // Severity color mapping
  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Get source icon
  const getSourceIcon = (source: string) => {
    if (source.includes('auth')) return User;
    if (source.includes('web') || source.includes('http')) return Globe;
    if (source.includes('firewall') || source.includes('security')) return Shield;
    return Database;
  };

  // Time range options
  const timeRanges = [
    { label: "Last 15 minutes", value: "15m" },
    { label: "Last hour", value: "1h" },
    { label: "Last 4 hours", value: "4h" },
    { label: "Last 24 hours", value: "24h" },
    { label: "Last 7 days", value: "7d" },
    { label: "Custom", value: "custom" }
  ];

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900">
      <div className="p-6 space-y-6">
        {/* Search Header */}
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Event Search</h1>
            <p className="text-slate-600 dark:text-slate-400">
              Search and analyze security events across your infrastructure
            </p>
          </div>

          {/* Search Bar */}
          <Card className="border-0 shadow-lg bg-white dark:bg-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search events... (e.g., source:auth.service severity:high)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-12 text-base"
                    onKeyDown={(e) => e.key === 'Enter' && performSearch()}
                  />
                </div>
                <Button 
                  onClick={() => setShowFilters(!showFilters)}
                  variant="outline"
                  className="gap-2"
                >
                  <Filter className="h-4 w-4" />
                  Filters
                  <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                </Button>
                <Button onClick={performSearch} disabled={loading} className="gap-2">
                  {loading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Search
                </Button>
              </div>

              {/* Advanced Filters */}
              {showFilters && (
                <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Time Range
                      </label>
                      <Select value={filters.start_time ? "custom" : "24h"}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select range" />
                        </SelectTrigger>
                        <SelectContent>
                          {timeRanges.map(range => (
                            <SelectItem key={range.value} value={range.value}>
                              {range.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Severity
                      </label>
                      <Select 
                        value={filters.severity || ""} 
                        onValueChange={(value) => setFilters({...filters, severity: value || undefined})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Any severity" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Any severity</SelectItem>
                          <SelectItem value="Critical">Critical</SelectItem>
                          <SelectItem value="High">High</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="Low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Source
                      </label>
                      <Input
                        placeholder="Filter by source"
                        value={filters.source || ""}
                        onChange={(e) => setFilters({...filters, source: e.target.value || undefined})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        User
                      </label>
                      <Input
                        placeholder="Filter by user"
                        value={filters.user || ""}
                        onChange={(e) => setFilters({...filters, user: e.target.value || undefined})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Source IP
                      </label>
                      <Input
                        placeholder="Filter by IP"
                        value={filters.source_ip || ""}
                        onChange={(e) => setFilters({...filters, source_ip: e.target.value || undefined})}
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Error Display */}
        {error && (
          <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">Search Error</span>
              </div>
              <p className="text-sm text-red-600 dark:text-red-300 mt-1">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {loading ? (
          <SearchSkeleton />
        ) : searchResults ? (
          <Card className="border-0 shadow-lg bg-white dark:bg-slate-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                  <Database className="h-5 w-5 text-blue-600" />
                  Search Results
                  <Badge variant="outline" className="ml-2">
                    {searchResults.total_count.toLocaleString()} events
                  </Badge>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Settings className="h-4 w-4" />
                    Columns
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {searchResults.events.map((event) => {
                  const SourceIcon = getSourceIcon(event.source);
                  return (
                    <div
                      key={event.id}
                      className="p-4 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                      onClick={() => handleEventClick(event.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-600">
                            <SourceIcon className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge className={`text-xs px-2 py-1 ${getSeverityColor(event.severity)}`}>
                                {event.severity}
                              </Badge>
                              <span className="text-sm font-medium text-slate-900 dark:text-white">
                                {event.event_type}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {event.source}
                              </span>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                              {event.message}
                            </p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 dark:text-slate-400">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(event.timestamp).toLocaleString()}
                              </div>
                              {event.source_ip && (
                                <div className="flex items-center gap-1">
                                  <Globe className="h-3 w-3" />
                                  {event.source_ip}
                                </div>
                              )}
                              {event.user && (
                                <div className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {event.user}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="gap-1">
                          <Eye className="h-3 w-3" />
                          View
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {searchResults.page_info && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    Showing {((searchResults.page_info.current_page - 1) * searchResults.page_info.limit) + 1} to{' '}
                    {Math.min(searchResults.page_info.current_page * searchResults.page_info.limit, searchResults.total_count)} of{' '}
                    {searchResults.total_count.toLocaleString()} results
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!searchResults.page_info.has_previous}
                      className="gap-1"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!searchResults.page_info.has_next}
                      className="gap-1"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-0 shadow-lg bg-white dark:bg-slate-800">
            <CardContent className="p-12 text-center">
              <Search className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
                Start searching
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                Enter a search query above to find security events
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventDetailModal 
          event={selectedEvent} 
          onClose={() => setSelectedEvent(null)} 
        />
      )}
    </div>
  );
}

// Search loading skeleton
function SearchSkeleton() {
  return (
    <Card className="border-0 shadow-lg bg-white dark:bg-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 rounded-lg border border-slate-200 dark:border-slate-600">
              <div className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                  <div className="flex gap-4">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="h-8 w-16" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Event detail modal component (placeholder)
function EventDetailModal({ event, onClose }: { event: EventDetail; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Event Details</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ×
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400">ID</label>
                <p className="font-mono text-sm">{event.id}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400">Timestamp</label>
                <p>{new Date(event.timestamp).toLocaleString()}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400">Severity</label>
                <Badge className={getSeverityColorModal(event.severity)}>{event.severity}</Badge>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400">Source</label>
                <p>{event.source}</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-400">Message</label>
              <p className="mt-1">{event.message}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-400">Raw Message</label>
              <pre className="mt-1 p-3 bg-slate-100 dark:bg-slate-700 rounded-lg text-sm overflow-auto">
                {event.raw_message}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Helper function to define getSeverityColor within modal scope
function getSeverityColorModal(severity: string) {
  switch (severity.toLowerCase()) {
    case 'critical': return 'bg-red-100 text-red-800 border-red-200';
    case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}