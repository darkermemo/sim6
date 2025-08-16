'use client';
import React from 'react';
import type { HealthSummary } from '@/types/health';

/**
 * Minimal, animated SVG of the pipeline with live values.
 * Nodes: Agents → Kafka → Ingestors → Parsers → Redis → ClickHouse → Detectors → Alerts
 */
export function PipelineFlow({ h }: { h: HealthSummary | null }) {
  const s = h?.services; // shortcuts
  const epsRaw = h?.pipeline.eps_raw ?? 0;
  const epsParsed = h?.pipeline.eps_parsed ?? 0;
  const dlq = h?.pipeline.dlq_eps ?? 0;

  const node = (x: number, y: number, label: string, ok = true, sub?: string) => (
    <g transform={`translate(${x},${y})`}>
      <rect rx={14} width={160} height={66} fill={ok ? '#111827' : '#3f1d1d'} stroke={ok ? '#374151' : '#ef4444'} strokeWidth={1.5} />
      <text x={80} y={26} textAnchor="middle" fontSize={14} fill="#e5e7eb" fontWeight={600}>{label}</text>
      {sub ? <text x={80} y={46} textAnchor="middle" fontSize={12} fill="#9ca3af">{sub}</text> : null}
    </g>
  );

  const arrow = (x1:number, y1:number, x2:number, y2:number, active:boolean, label?:string) => (
    <g>
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L9,3 z" fill={active ? '#60a5fa' : '#6b7280'} />
        </marker>
      </defs>
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={active ? '#60a5fa' : '#6b7280'} strokeWidth={2}
        strokeDasharray="6 6" markerEnd="url(#arrow)">
        <animate attributeName="stroke-dashoffset" from="24" to="0" dur={active ? '0.9s' : '2s'} repeatCount="indefinite" />
      </line>
      {label && <text x={(x1+x2)/2} y={(y1+y2)/2 - 8} textAnchor="middle" fontSize={11} fill="#9ca3af">{label}</text>}
    </g>
  );

  // Enhanced components with more details
  const enhancedNode = (x: number, y: number, label: string, ok = true, primary?: string, secondary?: string) => (
    <g transform={`translate(${x},${y})`}>
      {/* Node background with light theme gradient */}
      <defs>
        <linearGradient id={`grad-${x}-${y}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={ok ? '#f8fafc' : '#fef2f2'} />
          <stop offset="100%" stopColor={ok ? '#e2e8f0' : '#fecaca'} />
        </linearGradient>
      </defs>
      <rect rx={16} width={160} height={66} fill={`url(#grad-${x}-${y})`} 
        stroke={ok ? '#64748b' : '#ef4444'} strokeWidth={2}
        className={ok ? 'drop-shadow-md' : 'drop-shadow-lg'} />
      
      {/* Status indicator */}
      <circle cx={12} cy={12} r={6} fill={ok ? '#10b981' : '#ef4444'}>
        {ok && <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />}
      </circle>
      
      {/* Main label */}
      <text x={80} y={22} textAnchor="middle" fontSize={13} fill="#1e293b" fontWeight={600}>{label}</text>
      
      {/* Primary metric */}
      {primary && <text x={80} y={38} textAnchor="middle" fontSize={11} fill="#334155" fontWeight={500}>{primary}</text>}
      
      {/* Secondary metric */}
      {secondary && <text x={80} y={52} textAnchor="middle" fontSize={9} fill="#64748b">{secondary}</text>}
    </g>
  );

  const enhancedArrow = (x1:number, y1:number, x2:number, y2:number, active:boolean, label?:string, speed = 1) => (
    <g>
      <defs>
        <marker id="enhancedArrow" markerWidth="12" markerHeight="12" refX="8" refY="3" orient="auto">
          <path d="M0,0 L0,6 L9,3 z" fill={active ? '#3b82f6' : '#6b7280'} />
        </marker>
      </defs>
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={active ? '#3b82f6' : '#6b7280'} strokeWidth={active ? 3 : 2}
        strokeDasharray={active ? "8 4" : "6 6"} markerEnd="url(#enhancedArrow)"
        opacity={active ? 1 : 0.6}>
        <animate attributeName="stroke-dashoffset" from="24" to="0" dur={`${2/speed}s`} repeatCount="indefinite" />
        {active && <animate attributeName="opacity" values="0.6;1;0.6" dur="1.5s" repeatCount="indefinite" />}
      </line>
      {label && <text x={(x1+x2)/2} y={(y1+y2)/2 - 8} textAnchor="middle" fontSize={10} fill="#475569" fontWeight={500}>{label}</text>}
    </g>
  );

  // Status signals
  const okKafka = !!h?.kafka.ok;
  const okRedis = !!h?.redis.ok;
  const okCH = !!h?.clickhouse.ok;
  const okIngest = (s?.ingestors?.every(i => i.ok) ?? false) && (s?.ingestors?.length ?? 0) > 0;
  const okParsers = (s?.parsers?.every(p => p.ok) ?? false) && (s?.parsers?.length ?? 0) > 0;
  const okDet = (s?.detectors?.every(d => d.ok) ?? false) && (s?.detectors?.length ?? 0) > 0;

  const agentsEPS = epsRaw;
  const parsersErr = s?.parsers?.reduce((a,b)=> a + (b.error_rate_pct||0), 0) ?? 0;
  
  // Enhanced metrics calculations
  const totalLag = Object.values(h?.kafka?.topics || {}).reduce((sum, topic) => sum + topic.lag_total, 0);
  const avgLatency = h?.pipeline?.ingest_latency_ms_p50 || 0;
  const redisHitRatio = h?.redis?.hit_ratio_pct || 0;
  const chQueriesPerSec = h?.clickhouse?.queries_per_sec || 0;
  
  // Animation speeds based on throughput
  const flowSpeed = Math.max(0.5, Math.min(3, (epsRaw + epsParsed) / 100));
  
  // Overall system status
  const overall = h?.overall ?? 'down';
  const parseSuccessRate = h?.pipeline?.parse_success_pct ?? 0;

  return (
    <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Live Pipeline Flow</h3>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full animate-pulse status-ok"></div>
            <span>Live Data</span>
          </div>
          <span>Flow Rate: {flowSpeed.toFixed(1)}x</span>
          <span>Avg Latency: {avgLatency}ms</span>
        </div>
      </div>
      <svg width={1200} height={300} viewBox="0 0 1200 300">
        {/* Enhanced pipeline with detailed metrics */}
        {enhancedNode(20, 117, 'Data Sources', true, `${agentsEPS.toLocaleString()} eps`, `244K+ events total`)}
        {enhancedArrow(180, 150, 230, 150, agentsEPS>0, `${agentsEPS.toLocaleString()} eps`, flowSpeed)}

        {enhancedNode(230, 117, 'Kafka Queue', okKafka, topicSummary(h), `${totalLag.toLocaleString()} lag`)}
        {enhancedArrow(390, 150, 450, 150, okKafka && epsRaw>0, undefined, flowSpeed)}

        {enhancedNode(450, 50, 'Ingestors', okIngest, `${sumEPS(s?.ingestors)} eps`, `${s?.ingestors?.length || 0} services`)}
        {enhancedArrow(530, 117, 530, 83, okIngest && epsRaw>0, undefined, flowSpeed)}
        
        {enhancedNode(450, 184, 'DLQ Handler', dlq > 0, `${dlq} eps`, 'Failed events')}
        {enhancedArrow(530, 150, 530, 184, dlq > 0, `${dlq} errors/s`, flowSpeed * 0.5)}

        {enhancedNode(590, 117, 'Parsers', okParsers, `${epsParsed.toLocaleString()} eps`, `${(parsersErr||0).toFixed(1)}% error rate`)}
        {enhancedArrow(750, 150, 800, 120, okParsers && epsParsed>0, undefined, flowSpeed)}
        {enhancedArrow(750, 150, 800, 180, okParsers && epsParsed>0, undefined, flowSpeed)}

        {enhancedNode(800, 50, 'Redis Cache', okRedis, `${Math.round(h?.redis.ops_per_sec||0)} ops/s`, `${redisHitRatio.toFixed(1)}% hit ratio`)}
        {enhancedArrow(880, 117, 880, 83, okRedis && epsParsed>0, undefined, flowSpeed)}

        {enhancedNode(800, 184, 'ClickHouse', okCH, `${Math.round(h?.clickhouse.inserts_per_sec||0)} ins/s`, `${chQueriesPerSec} queries/s`)}
        {enhancedArrow(880, 184, 880, 150, okCH && epsParsed>0, undefined, flowSpeed)}

        {enhancedNode(940, 117, 'Threat Detection', okDet, `${sumAlerts(s?.detectors)} alerts/min`, `${s?.detectors?.length || 0} detectors`)}
        
        {/* Performance indicators */}
        <g transform="translate(20, 20)">
          <text x={0} y={0} fontSize={12} fill="#475569" fontWeight={500}>Pipeline Health Indicators:</text>
          <circle cx={180} cy={-5} r={4} fill={overall === 'up' ? '#10b981' : overall === 'degraded' ? '#f59e0b' : '#ef4444'} />
          <text x={190} y={0} fontSize={10} fill="#64748b">Overall: {overall.toUpperCase()}</text>
          
          <circle cx={300} cy={-5} r={4} fill={avgLatency < 100 ? '#10b981' : avgLatency < 500 ? '#f59e0b' : '#ef4444'} />
          <text x={310} y={0} fontSize={10} fill="#64748b">Latency: {avgLatency}ms</text>
          
          <circle cx={450} cy={-5} r={4} fill={parseSuccessRate > 95 ? '#10b981' : parseSuccessRate > 80 ? '#f59e0b' : '#ef4444'} />
          <text x={460} y={0} fontSize={10} fill="#64748b">Parse Rate: {(h?.pipeline?.parse_success_pct || 0).toFixed(1)}%</text>
        </g>
      </svg>
    </div>
  );
}

function sumEPS(items?: {eps?: number}[]) { 
  return (items||[]).reduce((a,b)=> a+(b.eps||0), 0).toLocaleString(); 
}

function sumAlerts(items?: {alerts_per_min?: number}[]) { 
  return (items||[]).reduce((a,b)=> a+(b.alerts_per_min||0), 0).toLocaleString(); 
}

function topicSummary(h?: HealthSummary | null) {
  if (!h?.kafka?.topics) return '—';
  const names = Object.keys(h.kafka.topics);
  if (!names.length) return '—';
  const lag = names.reduce((a,n)=> a+(h.kafka.topics[n]?.lag_total||0), 0);
  const bin = names.reduce((a,n)=> a+(h.kafka.topics[n]?.bytes_in_per_sec||0), 0);
  return `${names.length} topics · lag ${lag.toLocaleString()} · ${fmtBytes(bin)}/s in`;
}

function fmtBytes(bps:number){ 
  if(!bps) return '0B'; 
  const units=['B','KB','MB','GB']; 
  let u=0; 
  let v=bps; 
  while(v>1024 && u<units.length-1){
    v/=1024;
    u++;
  } 
  return `${v.toFixed(1)}${units[u]}`; 
}