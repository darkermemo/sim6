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
  const enhancedNode = (
    x: number,
    y: number,
    label: string,
    ok = true,
    primary?: string,
    secondary?: string,
    extraProps?: React.SVGProps<SVGGElement>
  ) => (
    <g transform={`translate(${x},${y})`} {...extraProps}>
      {/* Node background with theme-aware gradient */}
      <defs>
        <linearGradient id={`grad-${x}-${y}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={ok ? 'hsl(var(--card))' : 'hsl(var(--destructive) / 0.1)'} />
          <stop offset="100%" stopColor={ok ? 'hsl(var(--muted))' : 'hsl(var(--destructive) / 0.2)'} />
        </linearGradient>
      </defs>
      <rect rx={16} width={170} height={72} fill={`url(#grad-${x}-${y})`} 
        stroke={ok ? 'hsl(var(--k-border-light))' : 'hsl(var(--destructive))'} strokeWidth={2}
        filter="url(#softShadow)" />
      
      {/* Status indicator */}
      <circle cx={12} cy={12} r={6} fill={ok ? 'hsl(var(--status-ok))' : 'hsl(var(--status-bad))'}>
        {ok && <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />}
      </circle>
      
      {/* Main label */}
      <text x={85} y={24} textAnchor="middle" fontSize={13} fill="hsl(var(--foreground))" fontWeight={600}>{label}</text>
      
      {/* Primary metric */}
      {primary && <text x={85} y={42} textAnchor="middle" fontSize={11} fill="hsl(var(--foreground) / 0.85)" fontWeight={500}>{primary}</text>}
      
      {/* Secondary metric */}
      {secondary && <text x={85} y={58} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">{secondary}</text>}
    </g>
  );

  const enhancedArrow = (x1:number, y1:number, x2:number, y2:number, active:boolean, label?:string, speed = 1, curve = false) => (
    <g>
      <defs>
        <marker id="enhancedArrow" markerWidth="12" markerHeight="12" refX="8" refY="3" orient="auto">
          <path d="M0,0 L0,6 L9,3 z" fill={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} />
        </marker>
      </defs>
      {curve ? (
        <path
          d={`M ${x1} ${y1} C ${(x1+x2)/2} ${y1}, ${(x1+x2)/2} ${y2}, ${x2} ${y2}`}
          stroke={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
          strokeWidth={active ? Math.min(4, 1.5 + 0.5 * speed) : 2}
          fill="none"
          markerEnd="url(#enhancedArrow)"
          opacity={active ? 1 : 0.6}
          strokeDasharray={active ? '8 4' : '6 6'}
        >
          <animate attributeName="stroke-dashoffset" from="24" to="0" dur={`${2/speed}s`} repeatCount="indefinite" />
          {active && <animate attributeName="opacity" values="0.6;1;0.6" dur="1.5s" repeatCount="indefinite" />}
        </path>
      ) : (
        <line x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} strokeWidth={active ? Math.min(4, 1.5 + 0.5 * speed) : 2}
          strokeDasharray={active ? "8 4" : "6 6"} markerEnd="url(#enhancedArrow)"
          opacity={active ? 1 : 0.6}>
          <animate attributeName="stroke-dashoffset" from="24" to="0" dur={`${2/speed}s`} repeatCount="indefinite" />
          {active && <animate attributeName="opacity" values="0.6;1;0.6" dur="1.5s" repeatCount="indefinite" />}
        </line>
      )}
      {label && <text x={(x1+x2)/2} y={(y1+y2)/2 - 8} textAnchor="middle" fontSize={10} fill="hsl(var(--muted-foreground))" fontWeight={600}>{label}</text>}
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

  // ---------------------------------------------------------------------------
  // Draggable layout state
  // ---------------------------------------------------------------------------
  const NODE_W = 170;
  const NODE_H = 72;

  type NodeId =
    | 'data'
    | 'kafka'
    | 'ingestors'
    | 'dlq'
    | 'parsers'
    | 'redis'
    | 'clickhouse'
    | 'detectors';

  type NodeLayout = { x: number; y: number };

  const defaultLayout: Record<NodeId, NodeLayout> = {
    data: { x: 20, y: 117 },
    kafka: { x: 230, y: 117 },
    ingestors: { x: 450, y: 50 },
    dlq: { x: 450, y: 184 },
    parsers: { x: 590, y: 117 },
    redis: { x: 800, y: 50 },
    clickhouse: { x: 800, y: 184 },
    detectors: { x: 940, y: 117 },
  };

  const [layout, setLayout] = React.useState<Record<NodeId, NodeLayout>>(() => {
    try {
      const saved = window.localStorage.getItem('pipeline_layout');
      if (saved) return { ...defaultLayout, ...JSON.parse(saved) };
    } catch {}
    return defaultLayout;
  });

  React.useEffect(() => {
    try {
      window.localStorage.setItem('pipeline_layout', JSON.stringify(layout));
    } catch {}
  }, [layout]);

  const [dragId, setDragId] = React.useState<NodeId | null>(null);
  const dragOffset = React.useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const svgRef = React.useRef<SVGSVGElement | null>(null);

  const getPoint = (e: React.MouseEvent | MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: (e as MouseEvent).clientX - rect.left, y: (e as MouseEvent).clientY - rect.top };
  };

  const onNodeMouseDown = (id: NodeId) => (e: React.MouseEvent<SVGGElement>) => {
    e.preventDefault();
    const p = getPoint(e);
    const n = layout[id];
    dragOffset.current = { dx: p.x - n.x, dy: p.y - n.y };
    setDragId(id);
  };

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragId) return;
    const p = getPoint(e);
    const { dx, dy } = dragOffset.current;
    setLayout(prev => ({ ...prev, [dragId]: { x: p.x - dx, y: p.y - dy } }));
  };

  const endDrag = () => setDragId(null);

  const resetLayout = () => setLayout(defaultLayout);

  // Edge helpers
  const center = (id: NodeId) => {
    const n = layout[id];
    return { cx: n.x + NODE_W / 2, cy: n.y + NODE_H / 2 };
  };

  const edgePoints = (from: NodeId, to: NodeId) => {
    const a = layout[from];
    const b = layout[to];
    const fromRight = a.x <= b.x;
    const x1 = fromRight ? a.x + NODE_W : a.x;
    const y1 = a.y + NODE_H / 2;
    const x2 = fromRight ? b.x : b.x + NODE_W;
    const y2 = b.y + NODE_H / 2;
    return { x1, y1, x2, y2, curve: true };
  };

  return (
    <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
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
      <svg
        ref={svgRef}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        width="100%"
        height={360}
        viewBox="0 0 1200 360"
        preserveAspectRatio="xMidYMid meet"
        aria-label="Live pipeline data flow"
      >
        <defs>
          <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.15)" />
          </filter>
        </defs>
        {/* Enhanced pipeline with detailed metrics */}
        {enhancedNode(layout.data.x, layout.data.y, 'Data Sources', true, `${agentsEPS.toLocaleString()} eps`, `244K+ events total`, { onMouseDown: onNodeMouseDown('data'), cursor: 'move' })}
        {(() => { const { x1,y1,x2,y2,curve } = edgePoints('data','kafka'); return enhancedArrow(x1,y1,x2,y2, agentsEPS>0, `${agentsEPS.toLocaleString()} eps`, flowSpeed, curve); })()}

        {enhancedNode(layout.kafka.x, layout.kafka.y, 'Kafka Queue', okKafka, topicSummary(h), `${totalLag.toLocaleString()} lag`, { onMouseDown: onNodeMouseDown('kafka'), cursor: 'move' })}
        {(() => { const { x1,y1,x2,y2,curve } = edgePoints('kafka','ingestors'); return enhancedArrow(x1,y1,x2,y2, okKafka && epsRaw>0, undefined, flowSpeed, curve); })()}

        {enhancedNode(layout.ingestors.x, layout.ingestors.y, 'Ingestors', okIngest, `${sumEPS(s?.ingestors)} eps`, `${s?.ingestors?.length || 0} services`, { onMouseDown: onNodeMouseDown('ingestors'), cursor: 'move' })}
        {(() => { const { x1,y1,x2,y2,curve } = edgePoints('kafka','ingestors'); return enhancedArrow(x1,y1,x2,y2, okIngest && epsRaw>0, undefined, flowSpeed, curve); })()}
        
        {enhancedNode(layout.dlq.x, layout.dlq.y, 'DLQ Handler', dlq > 0, `${dlq} eps`, 'Failed events', { onMouseDown: onNodeMouseDown('dlq'), cursor: 'move' })}
        {(() => { const { x1,y1,x2,y2,curve } = edgePoints('ingestors','dlq'); return enhancedArrow(x1,y1,x2,y2, dlq > 0, `${dlq} errors/s`, flowSpeed * 0.5, curve); })()}

        {enhancedNode(layout.parsers.x, layout.parsers.y, 'Parsers', okParsers, `${epsParsed.toLocaleString()} eps`, `${(parsersErr||0).toFixed(1)}% error rate`, { onMouseDown: onNodeMouseDown('parsers'), cursor: 'move' })}
        {(() => { const { x1,y1,x2,y2,curve } = edgePoints('ingestors','parsers'); return enhancedArrow(x1,y1,x2,y2, okParsers && epsParsed>0, undefined, flowSpeed, curve); })()}

        {enhancedNode(layout.redis.x, layout.redis.y, 'Redis Cache', okRedis, `${Math.round(h?.redis.ops_per_sec||0)} ops/s`, `${redisHitRatio.toFixed(1)}% hit ratio`, { onMouseDown: onNodeMouseDown('redis'), cursor: 'move' })}
        {(() => { const { x1,y1,x2,y2,curve } = edgePoints('parsers','redis'); return enhancedArrow(x1,y1,x2,y2, okRedis && epsParsed>0, undefined, flowSpeed, curve); })()}

        {enhancedNode(layout.clickhouse.x, layout.clickhouse.y, 'ClickHouse', okCH, `${Math.round(h?.clickhouse.inserts_per_sec||0)} ins/s`, `${chQueriesPerSec} queries/s`, { onMouseDown: onNodeMouseDown('clickhouse'), cursor: 'move' })}
        {(() => { const { x1,y1,x2,y2,curve } = edgePoints('redis','clickhouse'); return enhancedArrow(x1,y1,x2,y2, okCH && epsParsed>0, undefined, flowSpeed, curve); })()}

        {enhancedNode(layout.detectors.x, layout.detectors.y, 'Threat Detection', okDet, `${sumAlerts(s?.detectors)} alerts/min`, `${s?.detectors?.length || 0} detectors`, { onMouseDown: onNodeMouseDown('detectors'), cursor: 'move' })}
        
        {/* Legend & indicators */}
        <g transform="translate(20, 16)">
          <rect x={-10} y={-16} width={420} height={36} rx={8} fill="#f8fafc" stroke="#e2e8f0" />
          <text x={0} y={0} fontSize={12} fill="#475569" fontWeight={600}>Indicators</text>
          <circle cx={110} cy={-5} r={4} fill={overall === 'up' ? '#10b981' : overall === 'degraded' ? '#f59e0b' : '#ef4444'} />
          <text x={118} y={0} fontSize={10} fill="#64748b">Overall: {overall.toUpperCase()}</text>
          <circle cx={260} cy={-5} r={4} fill={avgLatency < 100 ? '#10b981' : avgLatency < 500 ? '#f59e0b' : '#ef4444'} />
          <text x={268} y={0} fontSize={10} fill="#64748b">Latency: {avgLatency}ms</text>
          <circle cx={380} cy={-5} r={4} fill={parseSuccessRate > 95 ? '#10b981' : parseSuccessRate > 80 ? '#f59e0b' : '#ef4444'} />
          <text x={388} y={0} fontSize={10} fill="#64748b">Parse: {(h?.pipeline?.parse_success_pct || 0).toFixed(1)}%</text>
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