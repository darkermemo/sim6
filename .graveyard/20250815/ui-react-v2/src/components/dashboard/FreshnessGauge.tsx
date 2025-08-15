import * as Types from "@/lib/dashboard-types";

interface Props {
  freshness?: Types.FreshnessResp;
}

/**
 * FreshnessGauge - Shows index freshness metrics
 * Displays max and average lag with visual indicators
 */
export default function FreshnessGauge({ freshness }: Props) {
  if (!freshness || freshness.series.length === 0) {
    return (
      <div style={{ padding: "20px" }}>
        <h3>Index Freshness</h3>
        <div style={{ color: "#666" }}>No data available</div>
      </div>
    );
  }

  // Get latest values
  const latest = freshness.series[freshness.series.length - 1];
  const maxLag = latest.max_lag_seconds;
  const avgLag = latest.avg_lag_seconds;

  // Calculate trend (compare with previous point)
  let trend = 'stable';
  if (freshness.series.length > 1) {
    const previous = freshness.series[freshness.series.length - 2];
    if (latest.max_lag_seconds > previous.max_lag_seconds) trend = 'increasing';
    else if (latest.max_lag_seconds < previous.max_lag_seconds) trend = 'decreasing';
  }

  const getLagColor = (seconds: number): string => {
    if (seconds < 60) return '#4caf50'; // Green - under 1 minute
    if (seconds < 300) return '#ff9800'; // Orange - under 5 minutes
    return '#f44336'; // Red - over 5 minutes
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds.toFixed(0)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  return (
    <div style={{ padding: "20px" }}>
      <h3>Index Freshness</h3>
      
      <div style={{ display: "flex", gap: "20px", marginTop: "10px" }}>
        {/* Max Lag */}
        <div style={{ 
          flex: 1, 
          padding: "15px", 
          border: "1px solid #ddd",
          borderRadius: "4px",
          backgroundColor: getLagColor(maxLag) + '10'
        }}>
          <div style={{ fontSize: "12px", color: "#666" }}>Max Lag</div>
          <div style={{ 
            fontSize: "28px", 
            fontWeight: "bold",
            color: getLagColor(maxLag)
          }}>
            {formatDuration(maxLag)}
          </div>
          <div style={{ fontSize: "12px", color: "#666" }}>
            {trend === 'increasing' && '↑ Increasing'}
            {trend === 'decreasing' && '↓ Decreasing'}
            {trend === 'stable' && '→ Stable'}
          </div>
        </div>

        {/* Average Lag */}
        <div style={{ 
          flex: 1, 
          padding: "15px", 
          border: "1px solid #ddd",
          borderRadius: "4px",
          backgroundColor: getLagColor(avgLag) + '10'
        }}>
          <div style={{ fontSize: "12px", color: "#666" }}>Average Lag</div>
          <div style={{ 
            fontSize: "28px", 
            fontWeight: "bold",
            color: getLagColor(avgLag)
          }}>
            {formatDuration(avgLag)}
          </div>
          <div style={{ fontSize: "12px", color: "#666" }}>
            across all indices
          </div>
        </div>
      </div>

      {/* Mini sparkline */}
      <div style={{ marginTop: "20px" }}>
        <svg width="300" height="50">
          <polyline
            points={freshness.series.slice(-20).map((point, i) => 
              `${i * 15},${50 - (point.max_lag_seconds / Math.max(...freshness.series.map(p => p.max_lag_seconds))) * 40}`
            ).join(' ')}
            fill="none"
            stroke={getLagColor(maxLag)}
            strokeWidth="2"
          />
        </svg>
      </div>
    </div>
  );
}
