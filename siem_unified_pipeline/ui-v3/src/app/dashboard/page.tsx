"use client";

import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/ActionButton";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboard, getHealth, getEpsStats } from "@/lib/api";
import { DashboardResponse, HealthResponse, EpsStatsResponse } from "@/types/api";
import { normalizeSeverity } from "@/lib/severity";
import { 
  Activity, 
  AlertTriangle, 
  Database, 
  TrendingUp, 
  Shield,
  Clock,
  Users,
  Zap,
  RefreshCw,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Server,
  Network,
  Lock
} from "lucide-react";

export default function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [epsData, setEpsData] = useState<EpsStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Fetch all dashboard data
  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [dashboard, health, eps] = await Promise.all([
        getDashboard().catch(() => null), // Don't fail if dashboard endpoint is not ready
        getHealth().catch(() => null),
        getEpsStats().catch(() => null)
      ]);
      
      setDashboardData(dashboard);
      setHealthData(health);
      setEpsData(eps);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  };

  // Initial data fetch and periodic refresh
  useEffect(() => {
    fetchDashboardData();
    
    const interval = setInterval(fetchDashboardData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Mock data for demonstration when API is not available
  const mockMetrics = useMemo(() => {
    if (dashboardData) {
      return [
        {
          title: "Total Events (24h)",
          value: dashboardData.kpis.total_events_24h.toLocaleString(),
          change: "+12.5%",
          trend: "up" as const,
          icon: Database,
          color: "text-blue-600",
          bgColor: "bg-blue-50",
          description: "Events processed in the last 24 hours"
        },
        {
          title: "Active Alerts",
          value: dashboardData.kpis.total_alerts_24h.toString(),
          change: "-8.2%",
          trend: "down" as const,
          icon: AlertTriangle,
          color: "text-red-600",
          bgColor: "bg-red-50",
          description: "Critical and high severity alerts"
        },
        {
          title: "Detection Rules",
          value: dashboardData.kpis.active_rules.toString(),
          change: "stable",
          trend: "stable" as const,
          icon: Shield,
          color: "text-green-600",
          bgColor: "bg-green-50",
          description: "Active security detection rules"
        },
        {
          title: "Avg EPS",
          value: Math.round(dashboardData.kpis.avg_eps).toLocaleString(),
          change: "+5.1%",
          trend: "up" as const,
          icon: Zap,
          color: "text-orange-600",
          bgColor: "bg-orange-50",
          description: "Average events per second"
        }
      ];
    }
    
    // Fallback mock data
    return [
      {
        title: "Total Events (24h)",
        value: "1,234,567",
        change: "+12.5%",
        trend: "up" as const,
        icon: Database,
        color: "text-blue-600",
        bgColor: "bg-blue-50",
        description: "Events processed in the last 24 hours"
      },
      {
        title: "Active Alerts",
        value: "23",
        change: "-8.2%",
        trend: "down" as const,
        icon: AlertTriangle,
        color: "text-red-600",
        bgColor: "bg-red-50",
        description: "Critical and high severity alerts"
      },
      {
        title: "Detection Rules",
        value: "156",
        change: "stable",
        trend: "stable" as const,
        icon: Shield,
        color: "text-green-600",
        bgColor: "bg-green-50",
        description: "Active security detection rules"
      },
      {
          title: "Avg EPS",
          value: epsData ? Math.round(epsData.global.avg_eps).toLocaleString() : "1,250",
          change: "+5.1%",
          trend: "up" as const,
          icon: Zap,
          color: "text-orange-600",
          bgColor: "bg-orange-50",
          description: "Average events per second"
        }
    ];
  }, [dashboardData, epsData]);

  // Process real alerts data or use mock data
  const alerts = useMemo(() => {
    if (dashboardData?.recent_alerts) {
      return dashboardData.recent_alerts.map(alert => ({
        id: alert.id,
        severity: normalizeSeverity(alert.severity),
        title: alert.name,
        description: alert.description,
        time: new Date(alert.created_at).toLocaleString(),
        source: `Rule: ${alert.rule_id}`,
        status: alert.status
      }));
    }
    
    // Fallback mock data
    return [
      { id: "1", severity: "high", title: "Suspicious login attempt", description: "Multiple failed attempts detected", time: "2 minutes ago", source: "auth.service", status: "Open" },
      { id: "2", severity: "medium", title: "High CPU usage detected", description: "CPU usage above 90%", time: "15 minutes ago", source: "system.monitor", status: "InProgress" },
      { id: "3", severity: "low", title: "SSL certificate expiring", description: "Certificate expires in 7 days", time: "1 hour ago", source: "cert.monitor", status: "Open" },
      { id: "4", severity: "critical", title: "Multiple failed login attempts", description: "Brute force attack detected", time: "2 hours ago", source: "auth.service", status: "Open" }
    ];
  }, [dashboardData]);

  // Process top sources data or use mock data
  const topSources = useMemo(() => {
    if (dashboardData?.top_sources) {
      const total = dashboardData.top_sources.reduce((sum, source) => sum + source.event_count, 0);
      return dashboardData.top_sources.map(source => ({
        name: source.source_name,
        events: source.event_count,
        percentage: total > 0 ? Math.round((source.event_count / total) * 100) : 0,
        eps: source.avg_eps,
        lastSeen: new Date(source.last_seen).toLocaleString()
      }));
    }
    
    // Fallback mock data
    return [
      { name: "web.server", events: 45678, percentage: 35, eps: 15.2, lastSeen: "2 min ago" },
      { name: "auth.service", events: 32145, percentage: 25, eps: 10.8, lastSeen: "1 min ago" },
      { name: "database", events: 25689, percentage: 20, eps: 8.6, lastSeen: "3 min ago" },
      { name: "firewall", events: 19234, percentage: 15, eps: 6.4, lastSeen: "1 min ago" },
      { name: "dns.resolver", events: 6789, percentage: 5, eps: 2.3, lastSeen: "5 min ago" }
    ];
  }, [dashboardData]);

  // System health status indicators
  const healthComponents = useMemo(() => {
    if (healthData?.components) {
      return Object.entries(healthData.components).map(([name, health]) => ({
        name,
        status: health.status,
        responseTime: health.response_time_ms,
        errorCount: health.error_count,
        lastCheck: new Date(health.last_check).toLocaleString()
      }));
    }
    
    return [
      { name: "ClickHouse", status: "healthy", responseTime: 1.2, errorCount: 0, lastCheck: "Just now" },
      { name: "Redis", status: "healthy", responseTime: 0.8, errorCount: 0, lastCheck: "Just now" },
      { name: "Vector", status: "healthy", responseTime: 2.1, errorCount: 0, lastCheck: "Just now" },
      { name: "API Gateway", status: "healthy", responseTime: 0.5, errorCount: 0, lastCheck: "Just now" }
    ];
  }, [healthData]);

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <ArrowUpRight className="h-3 w-3 text-green-500" />;
      case 'down': return <ArrowDownRight className="h-3 w-3 text-red-500" />;
      default: return <Minus className="h-3 w-3 text-slate-500" />;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'up': return 'text-green-600';
      case 'down': return 'text-red-600';
      default: return 'text-slate-600';
    }
  };

  if (loading && !dashboardData) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Watermark */}
      <div className="fixed bottom-3 right-4 z-50 pointer-events-none select-none opacity-40 text-xs font-semibold bg-muted text-muted-foreground px-2 py-1 rounded">
        UI-V3 View (Dashboard)
      </div>
      <div className="p-6 space-y-6">
        {/* Header with Refresh */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Security Dashboard
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Real-time security monitoring and threat intelligence
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </div>
            <ActionButton 
              variant="outline" 
              size="sm" 
              onClick={fetchDashboardData}
              disabled={loading}
              className="gap-2"
              data-action="dashboard:data:refresh"
              data-intent="api"
              data-endpoint="/api/v2/dashboard"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </ActionButton>
          </div>
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">Error loading dashboard data</span>
              </div>
              <p className="text-sm text-red-600 dark:text-red-300 mt-1">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {mockMetrics.map((metric, index) => (
            <Card key={index} className="relative overflow-hidden border-0 shadow-lg bg-white dark:bg-slate-800">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      {metric.title}
                    </p>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white">
                      {metric.value}
                    </p>
                    <div className="flex items-center gap-2">
                      {getTrendIcon(metric.trend)}
                      <span className={`text-sm font-medium ${getTrendColor(metric.trend)}`}>
                        {metric.change}
                      </span>
                    </div>
                  </div>
                  <div className={`h-12 w-12 rounded-xl ${metric.bgColor} flex items-center justify-center shadow-sm`}>
                    <metric.icon className={`h-6 w-6 ${metric.color}`} />
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {metric.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* System Health Overview */}
        <Card className="border-0 shadow-lg bg-white dark:bg-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Server className="h-5 w-5 text-green-600" />
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {healthComponents.map((component, index) => (
                <div key={index} className="p-4 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-900 dark:text-white">{component.name}</span>
                    <div className={`h-2 w-2 rounded-full ${
                      component.status === 'healthy' ? 'bg-green-500' : 
                      component.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                    }`} />
                  </div>
                  <div className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
                    <div>Response: {component.responseTime}ms</div>
                    <div>Errors: {component.errorCount}</div>
                    <div className="text-xs">Last check: {component.lastCheck}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Alerts */}
          <Card className="border-0 shadow-lg bg-white dark:bg-slate-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  Recent Alerts
                </CardTitle>
                <ActionButton 
                  variant="ghost" 
                  size="sm" 
                  className="gap-2"
                  onClick={() => window.location.href = '/alerts'}
                  data-action="dashboard:alerts:view-all"
                  data-intent="navigate"
                >
                  <Eye className="h-4 w-4" />
                  View All
                </ActionButton>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {alerts.slice(0, 5).map((alert) => (
                  <div key={alert.id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <Badge 
                          variant={
                            alert.severity === 'critical' ? 'destructive' :
                            alert.severity === 'high' ? 'destructive' :
                            alert.severity === 'medium' ? 'secondary' : 'outline'
                          }
                          className="mt-0.5"
                        >
                          {alert.severity}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-slate-900 dark:text-white truncate">
                            {alert.title}
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                            {alert.description}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                            {alert.source}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {alert.time}
                        </span>
                        <Badge variant="outline" className="block mt-1 text-xs">
                          {alert.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top Event Sources */}
          <Card className="border-0 shadow-lg bg-white dark:bg-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                <Network className="h-5 w-5 text-blue-600" />
                Top Event Sources
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topSources.map((source, index) => (
                  <div key={index} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                          <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <span className="font-medium text-slate-900 dark:text-white">
                            {source.name}
                          </span>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {source.eps} EPS • Last seen: {source.lastSeen}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-medium text-slate-900 dark:text-white">
                          {source.events.toLocaleString()}
                        </span>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          events
                        </div>
                      </div>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-500 shadow-sm"
                        style={{ width: `${source.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Security Overview */}
        <Card className="border-0 shadow-lg bg-white dark:bg-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Lock className="h-5 w-5 text-purple-600" />
              Security Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600 mb-2">99.9%</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">Security Score</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600 mb-2">156</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">Active Rules</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-orange-600 mb-2">2.3ms</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">Avg Response Time</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Loading skeleton component
function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-12 w-12 rounded-xl" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-2 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
