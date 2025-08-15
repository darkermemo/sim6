'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { compileSearch } from '@/lib/api';
import { 
  Search, 
  Play, 
  Square, 
  Zap, 
  Clock, 
  Users, 
  X, 
  Loader2,
  Eye 
} from 'lucide-react';

export interface QueryBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onExecute: () => void;
  isExecuting: boolean;
  isStreaming: boolean;
  onStreamingToggle: (enabled: boolean) => void;
  timeRange: number; // seconds
  onTimeRangeChange: (seconds: number) => void;
  tenantId: string;
  onTenantChange: (tenantId: string) => void;
  onClear: () => void;
  // Optional SQL preview
  onShowSqlPreview?: (sql: string) => void;
}

const TIME_RANGES = [
  { label: 'Last 5 min', value: 300 },
  { label: 'Last 10 min', value: 600 },
  { label: 'Last 15 min', value: 900 },
  { label: 'Last 30 min', value: 1800 },
  { label: 'Last 1 hour', value: 3600 },
  { label: 'Last 4 hours', value: 14400 },
  { label: 'Last 6 hours', value: 21600 },
  { label: 'Last 12 hours', value: 43200 },
  { label: 'Last 24 hours', value: 86400 },
  { label: 'Last 3 days', value: 259200 },
  { label: 'Last 7 days', value: 604800 },
  { label: 'Last 30 days', value: 2592000 },
  { label: 'Last 90 days', value: 7776000 },
  { label: 'Last 6 months', value: 15552000 },
  { label: 'Last 1 year', value: 31536000 },
];

const TENANTS = [
  { label: 'Default', value: 'default' },
  { label: 'Production', value: 'prod' },
  { label: 'Development', value: 'dev' },
];

export function QueryBar({
  query,
  onQueryChange,
  onExecute,
  isExecuting,
  isStreaming,
  onStreamingToggle,
  timeRange,
  onTimeRangeChange,
  tenantId,
  onTenantChange,
  onClear,
  onShowSqlPreview
}: QueryBarProps) {
  const [sqlPreview, setSqlPreview] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);

  // Auto-compile SQL for preview when query changes
  useEffect(() => {
    if (!query.trim()) {
      setSqlPreview('');
      return;
    }

    const timer = setTimeout(async () => {
      if (onShowSqlPreview) {
        setPreviewLoading(true);
        try {
          const result = await compileSearch(query, tenantId);
          setSqlPreview(result.sql);
        } catch (error) {
          console.warn('SQL preview failed:', error);
          setSqlPreview('-- SQL preview unavailable');
        } finally {
          setPreviewLoading(false);
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query, tenantId, onShowSqlPreview]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onExecute();
    }
  };

  const handleSqlPreview = () => {
    if (onShowSqlPreview && sqlPreview) {
      onShowSqlPreview(sqlPreview);
    }
  };

  const selectedTimeRange = TIME_RANGES.find(r => r.value === timeRange);

  return (
    <div className="bg-white dark:bg-slate-800 border rounded-lg p-4 space-y-4">
      {/* Main Search Row */}
      <div className="flex items-center gap-3">
        {/* Search Input */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search events... (e.g., source:auth severity:high user:alice)"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-10 h-10"
          />
        </div>

        {/* Run Button */}
        <Button 
          onClick={onExecute} 
          disabled={isExecuting}
          className="gap-2 px-6"
        >
          {isExecuting ? (
            <>
              <Square className="h-4 w-4" />
              Stop
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Run
            </>
          )}
        </Button>

        {/* Streaming Toggle */}
        <Button
          variant={isStreaming ? "default" : "outline"}
          onClick={() => onStreamingToggle(!isStreaming)}
          className="gap-2"
        >
          <Zap className="h-4 w-4" />
          {isStreaming ? 'Live' : 'Static'}
        </Button>

        {/* Clear Button */}
        <Button
          variant="ghost"
          onClick={onClear}
          className="gap-2"
        >
          <X className="h-4 w-4" />
          Clear
        </Button>
      </div>

      {/* Controls Row */}
      <div className="flex items-center gap-4">
        {/* Time Range */}
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-500" />
          <Select value={timeRange.toString()} onValueChange={(v) => onTimeRangeChange(parseInt(v))}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGES.map(range => (
                <SelectItem key={range.value} value={range.value.toString()}>
                  {range.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tenant Selector */}
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-500" />
          <Select value={tenantId} onValueChange={onTenantChange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TENANTS.map(tenant => (
                <SelectItem key={tenant.value} value={tenant.value}>
                  {tenant.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Time Range Badge */}
        {selectedTimeRange && (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            {selectedTimeRange.label}
          </Badge>
        )}

        {/* SQL Preview Button */}
        {onShowSqlPreview && query.trim() && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSqlPreview}
            disabled={previewLoading || !sqlPreview}
            className="gap-2 ml-auto"
          >
            {previewLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Eye className="h-3 w-3" />
            )}
            SQL Preview
          </Button>
        )}
      </div>
    </div>
  );
}