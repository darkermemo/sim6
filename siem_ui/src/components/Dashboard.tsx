import React, { useState, useMemo, useCallback } from 'react';
import { DashboardFilters } from './dashboard/DashboardFilters';
import { KpiCard } from './dashboard/KpiCard';
import { AlertsOverTimeChart } from './dashboard/AlertsOverTimeChart';
import { TopSourcesChart } from './dashboard/TopSourcesChart';
import { RecentAlertsList } from './dashboard/RecentAlertsList';
import { KpiCardSkeleton, ChartSkeleton } from '@/components/ui/Skeleton';
import { useDashboardApi } from '@/hooks/useApi';
import { useToast } from '@/hooks/useToast';
import type { TimeRange } from './dashboard/TimeRangePicker';
import type { SeverityLevel } from './dashboard/SeverityFilter';

export function Dashboard() {
  // Filter state
  const [timeRange, setTimeRange] = useState<TimeRange>('last-24h');
  const [selectedSeverities, setSelectedSeverities] = useState<SeverityLevel[]>(['Critical', 'High', 'Medium', 'Low']);
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();

  // Convert filters to API format
  const apiFilters = useMemo(() => {
    const now = new Date();
    let from: Date;
    
    switch (timeRange) {
      case 'last-24h':
        from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'last-7d':
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'last-30d':
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    return {
      from: from.toISOString(),
      to: now.toISOString(),
      severity: selectedSeverities.join(','),
      page: currentPage,
      limit: 10,
    };
  }, [timeRange, selectedSeverities, currentPage]);

  // Fetch dashboard data
  const {
    data,
    isLoading,
    isRefreshing,
    error,

    refresh
  } = useDashboardApi(apiFilters);

  const handleTimeRangeChange = (range: TimeRange, customStart?: Date, customEnd?: Date) => {
    setTimeRange(range);
    setCurrentPage(1); // Reset to first page when filters change
    console.log('Time range changed:', range, customStart, customEnd);
  };

  const handleSeveritiesChange = (severities: SeverityLevel[]) => {
    setSelectedSeverities(severities);
    setCurrentPage(1); // Reset to first page when filters change
    console.log('Severities changed:', severities);
  };

  const handleRefresh = async () => {
    try {
      await refresh();
      toast({
        title: 'Dashboard Refreshed',
        description: 'Data has been updated successfully',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'Refresh Failed',
        description: 'Failed to refresh dashboard data',
        variant: 'destructive',
      });
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Transform API data for KPI cards
  const kpiCardsData = useMemo(() => {
    if (!data || !data.kpis || !data.trends) return [];

    const { kpis, trends } = data;
    
    const getTrendString = (current: number, trend: number) => {
      if (trend === 0) return undefined;
      const percentage = ((trend / current) * 100).toFixed(1);
      return trend > 0 ? `+${percentage}%` : `${percentage}%`;
    };

    const getTrendColor = (trend: number): 'positive' | 'negative' | 'neutral' => {
      if (trend === 0) return 'neutral';
      return trend > 0 ? 'negative' : 'positive'; // More events/alerts = negative trend
    };

    // Helper function to format bytes
    const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return [
      {
        title: 'Total Events (24h)',
        value: (kpis.total_events_24h || 0).toLocaleString(),
        trend: getTrendString(kpis.total_events_24h || 0, trends.total_events_24h || 0),
        trendColor: getTrendColor(trends.total_events_24h || 0),
      },
      {
        title: 'New Alerts (24h)',
        value: (kpis.new_alerts_24h || 0).toLocaleString(),
        trend: getTrendString(kpis.new_alerts_24h || 0, trends.new_alerts_24h || 0),
        trendColor: getTrendColor(trends.new_alerts_24h || 0),
      },
      {
        title: 'Cases Opened',
        value: (kpis.cases_opened || 0).toLocaleString(),
        trend: getTrendString(kpis.cases_opened || 0, trends.cases_opened || 0),
        trendColor: ((trends.cases_opened || 0) > 0 ? 'negative' : 'positive') as 'positive' | 'negative' | 'neutral',
      },
      {
        title: 'EPS (Live)',
        value: `${(kpis.eps_live || 0).toLocaleString()}/s`,
        trendColor: 'neutral' as const,
      },
      {
        title: 'Queue Counter',
        value: (kpis.queue_counter || 0).toLocaleString(),
        trend: getTrendString(kpis.queue_counter || 0, trends.queue_counter || 0),
        trendColor: getTrendColor(trends.queue_counter || 0),
      },
      {
        title: 'Total Storage Used',
        value: formatBytes(kpis.total_storage_bytes || 0),
        trend: getTrendString(kpis.total_storage_bytes || 0, trends.total_storage_bytes || 0),
        trendColor: getTrendColor(trends.total_storage_bytes || 0),
      },
      {
        title: 'Filtered Logs Storage',
        value: formatBytes(kpis.filtered_storage_bytes || 0),
        trend: getTrendString(kpis.filtered_storage_bytes || 0, trends.filtered_storage_bytes || 0),
        trendColor: getTrendColor(trends.filtered_storage_bytes || 0),
      },
    ];
  }, [data]);

  // Calculate pagination info
  const totalPages = Math.ceil((data?.recent_alerts?.length || 0) / 10);

  // Show error toast if API call fails - Memoize toast to prevent infinite loops
  const showErrorToast = useCallback(() => {
    toast({
      title: 'Failed to Load Dashboard',
      description: 'Unable to fetch dashboard data. Please try again.',
      variant: 'destructive',
    });
  }, [toast]);

  React.useEffect(() => {
    if (error) {
      showErrorToast();
    }
  }, [error, showErrorToast]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Dashboard Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-primary-text">
            SIEM Analytics Dashboard
          </h1>
          <p className="text-secondary-text">
            Real-time security monitoring and threat detection overview
          </p>
        </div>

        {/* Dashboard Grid Layout */}
        <div className="dashboard-grid">
          {/* Row 1: Filters (Full Width) */}
          <DashboardFilters
            timeRange={timeRange}
            onTimeRangeChange={handleTimeRangeChange}
            selectedSeverities={selectedSeverities}
            onSeveritiesChange={handleSeveritiesChange}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
          />

          {/* Row 2: KPI Cards (7 Cards, each spanning 2 columns) */}
          {isLoading ? (
            Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="dashboard-kpi">
                <KpiCardSkeleton />
              </div>
            ))
          ) : (
            kpiCardsData.map((kpi, index) => (
              <div key={index} className="dashboard-kpi">
                <KpiCard data={kpi} />
              </div>
            ))
          )}

          {/* Row 3: Main Charts (2 Charts, each spanning 6 columns) */}
          <div className="dashboard-chart">
            {isLoading ? (
              <ChartSkeleton title="Alerts by Severity Over Time" />
            ) : (
              <AlertsOverTimeChart data={data?.alerts_over_time} />
            )}
          </div>
          
          <div className="dashboard-chart">
            {isLoading ? (
              <ChartSkeleton title="Top Log Sources" />
            ) : (
              <TopSourcesChart data={data?.top_log_sources} />
            )}
          </div>

          {/* Row 4: Recent Alerts Table (Full Width) */}
          <div className="dashboard-table">
            <RecentAlertsList
              alerts={data?.recent_alerts}
              isLoading={isLoading}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}