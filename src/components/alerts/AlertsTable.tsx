import React from 'react';
import { FixedSizeList as List } from 'react-window';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime, getSeverityColor, getStatusColor } from '@/lib/alerts';
import type { Alert, AlertStatus } from '@/lib/alerts';

interface AlertsTableProps {
  alerts: Alert[];
  loading: boolean;
  selectedIds: Set<string>;
  visibleColumns: string[];
  sortColumn: 'created_at' | 'severity';
  sortDirection: 'asc' | 'desc';
  onRowClick: (alert: Alert) => void;
  onSelectionChange: (ids: Set<string>) => void;
  onColumnsChange: (columns: string[]) => void;
  onSortChange: (column: 'created_at' | 'severity', direction: 'asc' | 'desc') => void;
  onStatusChange?: (alertId: string, newStatus: AlertStatus) => void;
}

const ALL_COLUMNS = [
  { id: 'created_at', label: 'Time', width: 120 },
  { id: 'severity', label: 'Severity', width: 100 },
  { id: 'status', label: 'Status', width: 100 },
  { id: 'title', label: 'Title', width: 300 },
  { id: 'rule_id', label: 'Rule', width: 150 },
  { id: 'source', label: 'Source', width: 120 },
  { id: 'user', label: 'User', width: 120 },
  { id: 'src_ip', label: 'Source IP', width: 120 },
  { id: 'host', label: 'Host', width: 120 },
];

export function AlertsTable({
  alerts,
  loading,
  selectedIds,
  visibleColumns,
  sortColumn,
  sortDirection,
  onRowClick,
  onSelectionChange,
  onColumnsChange,
  onSortChange,
  onStatusChange,
}: AlertsTableProps) {
  const [showColumnChooser, setShowColumnChooser] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = React.useState(600);

  // Calculate container height
  React.useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const height = window.innerHeight - rect.top - 100; // Leave some space at bottom
        setContainerHeight(Math.max(400, height));
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  const toggleSelection = (alertId: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(alertId)) {
      newSelection.delete(alertId);
    } else {
      newSelection.add(alertId);
    }
    onSelectionChange(newSelection);
  };

  const toggleAllSelection = () => {
    if (selectedIds.size === alerts.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(alerts.map(a => a.alert_id)));
    }
  };

  const visibleColumnDefs = ALL_COLUMNS.filter(col => visibleColumns.includes(col.id));
  const totalWidth = visibleColumnDefs.reduce((sum, col) => sum + col.width, 50); // 50 for checkbox

  const handleSort = (column: 'created_at' | 'severity') => {
    if (sortColumn === column) {
      onSortChange(column, sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(column, 'desc');
    }
  };

  const renderHeader = () => (
    <div
      className="flex items-center bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10"
      style={{ minWidth: totalWidth }}
    >
      <div className="w-[50px] px-3 py-2">
        <Checkbox
          checked={alerts.length > 0 && selectedIds.size === alerts.length}
          onCheckedChange={toggleAllSelection}
          aria-label="Select all alerts"
        />
      </div>
      {visibleColumnDefs.map((col) => (
        <div
          key={col.id}
          className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
          style={{ width: col.width }}
        >
          {(col.id === 'created_at' || col.id === 'severity') ? (
            <button
              className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
              onClick={() => handleSort(col.id as 'created_at' | 'severity')}
            >
              {col.label}
              {sortColumn === col.id && (
                sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
              )}
            </button>
          ) : (
            col.label
          )}
        </div>
      ))}
    </div>
  );

  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const alert = alerts[index];
    const isSelected = selectedIds.has(alert.alert_id);

    return (
      <div
        style={{ ...style, minWidth: totalWidth }}
        className={cn(
          "flex items-center border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer",
          isSelected && "bg-blue-50 dark:bg-blue-900/20"
        )}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-stop-propagation]')) {
            e.stopPropagation();
            return;
          }
          onRowClick(alert);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onRowClick(alert);
          }
        }}
        role="row"
        tabIndex={0}
        aria-selected={isSelected}
      >
        <div className="w-[50px] px-3 py-2" data-stop-propagation>
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => toggleSelection(alert.alert_id)}
            aria-label={`Select alert ${alert.title}`}
          />
        </div>
        {visibleColumnDefs.map((col) => (
          <div
            key={col.id}
            className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 truncate"
            style={{ width: col.width }}
            title={String(alert[col.id as keyof Alert] || '')}
          >
            {col.id === 'created_at' && (
              <span title={new Date(alert.created_at).toLocaleString()}>
                {formatRelativeTime(alert.created_at)}
              </span>
            )}
            {col.id === 'severity' && (
              <Badge variant={getSeverityColor(alert.severity) as any} className="text-xs">
                {alert.severity}
              </Badge>
            )}
            {col.id === 'status' && (
              <Badge variant={getStatusColor(alert.status) as any} className="text-xs">
                {alert.status}
              </Badge>
            )}
            {col.id !== 'created_at' && col.id !== 'severity' && col.id !== 'status' && (
              alert[col.id as keyof Alert] || '-'
            )}
          </div>
        ))}
      </div>
    );
  };

  if (loading && alerts.length === 0) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(10)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Column Chooser */}
      <div className="flex justify-end p-2 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowColumnChooser(!showColumnChooser)}
          >
            <Settings2 className="w-4 h-4 mr-1" />
            Columns
          </Button>
          {showColumnChooser && (
            <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg p-2 z-20">
              {ALL_COLUMNS.map((col) => (
                <label
                  key={col.id}
                  className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                >
                  <Checkbox
                    checked={visibleColumns.includes(col.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        onColumnsChange([...visibleColumns, col.id]);
                      } else {
                        onColumnsChange(visibleColumns.filter(id => id !== col.id));
                      }
                    }}
                  />
                  <span className="text-sm">{col.label}</span>
                </label>
              ))}
              <div className="border-t border-gray-200 dark:border-gray-700 mt-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    onColumnsChange(ALL_COLUMNS.map(c => c.id));
                    setShowColumnChooser(false);
                  }}
                >
                  Reset to defaults
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div ref={containerRef} className="flex-1 overflow-hidden">
        <div className="h-full">
          {renderHeader()}
          <List
            height={containerHeight - 40} // Subtract header height
            itemCount={alerts.length}
            itemSize={48}
            width="100%"
            className="scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600"
          >
            {Row}
          </List>
        </div>
      </div>
    </div>
  );
}
