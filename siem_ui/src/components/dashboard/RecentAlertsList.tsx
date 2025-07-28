import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { AlertsTableSkeleton } from '@/components/ui/Skeleton';
import { AssetTooltip } from '@/components/AssetTooltip';
import { useAlertApi } from '@/hooks/useApi';
import { useUiStore } from '@/stores/uiStore';
import { stopPropagation } from '@/lib/dom';
import type { RecentAlert } from '@/types/api';

interface RecentAlertsListProps {
  alerts?: RecentAlert[];
  isLoading?: boolean;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

export function RecentAlertsList({
  alerts = [],
  isLoading = false,
  currentPage = 1,
  totalPages = 1,
  onPageChange = () => {},
}: RecentAlertsListProps) {
  const { isLoading: isUpdating } = useAlertApi();
  const { openAlertDrawer } = useUiStore();

  if (isLoading) {
    return <AlertsTableSkeleton />;
  }

  const getSeverityVariant = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'high';
      case 'medium':
        return 'medium';
      case 'low':
        return 'low';
      case 'informational':
        return 'info';
      default:
        return 'default';
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'new':
        return 'warning';
      case 'in progress':
        return 'info';
      case 'investigating':
        return 'warning';
      case 'resolved':
        return 'success';
      default:
        return 'default';
    }
  };

  const handlePivotClick = (type: string, value: string) => {
    console.log(`Pivoting to investigation for ${type}: ${value}`);
  };

  const handleRowClick = (alertId: string) => {
    openAlertDrawer(alertId);
  };



  const formatTimestamp = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  return (
    <Card title="Recent Alerts" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 text-sm font-medium text-secondary-text">
                Severity
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-secondary-text">
                Timestamp
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-secondary-text">
                Alert Name
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-secondary-text">
                Source IP
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-secondary-text">
                Destination IP
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-secondary-text">
                User
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-secondary-text">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {alerts.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 px-4 text-center text-secondary-text">
                  No alerts found
                </td>
              </tr>
            ) : (
              alerts.map((alert) => (
              <tr 
                key={alert.id} 
                className="border-b border-border hover:bg-card/50 transition-colors cursor-pointer"
                onClick={() => handleRowClick(alert.id)}
              >
                {/* Severity Column */}
                <td className="py-3 px-4">
                  <Badge variant={getSeverityVariant(alert.severity)}>
                    {alert.severity}
                  </Badge>
                </td>

                                 {/* Timestamp Column */}
                 <td className="py-3 px-4 text-sm text-primary-text font-mono">
                   {formatTimestamp(alert.timestamp)}
                 </td>

                 {/* Alert Name Column - Clickable */}
                 <td className="py-3 px-4">
                   <button
                     onClick={(e) => {
                       e.stopPropagation();
                       handlePivotClick('Alert', alert.name);
                     }}
                     className="text-accent hover:text-blue-400 hover:underline text-left text-sm font-medium transition-colors"
                   >
                     {alert.name}
                   </button>
                 </td>

                                 {/* Source IP Column - Clickable with Asset Info */}
                 <td className="py-3 px-4">
                   <div className="flex items-center space-x-2">
                     <button
                       onClick={stopPropagation(() => handlePivotClick('Source IP', alert.source_ip))}
                       className="text-accent hover:text-blue-400 hover:underline text-sm font-mono transition-colors"
                     >
                       {alert.source_ip}
                     </button>
                     <AssetTooltip ip={alert.source_ip} />
                   </div>
                 </td>

                 {/* Destination IP Column - Clickable */}
                 <td className="py-3 px-4">
                   <div className="flex items-center space-x-2">
                     <button
                       onClick={stopPropagation(() => handlePivotClick('Destination IP', alert.dest_ip))}
                       className="text-accent hover:text-blue-400 hover:underline text-sm font-mono transition-colors"
                     >
                       {alert.dest_ip}
                     </button>
                     <AssetTooltip ip={alert.dest_ip} />
                   </div>
                 </td>

                {/* User Column - Clickable */}
                <td className="py-3 px-4">
                  {alert.user !== 'N/A' ? (
                    <button
                      onClick={stopPropagation(() => handlePivotClick('User', alert.user))}
                      className="text-accent hover:text-blue-400 hover:underline text-sm transition-colors"
                    >
                      {alert.user}
                    </button>
                  ) : (
                    <span className="text-secondary-text text-sm">N/A</span>
                  )}
                </td>

                                 {/* Status Column */}
                 <td className="py-3 px-4">
                   <Badge variant={getStatusVariant(alert.status)}>
                     {alert.status}
                   </Badge>
                 </td>
               </tr>
               ))
             )}
           </tbody>
         </table>
       </div>

       {/* Pagination Controls */}
       {totalPages > 1 && (
         <div className="flex items-center justify-between px-6 py-4 border-t border-border">
           <div className="text-sm text-secondary-text">
             Page {currentPage} of {totalPages}
           </div>
           <div className="flex items-center space-x-2">
             <Button
               variant="outline"
               size="sm"
               onClick={() => onPageChange(currentPage - 1)}
               disabled={currentPage <= 1 || isUpdating}
             >
               <ChevronLeft className="h-4 w-4" />
               Previous
             </Button>
             <Button
               variant="outline"
               size="sm"
               onClick={() => onPageChange(currentPage + 1)}
               disabled={currentPage >= totalPages || isUpdating}
             >
               Next
               <ChevronRight className="h-4 w-4" />
             </Button>
           </div>
         </div>
       )}
     </Card>
  );
}