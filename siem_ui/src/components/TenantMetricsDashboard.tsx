import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { TenantFilter } from '@/components/TenantFilter';
import { 
  Activity, 
  AlertTriangle, 
  Database, 
  TrendingUp, 
  Clock, 
  Shield, 
  RefreshCw,
  Building2,
  Server,
  Zap
} from 'lucide-react';
import { useTenants } from '@/hooks/useTenants';

interface TenantMetrics {
  tenant_id: string;
  tenant_name: string;
  total_events_24h: number;
  avg_eps_24h: number;
  peak_eps_24h: number;
  total_alerts_24h: number;
  active_log_sources: number;
  total_log_sources: number;
  parse_success_rate: number;
  last_activity: string;
}

interface TenantEpsStats {
  tenant_id: string;
  minute_timestamp: string;
  event_count: number;
  eps: number;
}

interface TenantParsingErrors {
  tenant_id: string;
  log_source_id: string;
  log_source_name: string;
  parsing_status: string;
  error_count: number;
  sample_error_msg: string;
  last_error_date: string;
}

/**
 * TenantMetricsDashboard - Comprehensive tenant performance monitoring dashboard
 * 
 * Features:
 * - Real-time tenant metrics (events, EPS, alerts, log sources)
 * - Tenant filtering for SuperAdmin cross-tenant access
 * - EPS trend visualization over 24-hour period
 * - Parsing error monitoring and diagnostics
 * - Health status indicators based on parse success rates
 * 
 * Backend endpoints:
 * - GET /api/v1/tenants/metrics - Tenant performance metrics
 * - GET /api/v1/stats/eps - Events per second statistics
 * - GET /api/v1/tenants/{id}/parsing-errors - Parsing error details
 * 
 * @example
 * <TenantMetricsDashboard />
 */
const TenantMetricsDashboard: React.FC = () => {
  const [selectedTenant, setSelectedTenant] = useState<string | undefined>();
  const [metrics, setMetrics] = useState<TenantMetrics[]>([]);
  const [epsStats, setEpsStats] = useState<TenantEpsStats[]>([]);
  const [parsingErrors, setParsingErrors] = useState<TenantParsingErrors[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getTenantName } = useTenants();

  /**
   * Fetches comprehensive tenant metrics from multiple API endpoints
   * Handles tenant filtering for SuperAdmin users and error states
   */
  const fetchTenantMetrics = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // Fetch tenant metrics
      const metricsUrl = selectedTenant 
        ? `/api/v1/tenants/metrics?tenant_id=${selectedTenant}`
        : '/api/v1/tenants/metrics';
      
      const metricsResponse = await fetch(metricsUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!metricsResponse.ok) {
        throw new Error('Failed to fetch tenant metrics');
      }
      
      const metricsData = await metricsResponse.json();
      setMetrics(metricsData.metrics || []);
      
      // Fetch EPS stats
      const epsUrl = selectedTenant 
        ? `/api/v1/stats/eps?tenant_id=${selectedTenant}&hours=24`
        : '/api/v1/stats/eps?hours=24';
      
      const epsResponse = await fetch(epsUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (epsResponse.ok) {
        const epsData = await epsResponse.json();
        setEpsStats(epsData.eps_stats || []);
      }
      
      // Fetch parsing errors for selected tenant
      if (selectedTenant) {
        const errorsResponse = await fetch(`/api/v1/tenants/${selectedTenant}/parsing-errors`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (errorsResponse.ok) {
          const errorsData = await errorsResponse.json();
          setParsingErrors(errorsData.parsing_errors || []);
        }
      } else {
        setParsingErrors([]);
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenantMetrics();
  }, [selectedTenant]);

  /**
   * Formats large numbers with K/M suffixes for better readability
   * @param num - The number to format
   * @returns Formatted string with appropriate suffix
   */
  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  /**
   * Formats EPS (Events Per Second) values to one decimal place
   * @param eps - The EPS value to format
   * @returns Formatted EPS string
   */
  const formatEps = (eps: number): string => {
    return eps.toFixed(1);
  };

  /**
   * Determines tenant health status based on parsing success rate
   * @param metric - Tenant metrics object
   * @returns Health status object with status text and color class
   */
  const getHealthStatus = (metric: TenantMetrics): { status: string; color: string } => {
    if (metric.parse_success_rate < 80) {
      return { status: 'Critical', color: 'bg-red-500' };
    } else if (metric.parse_success_rate < 95) {
      return { status: 'Warning', color: 'bg-yellow-500' };
    } else {
      return { status: 'Healthy', color: 'bg-green-500' };
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Tenant Metrics</h1>
        </div>
        <Card className="p-6">
          <div className="text-center">Loading tenant metrics...</div>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Tenant Metrics</h1>
        </div>
        <Card className="p-6">
          <div className="text-center text-red-600">{error}</div>
          <div className="text-center mt-4">
            <Button onClick={fetchTenantMetrics}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tenant Metrics</h1>
          <p className="text-muted-foreground">
            Monitor tenant performance, EPS, and parsing statistics
          </p>
        </div>
        <Button onClick={fetchTenantMetrics} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Tenant Filter */}
      <Card className="p-4">
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <TenantFilter
              value={selectedTenant}
              onChange={setSelectedTenant}
              placeholder="Filter by tenant (or view all)"
              showAllOption={true}
              className="w-full"
            />
          </div>
        </div>
      </Card>

      {/* Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((metric) => {
          const health = getHealthStatus(metric);
          return (
            <Card key={metric.tenant_id} className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-medium truncate">{metric.tenant_name}</h3>
                </div>
                <div className={`w-3 h-3 rounded-full ${health.color}`} title={health.status} />
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Activity className="h-4 w-4 text-blue-500" />
                    <span className="text-sm text-muted-foreground">Events (24h)</span>
                  </div>
                  <span className="font-semibold">{formatNumber(metric.total_events_24h)}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm text-muted-foreground">Avg EPS</span>
                  </div>
                  <span className="font-semibold">{formatEps(metric.avg_eps_24h)}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-muted-foreground">Peak EPS</span>
                  </div>
                  <span className="font-semibold">{formatEps(metric.peak_eps_24h)}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <span className="text-sm text-muted-foreground">Alerts (24h)</span>
                  </div>
                  <span className="font-semibold">{metric.total_alerts_24h}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Server className="h-4 w-4 text-purple-500" />
                    <span className="text-sm text-muted-foreground">Log Sources</span>
                  </div>
                  <span className="font-semibold">
                    {metric.active_log_sources}/{metric.total_log_sources}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Shield className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-muted-foreground">Parse Rate</span>
                  </div>
                  <Badge variant={metric.parse_success_rate >= 95 ? "default" : "critical"}>
                    {metric.parse_success_rate.toFixed(1)}%
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-muted-foreground">Last Activity</span>
                  </div>
                  <span className="text-sm">
                    {new Date(metric.last_activity).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Parsing Errors (only shown when a specific tenant is selected) */}
      {selectedTenant && parsingErrors.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <span>Parsing Errors - {getTenantName(selectedTenant)}</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Log Source</th>
                  <th className="text-left py-2 px-4">Status</th>
                  <th className="text-left py-2 px-4">Error Count</th>
                  <th className="text-left py-2 px-4">Sample Error</th>
                  <th className="text-left py-2 px-4">Last Error</th>
                </tr>
              </thead>
              <tbody>
                {parsingErrors.map((error, index) => (
                  <tr key={index} className="border-b hover:bg-border">
                    <td className="py-2 px-4 font-medium">{error.log_source_name}</td>
                    <td className="py-2 px-4">
                      <Badge variant={error.parsing_status === 'failed' ? 'critical' : 'secondary'}>
                        {error.parsing_status}
                      </Badge>
                    </td>
                    <td className="py-2 px-4">{error.error_count}</td>
                    <td className="py-2 px-4 max-w-xs truncate" title={error.sample_error_msg}>
                      {error.sample_error_msg}
                    </td>
                    <td className="py-2 px-4">
                      {new Date(error.last_error_date).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* EPS Trends (simplified view) */}
      {epsStats.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center space-x-2">
            <TrendingUp className="h-5 w-5 text-blue-500" />
            <span>EPS Trends (Last 24 Hours)</span>
          </h2>
          <div className="text-sm text-muted-foreground mb-4">
            Showing recent EPS data points. Peak EPS values are highlighted.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {epsStats.slice(0, 12).map((stat, index) => {
              const tenantName = getTenantName(stat.tenant_id);
              return (
                <div key={index} className="p-3 border rounded-lg">
                  <div className="font-medium text-sm">{tenantName}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(stat.minute_timestamp).toLocaleTimeString()}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm">Events: {stat.event_count}</span>
                    <Badge variant={stat.eps > 100 ? "default" : "secondary"}>
                      {formatEps(stat.eps)} EPS
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Empty State */}
      {metrics.length === 0 && (
        <Card className="p-12">
          <div className="text-center">
            <Database className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Tenant Metrics Available</h3>
            <p className="text-muted-foreground mb-4">
              No tenant metrics data found. This could be because:
            </p>
            <ul className="text-sm text-muted-foreground text-left max-w-md mx-auto space-y-1">
              <li>• No tenants have been created yet</li>
              <li>• No events have been ingested in the last 24 hours</li>
              <li>• The materialized views are still being populated</li>
            </ul>
          </div>
        </Card>
      )}
    </div>
  );
};

export default TenantMetricsDashboard;