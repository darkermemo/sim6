interface Props {
  title: string;
  series: Array<Record<string, any>>;
  fields: string[];
  colors?: string[];
  height?: number;
  testId?: string;
}

/**
 * TimeSeries - Generic line chart component
 * Used for ingest rate, query latency, error rate charts
 */
export default function TimeSeries({ 
  title, 
  series, 
  fields, 
  colors = ["#4285f4", "#ea4335", "#fbbc04", "#34a853"],
  height = 200,
  testId
}: Props) {
  if (!series || series.length === 0) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <h3>{title}</h3>
        <div style={{ color: "#666" }}>No data available</div>
      </div>
    );
  }

  // Calculate min/max for scaling
  const allValues = series.flatMap(point => 
    fields.map(field => point[field] || 0)
  );
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const range = maxValue - minValue || 1;

  // Calculate time range
  const times = series.map(p => p.t);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const timeRange = maxTime - minTime || 1;

  const width = 800;
  const margin = { top: 20, right: 100, bottom: 40, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Scale functions
  const xScale = (t: number) => ((t - minTime) / timeRange) * innerWidth;
  const yScale = (v: number) => innerHeight - ((v - minValue) / range) * innerHeight;

  return (
    <div data-testid={testId} style={{ padding: "20px" }}>
      <h3>{title}</h3>
      <svg width={width} height={height}>
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(tick => {
            const y = innerHeight * (1 - tick);
            const value = minValue + range * tick;
            return (
              <g key={tick}>
                <line
                  x1={0}
                  y1={y}
                  x2={innerWidth}
                  y2={y}
                  stroke="#e0e0e0"
                  strokeDasharray="2,2"
                />
                <text
                  x={-5}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="#666"
                >
                  {value.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* Lines for each field */}
          {fields.map((field, fieldIndex) => {
            const pathData = series
              .map((point, i) => {
                const x = xScale(point.t);
                const y = yScale(point[field] || 0);
                return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
              })
              .join(' ');

            return (
              <g key={field}>
                <path
                  d={pathData}
                  stroke={colors[fieldIndex % colors.length]}
                  strokeWidth="2"
                  fill="none"
                />
                {/* Legend */}
                <text
                  x={innerWidth + 10}
                  y={20 + fieldIndex * 20}
                  fontSize="12"
                  fill={colors[fieldIndex % colors.length]}
                >
                  {field}
                </text>
              </g>
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
          <text x={0} y={innerHeight + 20} fontSize="10" fill="#666">
            {new Date(minTime * 1000).toLocaleTimeString()}
          </text>
          <text x={innerWidth} y={innerHeight + 20} fontSize="10" fill="#666" textAnchor="end">
            {new Date(maxTime * 1000).toLocaleTimeString()}
          </text>
        </g>
      </svg>
    </div>
  );
}
