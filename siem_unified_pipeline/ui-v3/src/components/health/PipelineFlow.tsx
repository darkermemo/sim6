"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { HealthSummary } from '@/types/health';

interface PipelineFlowProps {
  health: HealthSummary;
  className?: string;
}

interface PipelineNode {
  id: string;
  label: string;
  x: number;
  y: number;
  status: 'healthy' | 'degraded' | 'down';
  metrics?: string[];
}

interface PipelineEdge {
  from: string;
  to: string;
  throughput: number;
  latency?: number;
  errorRate?: number;
}

export function PipelineFlow({ health, className = '' }: PipelineFlowProps) {
  // Define pipeline nodes
  const nodes: PipelineNode[] = [
    {
      id: 'agents',
      label: 'Agents',
      x: 50,
      y: 200,
      status: 'healthy',
      metrics: ['6.2k RPS'],
    },
    {
      id: 'ingestors',
      label: 'Ingestors',
      x: 180,
      y: 200,
      status: health.services.ingestors.every(s => s.ok) ? 'healthy' : 'degraded',
      metrics: [`${health.pipeline.eps_raw} EPS`],
    },
    {
      id: 'kafka-raw',
      label: 'Kafka\n(Raw)',
      x: 320,
      y: 150,
      status: health.kafka.ok ? 'healthy' : 'down',
      metrics: [`${Math.round(health.kafka.bytes_in_sec / 1024 / 1024)} MB/s`],
    },
    {
      id: 'parsers',
      label: 'Parsers',
      x: 460,
      y: 200,
      status: health.services.parsers.every(s => s.ok) ? 'healthy' : 'degraded',
      metrics: [`${health.pipeline.parse_success_pct.toFixed(1)}% success`],
    },
    {
      id: 'kafka-parsed',
      label: 'Kafka\n(Parsed)',
      x: 600,
      y: 150,
      status: health.kafka.ok ? 'healthy' : 'down',
      metrics: [`${health.pipeline.eps_parsed} EPS`],
    },
    {
      id: 'ch-sink',
      label: 'CH Sink',
      x: 740,
      y: 200,
      status: health.services.sinks.every(s => s.ok) ? 'healthy' : 'degraded',
      metrics: [`${health.clickhouse.inserts_per_sec} IPS`],
    },
    {
      id: 'clickhouse',
      label: 'ClickHouse',
      x: 880,
      y: 200,
      status: health.clickhouse.ok ? 'healthy' : 'down',
      metrics: [
        `${health.clickhouse.ingest_delay_ms}ms delay`,
        `${health.clickhouse.parts} parts`,
      ],
    },
    {
      id: 'api',
      label: 'API',
      x: 1020,
      y: 200,
      status: 'healthy',
      metrics: [`${health.clickhouse.queries_per_sec} QPS`],
    },
    {
      id: 'ui',
      label: 'UI',
      x: 1160,
      y: 200,
      status: 'healthy',
      metrics: [`${health.ui.sse_clients} clients`],
    },
    // DLQ path
    {
      id: 'dlq',
      label: 'DLQ',
      x: 460,
      y: 320,
      status: health.pipeline.dlq_eps > 100 ? 'degraded' : 'healthy',
      metrics: [`${health.pipeline.dlq_eps} EPS`],
    },
  ];

  // Define edges with data flow
  const edges: PipelineEdge[] = [
    { from: 'agents', to: 'ingestors', throughput: health.pipeline.eps_raw },
    { from: 'ingestors', to: 'kafka-raw', throughput: health.pipeline.eps_raw },
    { from: 'kafka-raw', to: 'parsers', throughput: health.pipeline.eps_raw },
    { from: 'parsers', to: 'kafka-parsed', throughput: health.pipeline.eps_parsed },
    { from: 'parsers', to: 'dlq', throughput: health.pipeline.dlq_eps, errorRate: 1 - health.pipeline.parse_success_pct / 100 },
    { from: 'kafka-parsed', to: 'ch-sink', throughput: health.pipeline.eps_parsed },
    { from: 'ch-sink', to: 'clickhouse', throughput: health.clickhouse.inserts_per_sec },
    { from: 'clickhouse', to: 'api', throughput: health.clickhouse.queries_per_sec },
    { from: 'api', to: 'ui', throughput: health.clickhouse.queries_per_sec },
  ];

  const getNodeColor = (status: PipelineNode['status']) => {
    switch (status) {
      case 'healthy': return '#10b981'; // green-500
      case 'degraded': return '#f59e0b'; // amber-500
      case 'down': return '#ef4444'; // red-500
    }
  };

  const getNodeVariant = (status: PipelineNode['status']) => {
    switch (status) {
      case 'healthy': return 'default';
      case 'degraded': return 'secondary';
      case 'down': return 'destructive';
    }
  };

  const getEdgePath = (edge: PipelineEdge) => {
    const fromNode = nodes.find(n => n.id === edge.from);
    const toNode = nodes.find(n => n.id === edge.to);
    
    if (!fromNode || !toNode) return '';

    const x1 = fromNode.x + 60; // Node width offset
    const y1 = fromNode.y + 20; // Node height center
    const x2 = toNode.x;
    const y2 = toNode.y + 20;

    // Create a smooth curve for the connection
    const midX = (x1 + x2) / 2;
    return `M ${x1} ${y1} Q ${midX} ${y1} ${x2} ${y2}`;
  };

  const getFlowSpeed = (throughput: number) => {
    // Convert throughput to animation speed (higher throughput = faster animation)
    return Math.max(0.5, Math.min(5, throughput / 1000));
  };

  return (
    <Card className={`w-full ${className}`}>
      <CardContent className="p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Data Pipeline Flow</h3>
          <p className="text-sm text-muted-foreground">
            Real-time view of data flowing through the SIEM pipeline
          </p>
        </div>
        
        <div className="relative overflow-x-auto">
          <svg 
            width="1240" 
            height="400" 
            viewBox="0 0 1240 400"
            className="w-full h-auto"
          >
            {/* Define gradients for glowing effects */}
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge> 
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              
              <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="transparent" />
                <stop offset="30%" stopColor="rgba(59, 130, 246, 0.6)" />
                <stop offset="70%" stopColor="rgba(59, 130, 246, 0.6)" />
                <stop offset="100%" stopColor="transparent" />
              </linearGradient>
            </defs>

            {/* Render edges (connections) */}
            {edges.map((edge, index) => (
              <g key={`edge-${edge.from}-${edge.to}`}>
                {/* Static path */}
                <path
                  d={getEdgePath(edge)}
                  stroke={edge.errorRate && edge.errorRate > 0.05 ? '#ef4444' : '#374151'}
                  strokeWidth="2"
                  fill="none"
                  opacity="0.3"
                />
                
                {/* Animated flow particles */}
                <motion.circle
                  r="3"
                  fill="url(#flowGradient)"
                  filter="url(#glow)"
                  initial={{ pathOffset: 0 }}
                  animate={{ pathOffset: 1 }}
                  transition={{
                    duration: 2 / getFlowSpeed(edge.throughput),
                    repeat: Infinity,
                    ease: "linear",
                  }}
                >
                  <animateMotion
                    dur={`${2 / getFlowSpeed(edge.throughput)}s`}
                    repeatCount="indefinite"
                  >
                    <mpath href={`#path-${index}`} />
                  </animateMotion>
                </motion.circle>
                
                {/* Hidden path for animation reference */}
                <path
                  id={`path-${index}`}
                  d={getEdgePath(edge)}
                  fill="none"
                  stroke="none"
                />
                
                {/* Throughput label */}
                {edge.throughput > 0 && (
                  <text
                    x={(nodes.find(n => n.id === edge.from)!.x + nodes.find(n => n.id === edge.to)!.x) / 2 + 30}
                    y={(nodes.find(n => n.id === edge.from)!.y + nodes.find(n => n.id === edge.to)!.y) / 2 + 15}
                    fontSize="10"
                    fill="#6b7280"
                    textAnchor="middle"
                  >
                    {edge.throughput > 1000 ? `${(edge.throughput / 1000).toFixed(1)}k` : edge.throughput}
                    {edge.errorRate && edge.errorRate > 0.01 && (
                      <tspan fill="#ef4444" x="0" dy="12">
                        {(edge.errorRate * 100).toFixed(1)}% err
                      </tspan>
                    )}
                  </text>
                )}
              </g>
            ))}

            {/* Render nodes */}
            {nodes.map((node) => (
              <g key={node.id}>
                {/* Node background with pulsing effect for healthy status */}
                <motion.rect
                  x={node.x}
                  y={node.y}
                  width="120"
                  height="60"
                  rx="8"
                  fill={getNodeColor(node.status)}
                  fillOpacity="0.1"
                  stroke={getNodeColor(node.status)}
                  strokeWidth="2"
                  filter={node.status === 'healthy' ? 'url(#glow)' : 'none'}
                  animate={node.status === 'healthy' ? {
                    scale: [1, 1.02, 1],
                  } : {}}
                  transition={node.status === 'healthy' ? {
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  } : {}}
                />
                
                {/* Node label */}
                <text
                  x={node.x + 60}
                  y={node.y + 25}
                  fontSize="12"
                  fontWeight="600"
                  fill="currentColor"
                  textAnchor="middle"
                >
                  {node.label.split('\n').map((line, i) => (
                    <tspan key={i} x={node.x + 60} dy={i === 0 ? 0 : 14}>
                      {line}
                    </tspan>
                  ))}
                </text>
                
                {/* Node metrics */}
                {node.metrics && node.metrics.map((metric, i) => (
                  <text
                    key={i}
                    x={node.x + 60}
                    y={node.y + 45 + (i * 10)}
                    fontSize="9"
                    fill="#6b7280"
                    textAnchor="middle"
                  >
                    {metric}
                  </text>
                ))}
                
                {/* Status badge */}
                <foreignObject x={node.x + 90} y={node.y + 5} width="25" height="15">
                  <Badge 
                    variant={getNodeVariant(node.status)} 
                    className="text-xs px-1 py-0 h-3"
                  >
                    {node.status === 'healthy' ? '✓' : node.status === 'degraded' ? '!' : '✗'}
                  </Badge>
                </foreignObject>
              </g>
            ))}
          </svg>
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>Healthy</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500"></div>
            <span>Degraded</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>Down</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-1 bg-blue-500 rounded"></div>
            <span>Data Flow</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
