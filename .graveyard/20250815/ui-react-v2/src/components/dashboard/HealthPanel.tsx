import * as Types from "@/lib/dashboard-types";

interface Props {
  health?: Types.Health;
}

/**
 * HealthPanel - Shows component health status
 * Displays ClickHouse, Redis, API status and versions
 */
export default function HealthPanel({ health }: Props) {
  const getStatusColor = (status?: string): string => {
    switch (status) {
      case 'ok': return '#4caf50';
      case 'degraded': return '#ff9800';
      case 'down': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  const getStatusIcon = (status?: string): string => {
    switch (status) {
      case 'ok': return '✓';
      case 'degraded': return '!';
      case 'down': return '✗';
      default: return '?';
    }
  };

  if (!health) {
    return (
      <div style={{ padding: "20px" }}>
        <h3>System Health</h3>
        <div style={{ color: "#666" }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px" }}>
      <h3>System Health</h3>
      
      {/* Overall status */}
      <div style={{ 
        marginBottom: "20px", 
        padding: "10px",
        backgroundColor: getStatusColor(health.status) + '20',
        borderRadius: "4px"
      }}>
        <strong>Overall Status:</strong> {health.status.toUpperCase()}
      </div>

      {/* Component statuses */}
      <div style={{ display: "flex", gap: "10px" }}>
        {/* ClickHouse - derive from overall status */}
        <div style={{ 
          flex: 1, 
          padding: "10px", 
          border: "1px solid #ddd",
          borderRadius: "4px"
        }}>
          <div style={{ fontWeight: "bold", marginBottom: "5px" }}>ClickHouse</div>
          <div 
            data-testid="health-ch"
            data-status={health.components?.clickhouse?.status || health.status}
            style={{ 
              color: getStatusColor(health.components?.clickhouse?.status || health.status),
              fontSize: "24px"
            }}
          >
            {getStatusIcon(health.components?.clickhouse?.status || health.status)}
          </div>
          <div style={{ fontSize: "12px", color: "#666" }}>
            {health.components?.clickhouse?.version || 'Available'}
          </div>
        </div>

        {/* Redis */}
        <div style={{ 
          flex: 1, 
          padding: "10px", 
          border: "1px solid #ddd",
          borderRadius: "4px"
        }}>
          <div style={{ fontWeight: "bold", marginBottom: "5px" }}>Redis</div>
          <div style={{ 
            color: getStatusColor(health.components?.redis?.status || health.redis || 'ok'),
            fontSize: "24px"
          }}>
            {getStatusIcon(health.components?.redis?.status || health.redis || 'ok')}
          </div>
          <div style={{ fontSize: "12px", color: "#666" }}>
            {health.components?.redis?.version || 'Available'}
          </div>
        </div>

        {/* API */}
        <div style={{ 
          flex: 1, 
          padding: "10px", 
          border: "1px solid #ddd",
          borderRadius: "4px"
        }}>
          <div style={{ fontWeight: "bold", marginBottom: "5px" }}>API</div>
          <div style={{ 
            color: getStatusColor(health.components?.api?.status || health.status),
            fontSize: "24px"
          }}>
            {getStatusIcon(health.components?.api?.status || health.status)}
          </div>
          <div style={{ fontSize: "12px", color: "#666" }}>
            {health.components?.api?.version || 'v2.0'}
          </div>
        </div>
      </div>
    </div>
  );
}
