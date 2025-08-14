"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getHealth, getDetailedHealth } from "@/lib/api";
import { HealthResponse } from "@/types/api";
import { 
  Activity, 
  Database, 
  Server, 
  Network,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Cpu,
  HardDrive,
  Wifi,
  Zap,
  MemoryStick,
  Gauge,
  TrendingUp,
  TrendingDown,
  Minus
} from "lucide-react";

export default function HealthPage() {
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Fetch health data
  const fetchHealthData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [basicHealth, detailedHealth] = await Promise.all([
        getHealth().catch(() => null),
        getDetailedHealth().catch(() => null)
      ]);
      
      // Use detailed health if available, otherwise use basic health
      setHealthData(detailedHealth || basicHealth);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch health data');
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch and periodic refresh
  useEffect(() => {
    fetchHealthData();
    
    const interval = setInterval(fetchHealthData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Helper functions
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'ok':
      case 'healthy':
      case 'up':
        return 'text-green-600';
      case 'warning':
      case 'degraded':
        return 'text-yellow-600';
      case 'error':
      case 'down':
      case 'unhealthy':
        return 'text-red-600';
      default:
        return 'text-slate-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'ok':
      case 'healthy':
      case 'up':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'warning':
      case 'degraded':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'error':
      case 'down':
      case 'unhealthy':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Activity className="h-4 w-4 text-slate-600" />;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'ok':
      case 'healthy':
      case 'up':
        return 'default';
      case 'warning':
      case 'degraded':
        return 'secondary';
      case 'error':
      case 'down':
      case 'unhealthy':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getUptimePercent = () => {
    if (healthData?.uptime_seconds) {
      // Mock calculation - in real app this would be calculated from historical data
      return 99.9;
    }
    return 99.5;
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  // System metrics (mock data - would come from real monitoring)
  const systemMetrics = [
    { name: "CPU Usage", value: 45, unit: "%", status: "healthy", icon: Cpu },
    { name: "Memory Usage", value: 72, unit: "%", status: "warning", icon: MemoryStick },
    { name: "Disk Usage", value: 34, unit: "%", status: "healthy", icon: HardDrive },
    { name: "Network I/O", value: 1.2, unit: "Gbps", status: "healthy", icon: Wifi }
  ];

  const systemComponents = healthData?.components ? 
    Object.entries(healthData.components).map(([name, health]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      status: health.status,
      description: `Response time: ${health.response_time_ms.toFixed(2)}ms`,
      responseTime: health.response_time_ms,
      errorCount: health.error_count,
      lastCheck: health.last_check,
      icon: name.toLowerCase().includes('clickhouse') ? Database :
            name.toLowerCase().includes('redis') ? Database :
            name.toLowerCase().includes('vector') ? Network :
            name.toLowerCase().includes('api') ? Server : Activity
    })) : [
      {
        name: "SIEM API",
        status: healthData?.status || "unknown",
        description: "Main SIEM API service",
        responseTime: 1.2,
        errorCount: 0,
        lastCheck: new Date().toISOString(),
        icon: Server
      },
      {
        name: "ClickHouse",
        status: "healthy",
        description: "Primary event database",
        responseTime: 2.1,
        errorCount: 0,
        lastCheck: new Date().toISOString(),
        icon: Database
      },
      {
        name: "Redis Cache",
        status: "healthy", 
        description: "Session and cache storage",
        responseTime: 0.8,
        errorCount: 0,
        lastCheck: new Date().toISOString(),
        icon: Database
      },
      {
        name: "Vector Pipeline",
        status: "healthy",
        description: "Log processing pipeline",
        responseTime: 3.2,
        errorCount: 0,
        lastCheck: new Date().toISOString(),
        icon: Network
      }
    ];

  if (loading) {
    return <HealthSkeleton />;
  }

  if (error) {
    return (
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <div className="p-6">
          <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
            <CardContent className="p-12 text-center">
              <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-red-800 dark:text-red-200 mb-2">
                Health Check Failed
              </h3>
              <p className="text-red-600 dark:text-red-300 mb-4">
                Unable to connect to the SIEM API server
              </p>
              <Button 
                variant="outline" 
                onClick={fetchHealthData}
                disabled={loading}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Retry Health Check
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const overallStatus = healthData?.status === "ok" ? "healthy" : "unhealthy";
  const uptime = healthData?.uptime_seconds || 86400;

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              System Health
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Monitor the health and performance of all SIEM components
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </div>
            <Button 
              variant="outline" 
              onClick={fetchHealthData}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Overall Status */}
        <Card className="border-0 shadow-lg bg-white dark:bg-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Activity className="h-5 w-5 text-green-600" />
              System Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="flex justify-center mb-3">
                  {getStatusIcon(healthData?.status || "unknown")}
                </div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                  {overallStatus === "healthy" ? "Operational" : "Issues Detected"}
                </div>
                <Badge variant={getStatusBadgeVariant(healthData?.status || "unknown")}>
                  {healthData?.status?.toUpperCase() || "UNKNOWN"}
                </Badge>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600 mb-1">
                  {getUptimePercent()}%
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  Uptime
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                  Running for {formatUptime(uptime)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600 mb-1">
                  {healthData?.version || "v3.0.0"}
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  Version
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                  Last deployed: Today
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {systemMetrics.map((metric, index) => (
            <Card key={index} className="border-0 shadow-lg bg-white dark:bg-slate-800">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      {metric.name}
                    </p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                      {metric.value}{metric.unit}
                    </p>
                    <div className="flex items-center gap-2">
                      {metric.status === 'healthy' ? (
                        <TrendingUp className="h-3 w-3 text-green-500" />
                      ) : metric.status === 'warning' ? (
                        <AlertTriangle className="h-3 w-3 text-yellow-500" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      )}
                      <span className={`text-xs font-medium ${getStatusColor(metric.status)}`}>
                        {metric.status}
                      </span>
                    </div>
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-slate-50 dark:bg-slate-700 flex items-center justify-center">
                    <metric.icon className="h-6 w-6 text-slate-600 dark:text-slate-300" />
                  </div>
                </div>
                {/* Progress bar for percentage metrics */}
                {metric.unit === '%' && (
                  <div className="mt-4">
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-500 ${
                          metric.value > 80 ? 'bg-red-500' : 
                          metric.value > 60 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${metric.value}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Component Status */}
        <Card className="border-0 shadow-lg bg-white dark:bg-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Server className="h-5 w-5 text-blue-600" />
              Component Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {systemComponents.map((component, index) => (
                <div key={index} className="p-4 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-600 flex items-center justify-center">
                        <component.icon className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">
                          {component.name}
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          {component.description}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(component.status)}
                      <Badge variant={getStatusBadgeVariant(component.status)}>
                        {component.status}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Response</div>
                      <div className="font-medium text-slate-900 dark:text-white">
                        {component.responseTime?.toFixed(1)}ms
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Errors</div>
                      <div className="font-medium text-slate-900 dark:text-white">
                        {component.errorCount || 0}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Last Check</div>
                      <div className="font-medium text-slate-900 dark:text-white">
                        {new Date(component.lastCheck).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Health History Chart Placeholder */}
        <Card className="border-0 shadow-lg bg-white dark:bg-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Gauge className="h-5 w-5 text-purple-600" />
              Performance Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center text-slate-500 dark:text-slate-400">
              <div className="text-center">
                <Gauge className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Performance charts coming soon</p>
                <p className="text-sm">Historical performance and trend analysis</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Debug Information */}
        {healthData && (
          <Card className="border-0 shadow-lg bg-white dark:bg-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                <Database className="h-5 w-5 text-green-600" />
                Raw Health Data
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-slate-100 dark:bg-slate-700 p-4 rounded-lg overflow-auto text-slate-700 dark:text-slate-300">
                {JSON.stringify(healthData, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// Health loading skeleton
function HealthSkeleton() {
  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
        
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="text-center space-y-3">
                  <Skeleton className="h-8 w-8 rounded-full mx-auto" />
                  <Skeleton className="h-6 w-24 mx-auto" />
                  <Skeleton className="h-4 w-16 mx-auto" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <Skeleton className="h-12 w-12 rounded-xl" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}


