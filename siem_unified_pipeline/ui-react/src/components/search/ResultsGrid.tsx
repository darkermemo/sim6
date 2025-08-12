import React from 'react';
import { FixedSizeList as List } from 'react-window';
import type { SearchRow } from '@/lib/search';
import { CopyButton } from '@/components/common/CopyButton';
import { Button } from '@/components/ui/button';
import { ChevronRight, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResultsGridProps {
  rows: SearchRow[];
  isLoading?: boolean;
  selectedColumns?: string[];
  onColumnChange?: (columns: string[]) => void;
  onRowClick?: (row: SearchRow) => void;
  onPivot?: (row: SearchRow) => void;
}

const DEFAULT_COLUMNS = [
  'event_timestamp',
  'source',
  'message',
  'user',
  'src_ip',
  'dst_ip',
  'host',
];

export function ResultsGrid({
  rows,
  isLoading,
  selectedColumns = DEFAULT_COLUMNS,
  onColumnChange,
  onRowClick,
  onPivot,
}: ResultsGridProps) {
  const [showColumnChooser, setShowColumnChooser] = React.useState(false);
  
  // Get all unique columns from rows
  const allColumns = React.useMemo(() => {
    const columnSet = new Set<string>();
    rows.forEach(row => {
      Object.keys(row).forEach(key => columnSet.add(key));
    });
    return Array.from(columnSet).sort();
  }, [rows]);

  // Format cell value for display
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  // Format timestamp for display
  const formatTimestamp = (value: unknown): string => {
    if (!value) return '';
    try {
      const date = new Date(String(value));
      return date.toLocaleString();
    } catch {
      return formatValue(value);
    }
  };

  // Row renderer for virtualization
  const Row = React.memo(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const row = rows[index];
    
    return (
      <div 
        style={style} 
        className={cn(
          "flex items-center border-b border-gray-200 dark:border-gray-700",
          "hover:bg-gray-50 dark:hover:bg-gray-800",
          "cursor-pointer group"
        )}
        onClick={() => onRowClick?.(row)}
      >
        {selectedColumns.map((col, colIndex) => (
          <div
            key={col}
            className={cn(
              "px-4 py-2 text-sm truncate",
              colIndex === 0 && "font-mono text-xs",
              col === 'message' && "flex-1"
            )}
            style={{ 
              width: col === 'message' ? undefined : col === 'event_timestamp' ? 180 : 150,
              flex: col === 'message' ? 1 : undefined
            }}
            title={formatValue(row[col])}
          >
            {col === 'event_timestamp' ? formatTimestamp(row[col]) : formatValue(row[col])}
          </div>
        ))}
        
        {/* Row actions */}
        <div className="flex items-center gap-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div onClick={(e) => e.stopPropagation()}>
            <CopyButton 
              text={JSON.stringify(row, null, 2)} 
              size="sm"
            />
          </div>
          {onPivot && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onPivot(row);
              }}
              aria-label="Pivot to search"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    );
  });
  Row.displayName = 'Row';

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-4 space-y-3">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          Results ({rows.length} rows)
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowColumnChooser(!showColumnChooser)}
          className="gap-2"
        >
          <Settings className="w-4 h-4" />
          Columns
        </Button>
      </div>

      {/* Column chooser */}
      {showColumnChooser && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-2">
          <div className="flex flex-wrap gap-2">
            {allColumns.map(col => (
              <label key={col} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedColumns.includes(col)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onColumnChange?.([...selectedColumns, col]);
                    } else {
                      onColumnChange?.(selectedColumns.filter(c => c !== col));
                    }
                  }}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                <span className="text-gray-700 dark:text-gray-300">{col}</span>
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onColumnChange?.(DEFAULT_COLUMNS)}
          >
            Reset to defaults
          </Button>
        </div>
      )}

      {/* Column headers */}
      <div className="flex items-center border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        {selectedColumns.map((col, index) => (
          <div
            key={col}
            className={cn(
              "px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider",
              index === 0 && "font-mono",
              col === 'message' && "flex-1"
            )}
            style={{ 
              width: col === 'message' ? undefined : col === 'event_timestamp' ? 180 : 150,
              flex: col === 'message' ? 1 : undefined
            }}
          >
            {col}
          </div>
        ))}
        <div className="w-24" /> {/* Space for actions */}
      </div>

      {/* Virtualized rows */}
      <List
        height={600}
        itemCount={rows.length}
        itemSize={40}
        width="100%"
      >
        {Row}
      </List>
    </div>
  );
}
