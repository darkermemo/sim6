import * as Types from "@/lib/dashboard-types";

interface Props {
  alerts?: Types.AlertsResp;
  onAlertClick?: (alertId: string) => void;
}

/**
 * RecentAlerts - Shows recent alerts list
 * Displays alert title, severity, status, timestamp
 */
export default function RecentAlerts({ alerts, onAlertClick }: Props) {
  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical': return '#d32f2f';
      case 'high': return '#f57c00';
      case 'medium': return '#fbc02d';
      case 'low': return '#689f38';
      default: return '#757575';
    }
  };

  const getStatusIcon = (status: string): string => {
    return status === 'open' ? '🔴' : '✓';
  };

  return (
    <div data-testid="alerts-recent" style={{ padding: "20px" }}>
      <h3>Recent Alerts {alerts && `(${alerts.total})`}</h3>
      
      {!alerts ? (
        <div style={{ color: "#666" }}>Loading...</div>
      ) : alerts.alerts.length === 0 ? (
        <div style={{ color: "#666" }}>No alerts in this time range</div>
      ) : (
        <div style={{ maxHeight: "400px", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #ddd" }}>
                <th style={{ textAlign: "left", padding: "8px" }}>Time</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Title</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Severity</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Status</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Tenant</th>
              </tr>
            </thead>
            <tbody>
              {alerts.alerts.map(alert => (
                <tr 
                  key={alert.alert_id}
                  style={{ 
                    borderBottom: "1px solid #eee",
                    cursor: onAlertClick ? "pointer" : "default"
                  }}
                  onClick={() => onAlertClick?.(alert.alert_id)}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "#f5f5f5"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  <td style={{ padding: "8px", fontSize: "12px" }}>
                    {new Date(alert.alert_timestamp * 1000).toLocaleString()}
                  </td>
                  <td style={{ padding: "8px" }}>
                    {alert.alert_title}
                  </td>
                  <td style={{ padding: "8px" }}>
                    <span style={{ 
                      color: getSeverityColor(alert.severity),
                      fontWeight: "bold"
                    }}>
                      {alert.severity.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: "8px" }}>
                    <span>{getStatusIcon(alert.status)} {alert.status}</span>
                  </td>
                  <td style={{ padding: "8px", fontSize: "12px" }}>
                    {alert.tenant_id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
