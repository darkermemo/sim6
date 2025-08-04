import React, { useMemo, useCallback, useState } from 'react';
import { KpiCard } from './dashboard/KpiCard';
import { AlertsOverTimeChart } from './dashboard/AlertsOverTimeChart';
import { TopSourcesChart } from './dashboard/TopSourcesChart';
import { RecentAlertsList } from './dashboard/RecentAlertsList';
import { DashboardFilters } from './dashboard/DashboardFilters';
import { KpiCardSkeleton, ChartSkeleton } from '@/components/ui/Skeleton';
import { useDashboardV2 } from '@/hooks/api/useDashboardV2';
import { Button } from '@/components/ui/Button';
import { RefreshCw } from 'lucide-react';
import type { TimeRange } from './dashboard/TimeRangePicker';
import type { SeverityLevel } from './dashboard/SeverityFilter';

export function Dashboard() {
  console.log('Dashboard component mounted');
  
  // State for dashboard filters
  const [timeRange, setTimeRange] = useState<TimeRange>('last-24h');
  const [customTimeRange, setCustomTimeRange] = useState<{ start: Date; end: Date } | null>(null);
  const [selectedSeverities, setSelectedSeverities] = useState<SeverityLevel[]>(['Critical', 'High', 'Medium', 'Low']);
  
  // Debug authentication state
  React.useEffect(() => {
    const token = localStorage.getItem('access_token');
    console.log('Dashboard mounted - token in localStorage:', token ? 'present' : 'missing');
    console.log('Dashboard mounted - localStorage contents:', {
      access_token: localStorage.getItem('access_token'),
      refresh_token: localStorage.getItem('refresh_token'),
      tenant_id: localStorage.getItem('tenant_id')
    });
  }, []);

  // Convert time range to API format
  const getTimeRangeForAPI = useCallback(() => {
    const now = new Date();
    let from: Date, to: Date;
    
    if (timeRange === 'custom' && customTimeRange) {
      from = customTimeRange.start;
      to = customTimeRange.end;
    } else {
      to = now;
      switch (timeRange) {
        case 'last-7d':
          from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'last-30d':
          from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'last-24h':
        default:
          from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
      }
    }
    
    return {
       from: from.toISOString(),
       to: to.toISOString(),
       severity: selectedSeverities.map(s => s.toLowerCase()).join(','),
       tenant_id: localStorage.getItem('tenant_id') || 'tenant-A'
     };
  }, [timeRange, customTimeRange, selectedSeverities]);

  // Fetch dashboard data using the new V2 endpoint
  const {
    data: dashboardData,
    isLoading: isDashboardLoading,
    error: dashboardError,
    mutate: mutateDashboard
  } = useDashboardV2(getTimeRangeForAPI());
  
  console.log('Dashboard component - hook result:', { 
    data: !!dashboardData, 
    isLoading: isDashboardLoading, 
    error: !!dashboardError 
  });

  // Handle refresh
  const handleRefresh = useCallback(() => {
    mutateDashboard();
  }, [mutateDashboard]);

  // Handle time range change
  const handleTimeRangeChange = useCallback((range: TimeRange, customStart?: Date, customEnd?: Date) => {
    setTimeRange(range);
    if (range === 'custom' && customStart && customEnd) {
      setCustomTimeRange({ start: customStart, end: customEnd });
    } else {
      setCustomTimeRange(null);
    }
  }, []);

  // Handle severity filter change
  const handleSeveritiesChange = useCallback((severities: SeverityLevel[]) => {
    setSelectedSeverities(severities);
  }, []);

  // Transform snake_case data for existing components
  const transformedData = useMemo(() => {
    if (!dashboardData) return null;
    
    // Transform alerts_over_time to match AlertsOverTimeData interface
    const alertsOverTime = dashboardData.alerts_over_time.map(item => ({
      hour: new Date(item.ts * 1000).toLocaleTimeString('en-US', { hour: '2-digit', hour12: false }),
      critical: item.critical,
      high: item.high,
      medium: item.medium,
      low: item.low
    }));

    // Transform top_log_sources to match TopLogSourceData interface
    const topLogSources = dashboardData.top_log_sources.map(item => ({
      source: item.source_type,
      count: item.count,
      value: item.count // Add value property for chart compatibility
    }));

    // Transform recent_alerts to match RecentAlert interface
    const recentAlerts = dashboardData.recent_alerts.map(item => ({
      id: item.alert_id,
      severity: item.severity,
      name: item.title,
      timestamp: new Date(item.ts * 1000).toISOString(),
      source_ip: item.source_ip,
      dest_ip: item.dest_ip,
      user: 'N/A', // Not provided in V2 response
      status: 'New' // Default status since not provided in V2 response
    }));
    
    return {
      totalEvents: dashboardData.total_events,
      totalAlerts: dashboardData.total_alerts,
      alertsOverTime,
      topLogSources,
      recentAlerts
    };
  }, [dashboardData]);

  if (isDashboardLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        </div>
        
        <div className="grid gap-4 md:grid-cols-2">
          <KpiCardSkeleton />
          <KpiCardSkeleton />
        </div>
        
        <div className="grid gap-4 md:grid-cols-2">
          <ChartSkeleton title="Alerts by Severity Over Time" />
          <ChartSkeleton title="Top Log Sources" />
        </div>
        
        <ChartSkeleton title="Recent Alerts" />
      </div>
    );
  }

  if (dashboardError) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Dashboard data unavailable
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Unable to load dashboard data. Please try again later.
          </p>
          <Button
            onClick={handleRefresh}
            className="mt-4"
            variant="outline"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!transformedData) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      </div>

      {/* Dashboard Filters */}
      <DashboardFilters
        timeRange={timeRange}
        onTimeRangeChange={handleTimeRangeChange}
        selectedSeverities={selectedSeverities}
        onSeveritiesChange={handleSeveritiesChange}
        onRefresh={handleRefresh}
        isRefreshing={isDashboardLoading}
      />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <KpiCard
          data={{
            title: "Total Events",
            value: transformedData.totalEvents.toLocaleString()
          }}
        />
        <KpiCard
          data={{
            title: "Total Alerts", 
            value: transformedData.totalAlerts.toLocaleString()
          }}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <AlertsOverTimeChart
          data={transformedData.alertsOverTime}
        />
        <TopSourcesChart
          data={transformedData.topLogSources}
        />
      </div>

      {/* Recent Alerts */}
      <RecentAlertsList
        alerts={transformedData.recentAlerts.slice(0, 10)}
        isLoading={isDashboardLoading}
      />
    </div>
  );
}