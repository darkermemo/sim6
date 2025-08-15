'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { searchAggs } from '@/lib/api';
import { BarChart3, TrendingUp, Calendar } from 'lucide-react';

export interface TimelineProps {
  query: string;
  tenantId: string;
  timeRange: number;
  onTimeWindowChange: (startTime: number, endTime: number) => void;
}

interface TimelineData {
  timestamp: string;
  count: number;
  datetime: Date;
}

export function Timeline({
  query,
  tenantId,
  timeRange,
  onTimeWindowChange
}: TimelineProps) {
  const [data, setData] = useState<TimelineData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brushSelection, setBrushSelection] = useState<{start: number, end: number} | null>(null);

  // Load timeline data when query changes
  useEffect(() => {
    const loadTimeline = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await searchAggs(query || '', tenantId);
        
        // Transform aggregation data to timeline format
        const timelineData = (result.timeline || []).map((item: any) => ({
          timestamp: item.ts,
          count: parseInt(item.c) || 0,
          datetime: new Date(item.ts)
        }));

        setData(timelineData);
      } catch (err) {
        console.error('Timeline loading error:', err);
        setError('Failed to load timeline');
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    loadTimeline();
  }, [query, tenantId, timeRange]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (!data.length) return { total: 0, max: 0, avg: 0, trend: 0 };
    
    const total = data.reduce((sum, item) => sum + item.count, 0);
    const max = Math.max(...data.map(item => item.count));
    const avg = total / data.length;
    
    // Simple trend calculation (last half vs first half)
    const halfPoint = Math.floor(data.length / 2);
    const firstHalf = data.slice(0, halfPoint).reduce((sum, item) => sum + item.count, 0) / halfPoint;
    const secondHalf = data.slice(halfPoint).reduce((sum, item) => sum + item.count, 0) / (data.length - halfPoint);
    const trend = secondHalf - firstHalf;

    return { total, max, avg, trend };
  }, [data]);

  const handleBarClick = (item: TimelineData, index: number) => {
    // Create a time window around the clicked bar
    const windowSize = timeRange / data.length; // Size of each bucket
    const startTime = Math.floor(item.datetime.getTime() / 1000);
    const endTime = startTime + windowSize;
    
    onTimeWindowChange(startTime, endTime);
    setBrushSelection({ start: index, end: index + 1 });
  };

  const clearSelection = () => {
    setBrushSelection(null);
    // Reset to full time range
    const now = Math.floor(Date.now() / 1000);
    onTimeWindowChange(now - timeRange, now);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Event Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-20">
            {Array.from({ length: 24 }).map((_, i) => (
              <Skeleton key={i} className="flex-1 h-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Event Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Event Timeline
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {stats.total.toLocaleString()} events
            </span>
            <span className="flex items-center gap-1">
              <TrendingUp className={`h-3 w-3 ${stats.trend > 0 ? 'text-green-500' : 'text-red-500'}`} />
              {stats.trend > 0 ? '+' : ''}{stats.trend.toFixed(0)}/bucket
            </span>
            {brushSelection && (
              <button 
                onClick={clearSelection}
                className="text-blue-600 hover:underline"
              >
                Clear selection
              </button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <div className="space-y-2">
            {/* Timeline bars */}
            <div className="flex items-end gap-1 h-20 bg-slate-50 dark:bg-slate-800 rounded p-2">
              {data.map((item, index) => {
                const height = stats.max > 0 ? (item.count / stats.max) * 100 : 0;
                const isSelected = brushSelection && index >= brushSelection.start && index < brushSelection.end;
                
                return (
                  <div
                    key={item.timestamp}
                    className={`flex-1 cursor-pointer transition-colors relative group ${
                      isSelected 
                        ? 'bg-blue-500' 
                        : item.count > 0 
                          ? 'bg-blue-300 hover:bg-blue-400' 
                          : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                    style={{ height: `${Math.max(height, 2)}%` }}
                    onClick={() => handleBarClick(item, index)}
                    title={`${item.datetime.toLocaleString()}: ${item.count} events`}
                  >
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                      {item.datetime.toLocaleTimeString()}<br/>
                      {item.count} events
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time labels */}
            <div className="flex justify-between text-xs text-slate-500">
              {data.length > 0 && (
                <>
                  <span>{data[0]?.datetime.toLocaleTimeString()}</span>
                  <span>{data[Math.floor(data.length / 2)]?.datetime.toLocaleTimeString()}</span>
                  <span>{data[data.length - 1]?.datetime.toLocaleTimeString()}</span>
                </>
              )}
            </div>

            {/* Stats */}
            <div className="flex justify-between text-xs text-slate-500 pt-2 border-t">
              <span>Avg: {stats.avg.toFixed(1)} events/bucket</span>
              <span>Peak: {stats.max} events</span>
              <span>Total: {stats.total.toLocaleString()} events</span>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No timeline data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
