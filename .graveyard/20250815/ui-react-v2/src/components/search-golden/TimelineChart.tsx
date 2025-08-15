import { useRef } from "react";
import * as Types from "@/lib/search-types";

interface Props {
  buckets: Types.TimelineBucket[];
  onBrush: (from: number, to: number) => void;
}

/**
 * TimelineChart - Shows event distribution over time
 * Supports brushing to update time range
 */
export default function TimelineChart({ buckets, onBrush }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const brushStart = useRef<number | null>(null);

  if (!buckets || buckets.length === 0) return null;

  const width = 800;
  const height = 100;
  const margin = { top: 10, right: 10, bottom: 20, left: 40 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Calculate scales
  const minTime = Math.min(...buckets.map(b => b.t));
  const maxTime = Math.max(...buckets.map(b => b.t));
  const maxCount = Math.max(...buckets.map(b => b.count));

  const xScale = (t: number) => ((t - minTime) / (maxTime - minTime)) * innerWidth;
  const yScale = (count: number) => innerHeight - (count / maxCount) * innerHeight;

  // Handle brush
  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left - margin.left;
    const t = minTime + (x / innerWidth) * (maxTime - minTime);
    brushStart.current = t;
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (brushStart.current === null) return;
    
    const rect = svgRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left - margin.left;
    const t = minTime + (x / innerWidth) * (maxTime - minTime);
    
    const from = Math.min(brushStart.current, t);
    const to = Math.max(brushStart.current, t);
    
    if (to - from > 60) { // Min 1 minute brush
      onBrush(Math.floor(from), Math.floor(to));
    }
    
    brushStart.current = null;
  };

  return (
    <div data-testid="timeline" style={{ padding: "10px", borderBottom: "1px solid #ccc" }}>
      <h4 style={{ margin: "0 0 10px 0" }}>Timeline</h4>
      <svg 
        ref={svgRef}
        width={width} 
        height={height}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        style={{ cursor: "crosshair" }}
      >
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Bars */}
          {buckets.map((bucket, i) => {
            const barWidth = i < buckets.length - 1 
              ? xScale(buckets[i + 1].t) - xScale(bucket.t)
              : innerWidth / buckets.length;
            
            return (
              <rect
                key={bucket.t}
                x={xScale(bucket.t)}
                y={yScale(bucket.count)}
                width={Math.max(1, barWidth - 1)}
                height={innerHeight - yScale(bucket.count)}
                fill="#4285f4"
                opacity={0.8}
              />
            );
          })}
          
          {/* X axis */}
          <line 
            x1={0} 
            y1={innerHeight} 
            x2={innerWidth} 
            y2={innerHeight} 
            stroke="#666"
          />
          
          {/* Time labels */}
          <text x={0} y={innerHeight + 15} fontSize="10" fill="#666">
            {new Date(minTime * 1000).toLocaleTimeString()}
          </text>
          <text x={innerWidth} y={innerHeight + 15} fontSize="10" fill="#666" textAnchor="end">
            {new Date(maxTime * 1000).toLocaleTimeString()}
          </text>
        </g>
      </svg>
    </div>
  );
}
