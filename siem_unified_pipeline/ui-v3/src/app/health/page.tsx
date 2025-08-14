"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useRealtimeHealth, useHealthDiagnose, useHealthAutoFix } from "@/hooks/useHealth";
import { PipelineFlow } from "@/components/health/PipelineFlow";
import type { OverallStatus } from "@/types/health";
import { 
  Activity, 
  AlertTriangle, 
  Database, 
  CheckCircle, 
  XCircle,
  Server,
  Cpu,
  HardDrive,
  Network,
  RefreshCw,
  Clock,
  TrendingUp,
  Zap,
  PlayCircle,
  Wrench,
  Eye,
  Shield,
  BarChart3
} from "lucide-react";

export default function HealthPage() {
  const [liveMode, setLiveMode] = useState(true);
  const { 
    data: health, 
    loading, 
    error, 
    lastRefresh, 
    connected, 
    refetch, 
    toggleStream,
    streamEnabled 
  } = useRealtimeHealth({ 
    enableStream: liveMode, 
    refreshInterval: liveMode ? 0 : 10000 
  });

  const { diagnose, loading: diagnosing } = useHealthDiagnose();
  const { autoFix, loading: fixing } = useHealthAutoFix();

  const getOverallStatusInfo = (status: OverallStatus) => {
    switch (status) {
      case 'up':
        return {
          badge: <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle className="h-3 w-3 mr-1" />Healthy</Badge>,
          color: 'text-green-600',
          description: 'All systems operational'
        };
      case 'degraded':
        return {
          badge: <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200"><AlertTriangle className="h-3 w-3 mr-1" />Degraded</Badge>,
          color: 'text-yellow-600',
          description: 'Some performance issues detected'
        };
      case 'down':
        return {
          badge: <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Down</Badge>,
          color: 'text-red-600',
          description: 'Critical system failures'
        };
      default:
        return {
          badge: <Badge variant="outline"><AlertTriangle className="h-3 w-3 mr-1" />Unknown</Badge>,
          color: 'text-gray-600',
          description: 'Status unavailable'
        };
    }
  };

  const handleDiagnose = async (component: string) => {
    const result = await diagnose({ component });
    if (result) {
      console.log('Diagnostic result:', result);
      // In real app, open a modal/drawer with results
    }
  };

  const handleAutoFix = async (kind: string, params: any, confirm: boolean = false) => {
    const result = await autoFix({ kind, params, confirm });
    if (result) {
      console.log('Auto-fix result:', result);
      // In real app, show success/failure notification
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Health Control Room</h1>
            <p className="text-muted-foreground">Real-time system monitoring and automated remediation</p>
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Health Control Room</h1>
            <p className="text-muted-foreground">Real-time system monitoring and automated remediation</p>
          </div>
          <Button onClick={refetch} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>

        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to fetch health data: {error}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!health) {
    return <div>No health data available</div>;
  }

  const statusInfo = getOverallStatusInfo(health.overall);

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header with Live Mode Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Health Control Room</h1>
          <p className="text-muted-foreground">
            Real-time system monitoring and automated remediation
          </p>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span>Last updated: {lastRefresh?.toLocaleTimeString()}</span>
            {streamEnabled && connected && (
              <span className="flex items-center gap-1 text-green-600">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                Live
              </span>
            )}
            {health.errors > 0 && (
              <span className="text-red-600">
                {health.errors} error{health.errors > 1 ? 's' : ''} detected
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            <span className="text-sm">Live Mode</span>
            <Switch 
              checked={liveMode} 
              onCheckedChange={(checked) => {
                setLiveMode(checked);
                if (checked) {
                  toggleStream();
                }
              }} 
            />
          </div>
          <Button onClick={refetch} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overall Status Banner */}
      <Alert className={health.overall === 'up' ? 'border-green-200 bg-green-50' : health.overall === 'degraded' ? 'border-yellow-200 bg-yellow-50' : 'border-red-200 bg-red-50'}>
        <Activity className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {statusInfo.badge}
            <span className={statusInfo.color}>{statusInfo.description}</span>
          </div>
          <div className="text-sm">
            {new Date(health.ts).toLocaleString()}
          </div>
        </AlertDescription>
      </Alert>

      {/* Key Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Pipeline EPS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{health.pipeline.eps_parsed.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {health.pipeline.parse_success_pct.toFixed(1)}% success rate
            </p>
            <Progress value={health.pipeline.parse_success_pct} className="mt-2 h-1" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4" />
              ClickHouse
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={health.clickhouse.ok ? 'default' : 'destructive'} className="mb-2">
              {health.clickhouse.ok ? 'Healthy' : 'Down'}
            </Badge>
            <div className="text-sm text-muted-foreground">
              {health.clickhouse.inserts_per_sec} IPS, {health.clickhouse.ingest_delay_ms}ms delay
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Server className="h-4 w-4" />
              Redis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={health.redis.ok ? 'default' : 'destructive'} className="mb-2">
              {health.redis.ok ? 'Healthy' : 'Down'}
            </Badge>
            <div className="text-sm text-muted-foreground">
              {health.redis.hit_ratio_pct.toFixed(1)}% hit ratio, {health.redis.ops_per_sec} OPS
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Network className="h-4 w-4" />
              Kafka
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={health.kafka.ok ? 'default' : 'destructive'} className="mb-2">
              {health.kafka.ok ? 'Healthy' : 'Down'}
            </Badge>
            <div className="text-sm text-muted-foreground">
              {health.kafka.consumer_groups.reduce((sum, cg) => sum + cg.lag, 0)} total lag
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Detection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={health.services.detectors.every(d => d.ok) ? 'default' : 'destructive'} className="mb-2">
              {health.services.detectors.every(d => d.ok) ? 'Active' : 'Issues'}
            </Badge>
            <div className="text-sm text-muted-foreground">
              {health.services.detectors.reduce((sum, d) => sum + (d.alerts_per_min || 0), 0)} alerts/min
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Animated Pipeline Flow */}
      <PipelineFlow health={health} />

      {/* Detailed Component Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ClickHouse Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                ClickHouse Metrics
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => handleDiagnose('clickhouse')}
                disabled={diagnosing}
              >
                <Eye className="h-4 w-4 mr-1" />
                Diagnose
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Inserts/sec</div>
                <div className="text-lg font-semibold">{health.clickhouse.inserts_per_sec}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Queries/sec</div>
                <div className="text-lg font-semibold">{health.clickhouse.queries_per_sec}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Ingest Delay</div>
                <div className="text-lg font-semibold">{health.clickhouse.ingest_delay_ms}ms</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Parts</div>
                <div className="text-lg font-semibold">{health.clickhouse.parts}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Redis Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Redis Metrics
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => handleDiagnose('redis')}
                disabled={diagnosing}
              >
                <Eye className="h-4 w-4 mr-1" />
                Diagnose
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Memory Usage</div>
                <div className="text-lg font-semibold">{health.redis.used_memory_mb}MB</div>
                <Progress 
                  value={(health.redis.used_memory_mb / health.redis.maxmemory_mb) * 100} 
                  className="mt-1 h-1" 
                />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Hit Ratio</div>
                <div className="text-lg font-semibold">{health.redis.hit_ratio_pct.toFixed(1)}%</div>
                <Progress value={health.redis.hit_ratio_pct} className="mt-1 h-1" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Operations/sec</div>
                <div className="text-lg font-semibold">{health.redis.ops_per_sec}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Connected Clients</div>
                <div className="text-lg font-semibold">{health.redis.connected_clients}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Kafka Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Kafka Consumer Groups
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => handleDiagnose('kafka')}
                disabled={diagnosing}
              >
                <Eye className="h-4 w-4 mr-1" />
                Diagnose
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {health.kafka.consumer_groups.map((cg) => (
                <div key={cg.group} className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{cg.group}</div>
                    <div className="text-xs text-muted-foreground">{cg.tps} TPS</div>
                  </div>
                  <div className="text-right">
                    <Badge variant={cg.lag < 1000 ? 'default' : cg.lag < 10000 ? 'secondary' : 'destructive'}>
                      {cg.lag} lag
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Services Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Service Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                ...health.services.ingestors.map(s => ({ ...s, type: 'Ingestor' })),
                ...health.services.parsers.map(s => ({ ...s, type: 'Parser' })),
                ...health.services.detectors.map(s => ({ ...s, type: 'Detector' })),
                ...health.services.sinks.map(s => ({ ...s, type: 'Sink' }))
              ].map((service, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{service.name}</div>
                    <div className="text-xs text-muted-foreground">{service.type}</div>
                  </div>
                  <Badge variant={service.ok ? 'default' : 'destructive'}>
                    {service.ok ? 'Running' : 'Down'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Error Management Panel */}
      {health.errors > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Issues & Auto-Fix ({health.errors})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              <AccordionItem value="high-lag">
                <AccordionTrigger className="text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">High</Badge>
                    Consumer group lag detected
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      The siem-parser consumer group has high lag ({health.kafka.consumer_groups.find(cg => cg.group === 'siem-parser')?.lag || 0} messages behind).
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleAutoFix('service_restart', { service: 'parser' }, false)}
                        disabled={fixing}
                      >
                        <PlayCircle className="h-4 w-4 mr-1" />
                        Dry Run
                      </Button>
                      <Button 
                        size="sm"
                        onClick={() => handleAutoFix('service_restart', { service: 'parser' }, true)}
                        disabled={fixing}
                      >
                        <Wrench className="h-4 w-4 mr-1" />
                        Restart Parser
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
}