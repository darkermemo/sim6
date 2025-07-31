/**
 * ClickHouse Search API Client
 * High-performance search service integration for SIEM UI
 */

import { SearchRequest, SearchResponse, SearchOptions } from '@/types/search';
import { Event } from '@/types/events';

// API Configuration
const CLICKHOUSE_SEARCH_BASE_URL = process.env.NEXT_PUBLIC_CLICKHOUSE_SEARCH_URL || 'http://localhost:8084';
const API_VERSION = 'v1';
const BASE_URL = `${CLICKHOUSE_SEARCH_BASE_URL}/api/${API_VERSION}`;

// Request timeout configuration
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const LONG_QUERY_TIMEOUT = 120000; // 2 minutes for complex queries

/**
 * Enhanced search API client for ClickHouse backend
 * Provides high-performance search with advanced features
 */
export class ClickHouseSearchApi {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private abortController: AbortController | null = null;

  constructor(baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void {
    this.defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Remove authentication token
   */
  clearAuthToken(): void {
    delete this.defaultHeaders['Authorization'];
  }

  /**
   * Cancel ongoing search request
   */
  cancelSearch(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Perform comprehensive search with full query capabilities
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    this.cancelSearch(); // Cancel any ongoing request
    this.abortController = new AbortController();

    const timeout = this.determineTimeout(request);
    const timeoutId = setTimeout(() => {
      this.abortController?.abort();
    }, timeout);

    try {
      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: this.defaultHeaders,
        body: JSON.stringify(request),
        signal: this.abortController.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data: SearchResponse = await response.json();
      return this.transformSearchResponse(data);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Search request was cancelled or timed out');
        }
        throw error;
      }
      throw new Error('An unexpected error occurred during search');
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Simple search with query parameters (GET request)
   */
  async simpleSearch(params: {
    query?: string;
    start?: string;
    end?: string;
    limit?: number;
    offset?: number;
    fields?: string[];
    sort?: string;
    filters?: Record<string, string>;
  }): Promise<SearchResponse> {
    const searchParams = new URLSearchParams();

    if (params.query) searchParams.set('q', params.query);
    if (params.start) searchParams.set('start', params.start);
    if (params.end) searchParams.set('end', params.end);
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.offset) searchParams.set('offset', params.offset.toString());
    if (params.fields) searchParams.set('fields', params.fields.join(','));
    if (params.sort) searchParams.set('sort', params.sort);

    // Add filters as individual parameters
    if (params.filters) {
      Object.entries(params.filters).forEach(([key, value]) => {
        searchParams.set(key, value);
      });
    }

    try {
      const response = await fetch(`${this.baseUrl}/search?${searchParams.toString()}`, {
        method: 'GET',
        headers: this.defaultHeaders,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data: SearchResponse = await response.json();
      return this.transformSearchResponse(data);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('An unexpected error occurred during simple search');
    }
  }

  /**
   * Get search suggestions and auto-completion
   */
  async getSuggestions(params: {
    query: string;
    field?: string;
    limit?: number;
  }): Promise<{ suggestions: string[]; field_suggestions: Record<string, string[]> }> {
    const searchParams = new URLSearchParams({
      query: params.query,
      ...(params.field && { field: params.field }),
      ...(params.limit && { limit: params.limit.toString() }),
    });

    try {
      const response = await fetch(`${this.baseUrl}/suggestions?${searchParams.toString()}`, {
        method: 'GET',
        headers: this.defaultHeaders,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.warn('Failed to get search suggestions:', error);
      return { suggestions: [], field_suggestions: {} };
    }
  }

  /**
   * Get database schema information
   */
  async getSchema(): Promise<{
    tables: Record<string, { columns: Record<string, string>; indexes: string[] }>;
    fields: Record<string, { type: string; searchable: boolean; aggregatable: boolean }>;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/schema`, {
        method: 'GET',
        headers: this.defaultHeaders,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.warn('Failed to get schema information:', error);
      return { tables: {}, fields: {} };
    }
  }

  /**
   * Get service health status
   */
  async getHealth(): Promise<{
    status: string;
    version: string;
    uptime_seconds: number;
    clickhouse: { status: string; version: string; active_connections: number };
    redis: { status: string; memory_usage: string };
  }> {
    try {
      const response = await fetch(`${this.baseUrl.replace('/api/v1', '')}/health`, {
        method: 'GET',
        headers: this.defaultHeaders,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(`Health check failed: ${error}`);
    }
  }

  /**
   * Get service status with detailed information
   */
  async getStatus(): Promise<{
    service: string;
    version: string;
    uptime: string;
    database: { status: string; query_count: number; avg_query_time: number };
    cache: { status: string; hit_rate: number; memory_usage: string };
    performance: { active_queries: number; queue_size: number; avg_response_time: number };
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/status`, {
        method: 'GET',
        headers: this.defaultHeaders,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(`Status check failed: ${error}`);
    }
  }

  /**
   * Stream search results for large datasets
   */
  async *streamSearch(request: SearchRequest): AsyncGenerator<Event[], void, unknown> {
    const streamRequest = {
      ...request,
      options: {
        ...request.options,
        enable_streaming: true,
        stream_buffer_size: request.options?.stream_buffer_size || 1000,
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/search/stream`, {
        method: 'POST',
        headers: this.defaultHeaders,
        body: JSON.stringify(streamRequest),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const chunk = JSON.parse(line);
              if (chunk.hits && Array.isArray(chunk.hits)) {
                yield chunk.hits;
              }
            } catch (error) {
              console.warn('Failed to parse streaming chunk:', error);
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('An unexpected error occurred during streaming search');
    }
  }

  /**
   * Build search request from UI parameters
   */
  buildSearchRequest(params: {
    query?: string;
    timeRange?: { start: Date; end: Date };
    filters?: Array<{ field: string; operator: string; value: string | string[] }>;
    pagination?: { offset: number; limit: number };
    sorting?: Array<{ field: string; direction: 'asc' | 'desc' }>;
    fields?: string[];
    aggregations?: Array<{ name: string; type: string; field: string; size?: number }>;
    options?: Partial<SearchOptions>;
  }): SearchRequest {
    const request: SearchRequest = {
      tenant_id: '', // Will be set by the backend based on JWT token
      query: params.query,
      time_range: params.timeRange ? {
        start: params.timeRange.start.toISOString(),
        end: params.timeRange.end.toISOString(),
      } : undefined,
      filters: params.filters?.map(f => ({
        field: f.field,
        operator: f.operator as any,
        value: f.value,
      })) || [],
      pagination: params.pagination ? {
        offset: params.pagination.offset,
        limit: params.pagination.limit,
      } : undefined,
      sorting: params.sorting?.map(s => ({
        field: s.field,
        direction: s.direction,
      })) || [],
      fields: params.fields || [],
      aggregations: params.aggregations?.map(a => ({
        name: a.name,
        type: a.type as any,
        field: a.field,
        size: a.size,
      })) || [],
      options: {
        enable_highlighting: true,
        enable_caching: true,
        enable_query_optimization: true,
        max_results: 10000,
        timeout_seconds: 60,
        ...params.options,
      },
    };

    return request;
  }

  /**
   * Determine appropriate timeout based on request complexity
   */
  private determineTimeout(request: SearchRequest): number {
    let timeout = DEFAULT_TIMEOUT;

    // Increase timeout for complex queries
    if (request.aggregations && request.aggregations.length > 0) {
      timeout = LONG_QUERY_TIMEOUT;
    }

    // Increase timeout for large result sets
    if (request.pagination && request.pagination.limit > 1000) {
      timeout = LONG_QUERY_TIMEOUT;
    }

    // Increase timeout for wide time ranges
    if (request.time_range) {
      const start = new Date(request.time_range.start);
      const end = new Date(request.time_range.end);
      const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 7) {
        timeout = LONG_QUERY_TIMEOUT;
      }
    }

    return Math.min(timeout, request.options?.timeout_seconds ? request.options.timeout_seconds * 1000 : timeout);
  }

  /**
   * Transform search response to ensure compatibility
   */
  private transformSearchResponse(response: SearchResponse): SearchResponse {
    // Ensure hits are properly formatted as Event objects
    const transformedHits = response.hits.map((hit: any) => ({
      event_id: hit.event_id || `generated-${Date.now()}-${Math.random()}`,
      event_timestamp: typeof hit.event_timestamp === 'number' 
        ? new Date(hit.event_timestamp * 1000).toISOString()
        : hit.event_timestamp || new Date().toISOString(),
      event_category: hit.event_category || 'unknown',
      event_action: hit.event_action || 'unknown',
      event_outcome: hit.event_outcome,
      source_ip: hit.source_ip,
      destination_ip: hit.destination_ip,
      user_id: hit.user_id,
      user_name: hit.user_name,
      severity: hit.severity,
      message: hit.message,
      raw_event: hit.raw_event || JSON.stringify(hit),
      metadata: hit.metadata || {},
      ...hit, // Preserve any additional fields
    }));

    return {
      ...response,
      hits: transformedHits,
      metadata: {
        ...response.metadata,
        total_hits: response.metadata?.total_hits || 0,
        query_time_ms: response.metadata?.query_time_ms || 0,
        cached: response.metadata?.cached || false,
        query_id: response.metadata?.query_id || '',
        tenant_id: response.metadata?.tenant_id || '',
      },
    };
  }
}

// Create singleton instance
export const clickhouseSearchApi = new ClickHouseSearchApi();

// Helper functions for common search patterns
export const searchHelpers = {
  /**
   * Create a simple text search request
   */
  createTextSearch(query: string, timeRange?: { start: Date; end: Date }): SearchRequest {
    return clickhouseSearchApi.buildSearchRequest({
      query,
      timeRange,
      pagination: { offset: 0, limit: 100 },
      sorting: [{ field: 'timestamp', direction: 'desc' }],
    });
  },

  /**
   * Create an IP-based search request
   */
  createIpSearch(ip: string, timeRange?: { start: Date; end: Date }): SearchRequest {
    return clickhouseSearchApi.buildSearchRequest({
      filters: [
        { field: 'source_ip', operator: 'equals', value: ip },
        { field: 'destination_ip', operator: 'equals', value: ip },
      ],
      timeRange,
      pagination: { offset: 0, limit: 100 },
      sorting: [{ field: 'timestamp', direction: 'desc' }],
    });
  },

  /**
   * Create an event type search request
   */
  createEventTypeSearch(eventType: string, timeRange?: { start: Date; end: Date }): SearchRequest {
    return clickhouseSearchApi.buildSearchRequest({
      filters: [{ field: 'event_type', operator: 'equals', value: eventType }],
      timeRange,
      pagination: { offset: 0, limit: 100 },
      sorting: [{ field: 'timestamp', direction: 'desc' }],
    });
  },

  /**
   * Create a security events aggregation request
   */
  createSecurityAggregation(timeRange: { start: Date; end: Date }): SearchRequest {
    return clickhouseSearchApi.buildSearchRequest({
      timeRange,
      aggregations: [
        { name: 'events_by_type', type: 'terms', field: 'event_type', size: 10 },
        { name: 'events_by_severity', type: 'terms', field: 'severity', size: 5 },
        { name: 'top_source_ips', type: 'terms', field: 'source_ip', size: 10 },
        { name: 'events_over_time', type: 'date_histogram', field: 'timestamp' },
      ],
      pagination: { offset: 0, limit: 0 }, // Only aggregations, no individual hits
    });
  },
};

export default clickhouseSearchApi;