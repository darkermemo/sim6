'use client';
import { useEffect, useMemo, useState } from 'react';
import { getHealthSummary, openHealthStream, diagnoseComponent, executeAutoFix, getHealthErrors } from '@/lib/health-api';
import type { HealthSummary, HealthDelta } from '@/types/health';
import { PipelineFlow } from '@/components/health/PipelineFlow';
import { ActionButton } from '@/components/ui/ActionButton';
import { Badge } from '@/components/ui/badge';
import { Card as UICard, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AlertTriangle, CheckCircle, Eye, Wrench, PlayCircle, RefreshCw, Zap, Activity, TrendingUp, Clock } from 'lucide-react';

export default function HealthPage() {
  const [data, setData] = useState<HealthSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [since, setSince] = useState<string | null>(null);
  const [errors, setErrors] = useState<any[]>([]);
  const [diagnosing, setDiagnosing] = useState<string | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const [liveMode, setLiveMode] = useState(true);

  const isAbortError = (e: unknown) => typeof e === 'object' && e !== null && (e as any).name === 'AbortError';

  useEffect(() => {
    const ctrl = new AbortController();
    
    // Fetch initial data
    Promise.all([
      getHealthSummary(ctrl.signal),
      getHealthErrors()
    ]).then(([healthData, errorsData]) => {
      setData(healthData);
      setErrors(errorsData);
      setSince(new Date().toLocaleTimeString());
    }).catch((e) => {
      if (isAbortError(e)) return; // ignore expected aborts (e.g., React StrictMode cleanup)
      setErr(String(e));
    });

    // Temporarily disable SSE stream due to backend socket issues
    // TODO: Re-enable when backend SSE is stable
    const close = () => {}; // Disabled: liveMode ? openHealthStream(...) : () => {};
    
    // Add periodic refresh when live mode is enabled (since SSE is disabled)
    const intervalId = liveMode ? setInterval(async () => {
      try {
        const [healthData, errorsData] = await Promise.all([
          getHealthSummary(),
          getHealthErrors()
        ]);
        setData(healthData);
        setErrors(errorsData);
        setSince(new Date().toLocaleTimeString());
      } catch (error) {
        if (!isAbortError(error)) {
          console.warn('Periodic refresh failed:', error);
        }
      }
    }, 5000) : null; // Refresh every 5 seconds in live mode

    return () => { 
      ctrl.abort(); 
      close(); 
      if (intervalId) clearInterval(intervalId);
    };
  }, [liveMode]);

  const handleDiagnose = async (component: "clickhouse" | "redis" | "kafka" | "pipeline") => {
    setDiagnosing(component);
    try {
      const result = await diagnoseComponent({ component });
      console.log('Diagnostic result:', result);
      // In production, show result in modal/toast
      alert(`Diagnosis for ${component}:\n${result.issues.join('\n') || 'No issues found'}\n\nRecommendations:\n${result.recommendations.join('\n')}`);
    } catch (error) {
      console.error('Diagnosis failed:', error);
      alert(`Diagnosis failed: ${error}`);
    } finally {
      setDiagnosing(null);
    }
  };

  const handleAutoFix = async (errorId?: string, fixKind?: string, dryRun = false) => {
    setFixing(errorId || fixKind || 'auto');
    try {
      const result = await executeAutoFix({ 
        error_id: errorId, 
        fix_kind: fixKind, 
        dry_run: dryRun 
      });
      console.log('Auto-fix result:', result);
      alert(`Auto-fix ${dryRun ? 'dry-run' : 'execution'} ${result.status}:\n${result.actions.join('\n')}\nRisk: ${result.risk_level}`);
      
      // Refresh data after auto-fix
      if (!dryRun && result.status === 'completed') {
        const healthData = await getHealthSummary();
        setData(healthData);
        setSince(new Date().toLocaleTimeString());
      }
    } catch (error) {
      console.error('Auto-fix failed:', error);
      alert(`Auto-fix failed: ${error}`);
    } finally {
      setFixing(null);
    }
  };

  const refreshData = async () => {
    try {
      const [healthData, errorsData] = await Promise.all([
        getHealthSummary(),
        getHealthErrors()
      ]);
      setData(healthData);
      setErrors(errorsData);
      setSince(new Date().toLocaleTimeString());
    } catch (error) {
      if (isAbortError(error)) return;
      setErr(String(error));
    }
  };

  const overall = data?.overall ?? 'down';
  const badge = overall === 'up' ? 'bg-emerald-500 text-emerald-300 ring-1 ring-emerald-500/30' : overall === 'degraded' ? 'bg-amber-500 text-amber-300 ring-1 ring-amber-500/30' : 'bg-rose-500 text-rose-300 ring-1 ring-rose-500/30';

  // Calculate enhanced metrics
  const totalEvents = 244540; // From our test query
  const eventsPerSecond = data?.pipeline?.eps_parsed || 0;
  const parseSuccessRate = data?.pipeline?.parse_success_pct || 0;
  const totalErrors = errors.length;
  
  if (err) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-neutral-200">System Health</h1>
          <ActionButton 
            onClick={refreshData} 
            variant="outline" 
            size="sm"
            data-action="health:status:refresh"
            data-intent="api"
            data-endpoint="/api/v2/health"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </ActionButton>
        </div>
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Failed to load health data: {err}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Removed test watermark */}

      {/* Enhanced Header with Controls */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Health Control Room</h1>
          <p className="text-sm text-muted-foreground">Real-time system monitoring and automated remediation</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span>Last updated: {since || 'Never'}</span>
            {totalErrors > 0 && (
              <span className="text-destructive">
                {totalErrors} error{totalErrors > 1 ? 's' : ''} detected
              </span>
            )}
            <span>Total Events: {totalEvents.toLocaleString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${badge}`}>
            {overall.toUpperCase()}
          </div>
          <ActionButton 
            onClick={() => setLiveMode(!liveMode)} 
            variant={liveMode ? "default" : "outline"} 
            size="sm"
            data-action="health:mode:toggle"
            data-intent="open-modal"
          >
            <Zap className="h-4 w-4 mr-2" />
            {liveMode ? 'Live' : 'Static'}
          </ActionButton>
          <ActionButton 
            onClick={refreshData} 
            variant="outline" 
            size="sm"
            data-action="health:status:refresh"
            data-intent="api"
            data-endpoint="/api/v2/health"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </ActionButton>
        </div>
      </header>

      {/* Enhanced KPI Dashboard */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <UICard>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Events/Sec
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{eventsPerSecond.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {parseSuccessRate.toFixed(1)}% parse success
            </p>
          </CardContent>
        </UICard>
        
        <UICard>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              ClickHouse
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={data?.clickhouse?.ok ? 'default' : 'destructive'}>
                {data?.clickhouse?.ok ? 'Healthy' : 'Down'}
              </Badge>
              <ActionButton 
                size="sm" 
                variant="ghost" 
                onClick={() => handleDiagnose('clickhouse')}
                disabled={diagnosing === 'clickhouse'}
                className="h-6 w-6 p-0"
                data-action="health:clickhouse:diagnose"
                data-intent="api"
                data-endpoint="/api/v2/health/diagnose"
              >
                <Eye className="h-3 w-3" />
              </ActionButton>
            </div>
            <div className="text-xs text-muted-foreground">
              {Math.round(data?.clickhouse?.inserts_per_sec || 0)} IPS, {Math.round(data?.clickhouse?.ingest_delay_ms || 0)}ms delay
            </div>
          </CardContent>
        </UICard>
        
        <UICard>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-orange-500" />
              Redis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={data?.redis?.ok ? 'default' : 'destructive'}>
                {data?.redis?.ok ? 'Healthy' : 'Down'}
              </Badge>
              <ActionButton 
                size="sm" 
                variant="ghost" 
                onClick={() => handleDiagnose('redis')}
                disabled={diagnosing === 'redis'}
                className="h-6 w-6 p-0"
                data-action="health:redis:diagnose"
                data-intent="api"
                data-endpoint="/api/v2/health/diagnose"
              >
                <Eye className="h-3 w-3" />
              </ActionButton>
            </div>
            <div className="text-xs text-muted-foreground">
              {Math.round(data?.redis?.ops_per_sec || 0)} OPS, {Math.round(data?.redis?.used_memory_mb || 0)}MB used
            </div>
          </CardContent>
        </UICard>
        
        <UICard>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-purple-500" />
              Kafka
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={data?.kafka?.ok ? 'default' : 'destructive'}>
                {data?.kafka?.ok ? 'Healthy' : 'Down'}
              </Badge>
              <ActionButton 
                size="sm" 
                variant="ghost" 
                onClick={() => handleDiagnose('kafka')}
                disabled={diagnosing === 'kafka'}
                className="h-6 w-6 p-0"
                data-action="health:kafka:diagnose"
                data-intent="api"
                data-endpoint="/api/v2/health/diagnose"
              >
                <Eye className="h-3 w-3" />
              </ActionButton>
            </div>
            <div className="text-xs text-muted-foreground">
              {(data?.kafka?.brokers?.length || 0)} brokers, {Object.keys(data?.kafka?.topics || {}).length} topics
            </div>
          </CardContent>
        </UICard>
      </section>

      {/* Enhanced Pipeline Flow */}
      <PipelineFlow h={data} />

      {/* Error Management & Auto-Fix Panel */}
      {totalErrors > 0 && (
        <UICard className="border-red-800 bg-red-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-300">
              <AlertTriangle className="h-5 w-5" />
              Active Issues & Remediation ({totalErrors})
            </CardTitle>
            <CardDescription className="text-red-200">
              Automated error detection and one-click fixes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              {errors.map((error, i) => (
                <AccordionItem key={i} value={`error-${i}`}>
                  <AccordionTrigger className="text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">{error.severity || 'High'}</Badge>
                      {error.name || `Error ${i + 1}`}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      <p className="text-sm text-neutral-300">
                        {error.description || 'System issue detected'}
                      </p>
                      <div className="flex gap-2">
                        <ActionButton 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleAutoFix(error.id, undefined, true)}
                          disabled={fixing === error.id}
                          data-action="health:error:dry-run"
                          data-intent="api"
                          data-endpoint="/api/v2/health/autofix"
                        >
                          <PlayCircle className="h-4 w-4 mr-1" />
                          Dry Run
                        </ActionButton>
                        <ActionButton 
                          size="sm"
                          onClick={() => handleAutoFix(error.id, undefined, false)}
                          disabled={fixing === error.id}
                          data-action="health:error:autofix"
                          data-intent="api"
                          data-endpoint="/api/v2/health/autofix"
                          data-danger="true"
                        >
                          <Wrench className="h-4 w-4 mr-1" />
                          Auto-Fix
                        </ActionButton>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </UICard>
      )}

      {/* System Performance Metrics */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <UICard>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Performance Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Ingest Latency P50</div>
                <div className="text-lg font-semibold">{data?.pipeline?.ingest_latency_ms_p50 || 0}ms</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Ingest Latency P95</div>
                <div className="text-lg font-semibold">{data?.pipeline?.ingest_latency_ms_p95 || 0}ms</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">DLQ Events/sec</div>
                <div className="text-lg font-semibold">{data?.pipeline?.dlq_eps || 0}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Parse Success Rate</div>
                <div className="text-lg font-semibold">{parseSuccessRate.toFixed(1)}%</div>
              </div>
            </div>
          </CardContent>
        </UICard>

        <UICard>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton 
                size="sm" 
                variant="outline" 
                onClick={() => handleDiagnose('pipeline')}
                disabled={diagnosing === 'pipeline'}
                data-action="health:pipeline:diagnose"
                data-intent="api"
                data-endpoint="/api/v2/health/diagnose"
              >
                <Eye className="h-4 w-4 mr-1" />
                Diagnose Pipeline
              </ActionButton>
              <ActionButton 
                size="sm" 
                variant="outline"
                onClick={() => handleAutoFix(undefined, 'pipeline_restart', true)}
                disabled={fixing === 'pipeline_restart'}
                data-action="health:pipeline:test-restart"
                data-intent="api"
                data-endpoint="/api/v2/health/autofix"
              >
                <PlayCircle className="h-4 w-4 mr-1" />
                Test Restart
              </ActionButton>
              <ActionButton 
                size="sm" 
                variant="outline"
                onClick={() => handleAutoFix(undefined, 'cache_clear', false)}
                disabled={fixing === 'cache_clear'}
                data-action="health:cache:clear"
                data-intent="api"
                data-endpoint="/api/v2/health/autofix"
                data-danger="true"
              >
                <Wrench className="h-4 w-4 mr-1" />
                Clear Cache
              </ActionButton>
              <ActionButton 
                size="sm" 
                variant="outline"
                onClick={() => handleAutoFix(undefined, 'optimize_performance', true)}
                disabled={fixing === 'optimize_performance'}
                data-action="health:performance:optimize"
                data-intent="api"
                data-endpoint="/api/v2/health/autofix"
              >
                <TrendingUp className="h-4 w-4 mr-1" />
                Optimize
              </ActionButton>
            </div>
          </CardContent>
        </UICard>
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }){
  return (
    <div className="rounded-xl bg-neutral-950 ring-1 ring-neutral-800 p-4">
      <div className="text-sm text-neutral-400 mb-2">{title}</div>
      <div className="space-y-1 text-neutral-200 text-sm">{children}</div>
    </div>
  );
}

function stat(label:string, value:string){
  return (
    <div className="flex items-center justify-between">
      <span className="text-neutral-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function mergeSummary(prev: HealthSummary | null, delta: Partial<HealthSummary>): HealthSummary | null {
  if (!prev) return delta as HealthSummary;
  // Deep, but shallow per section to keep perf simple.
  return {
    ...prev,
    ...delta,
    pipeline: { ...prev.pipeline, ...(delta.pipeline||{}) },
    kafka: {
      ...prev.kafka,
      ...(delta.kafka||{}),
      topics: { ...prev.kafka.topics, ...(delta.kafka?.topics||{}) },
      consumer_groups: delta.kafka?.consumer_groups ?? prev.kafka.consumer_groups,
    },
    redis: { ...prev.redis, ...(delta.redis||{}) },
    clickhouse: { ...prev.clickhouse, ...(delta.clickhouse||{}) },
    services: {
      ...prev.services,
      ...delta.services,
      ingestors: delta.services?.ingestors ?? prev.services.ingestors,
      parsers: delta.services?.parsers ?? prev.services.parsers,
      detectors: delta.services?.detectors ?? prev.services.detectors,
      sinks: delta.services?.sinks ?? prev.services.sinks,
    },
    ui: { ...prev.ui, ...(delta.ui||{}) },
  };
}