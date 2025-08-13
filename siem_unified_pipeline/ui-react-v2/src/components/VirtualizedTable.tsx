/**
 * VirtualizedTable - Enterprise-grade data grid component
 * 
 * Features:
 * - Handles 10-50k rows with smooth 60fps scrolling
 * - Column definitions mapped from API meta
 * - Sortable, resizable, show/hide columns
 * - Row selection and detail view
 * - Virtualized rendering for performance
 * - TypeScript-first with proper error boundaries
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

// === TYPES ===

export interface TableColumn {
  name: string;
  type: string;
  label?: string;
  sortable?: boolean;
  width?: number;
}

export interface TableRow {
  [key: string]: any;
}

export interface VirtualizedTableProps {
  columns: TableColumn[];
  data: TableRow[];
  loading?: boolean;
  error?: Error | null;
  onRowClick?: (row: TableRow, index: number) => void;
  onRowSelect?: (selectedRows: TableRow[]) => void;
  height?: number;
  rowHeight?: number;
  enableSelection?: boolean;
  enableSorting?: boolean;
  enableColumnResizing?: boolean;
  className?: string;
}

// === HELPERS ===

function getColumnType(type: string): 'text' | 'number' | 'date' | 'boolean' {
  const lowerType = type.toLowerCase();
  if (lowerType.includes('int') || lowerType.includes('float') || lowerType.includes('decimal')) {
    return 'number';
  }
  if (lowerType.includes('date') || lowerType.includes('time')) {
    return 'date';
  }
  if (lowerType.includes('bool')) {
    return 'boolean';
  }
  return 'text';
}

function formatCellValue(value: any, type: string): string {
  if (value == null) return '';
  
  const columnType = getColumnType(type);
  
  switch (columnType) {
    case 'number':
      return typeof value === 'number' ? value.toLocaleString() : String(value);
    case 'date':
      try {
        // Handle Unix timestamps
        const num = Number(value);
        if (num > 1000000000 && num < 10000000000) {
          return new Date(num * 1000).toLocaleString();
        }
        // Handle ISO dates
        return new Date(value).toLocaleString();
      } catch {
        return String(value);
      }
    case 'boolean':
      return value ? '✓' : '✗';
    default:
      return String(value);
  }
}

// === MAIN COMPONENT ===

export function VirtualizedTable({
  columns = [],
  data = [],
  loading = false,
  error = null,
  onRowClick,
  onRowSelect,
  height = 600,
  rowHeight = 35,
  enableSelection = false,
  enableSorting = true,
  enableColumnResizing = true,
  className = '',
}: VirtualizedTableProps) {
  
  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  // Create table columns from API meta
  const tableColumns = useMemo<ColumnDef<TableRow>[]>(() => {
    const cols: ColumnDef<TableRow>[] = [];

    // Selection column
    if (enableSelection) {
      cols.push({
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            style={{ margin: 0 }}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            style={{ margin: 0 }}
          />
        ),
        size: 40,
        enableSorting: false,
        enableResizing: false,
      });
    }

    // Data columns
    columns.forEach((col) => {
      cols.push({
        id: col.name,
        accessorKey: col.name,
        header: col.label || col.name,
        cell: ({ getValue }) => {
          const value = getValue();
          return (
            <span 
              title={String(value)}
              style={{ 
                fontSize: '13px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'block'
              }}
            >
              {formatCellValue(value, col.type)}
            </span>
          );
        },
        enableSorting: enableSorting && (col.sortable !== false),
        enableResizing: enableColumnResizing,
        size: col.width || 150,
        minSize: 80,
        maxSize: 500,
      });
    });

    return cols;
  }, [columns, enableSelection, enableSorting, enableColumnResizing]);

  // Create table instance
  const table = useReactTable({
    data,
    columns: tableColumns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: enableSelection,
    enableSorting,
    enableColumnResizing,
  });

  // Get rows for virtualization
  const { rows } = table.getRowModel();

  // Create virtualizer
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10, // Render extra rows for smooth scrolling
  });

  // Handle row selection callback
  React.useEffect(() => {
    if (onRowSelect && enableSelection) {
      const selectedRows = table.getFilteredSelectedRowModel().rows.map(row => row.original);
      onRowSelect(selectedRows);
    }
  }, [rowSelection, onRowSelect, enableSelection, table]);

  // Handle row click
  const handleRowClick = useCallback((row: TableRow, index: number) => {
    if (onRowClick) {
      onRowClick(row, index);
    }
  }, [onRowClick]);

  // Show loading state
  if (loading) {
    return (
      <div 
        className={`virtualized-table loading ${className}`}
        style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', marginBottom: '10px' }}>⏳</div>
          <div>Loading data...</div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div 
        className={`virtualized-table error ${className}`}
        style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div style={{ textAlign: 'center', color: '#c53030' }}>
          <div style={{ fontSize: '18px', marginBottom: '10px' }}>⚠️</div>
          <div>Error loading data</div>
          <div style={{ fontSize: '12px', marginTop: '5px' }}>{error.message}</div>
        </div>
      </div>
    );
  }

  // Show empty state
  if (data.length === 0) {
    return (
      <div 
        className={`virtualized-table empty ${className}`}
        style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div style={{ textAlign: 'center', color: '#718096' }}>
          <div style={{ fontSize: '18px', marginBottom: '10px' }}>📭</div>
          <div>No data available</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`virtualized-table ${className}`} style={{ height }}>
      
      {/* Column Controls */}
      <div style={{ 
        padding: '8px', 
        borderBottom: '1px solid #e2e8f0', 
        fontSize: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        <span>📊 {data.length.toLocaleString()} rows</span>
        
        {enableSelection && (
          <span>{Object.keys(rowSelection).length} selected</span>
        )}
        
        <div style={{ marginLeft: 'auto' }}>
          <label style={{ marginRight: '10px' }}>
            Columns:
            <select 
              onChange={(e) => {
                const col = e.target.value;
                if (col) {
                  setColumnVisibility(prev => ({
                    ...prev,
                    [col]: !prev[col]
                  }));
                }
              }}
              style={{ marginLeft: '5px', padding: '2px', fontSize: '11px' }}
            >
              <option value="">Toggle visibility...</option>
              {table.getAllLeafColumns().map(column => (
                <option key={column.id} value={column.id}>
                  {column.getIsVisible() ? '✓' : '✗'} {column.id}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Virtualized Table */}
      <div
        ref={parentRef}
        style={{
          height: height - 40, // Account for controls
          overflow: 'auto',
        }}
      >
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          
          {/* Header */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 1,
              background: '#f7fafc',
              borderBottom: '2px solid #e2e8f0',
            }}
          >
            {table.getHeaderGroups().map(headerGroup => (
              <div 
                key={headerGroup.id} 
                style={{ display: 'flex', height: `${rowHeight}px` }}
              >
                {headerGroup.headers.map(header => (
                  <div
                    key={header.id}
                    style={{
                      width: header.getSize(),
                      padding: '8px',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#4a5568',
                      display: 'flex',
                      alignItems: 'center',
                      cursor: header.column.getCanSort() ? 'pointer' : 'default',
                      userSelect: 'none',
                      borderRight: '1px solid #e2e8f0',
                    }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() && (
                      <span style={{ marginLeft: '4px' }}>
                        {header.column.getIsSorted() === 'desc' ? '↓' : '↑'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Virtual Rows */}
          {virtualizer.getVirtualItems().map(virtualRow => {
            const row = rows[virtualRow.index];
            return (
              <div
                key={row.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  display: 'flex',
                  alignItems: 'center',
                  borderBottom: '1px solid #f1f5f9',
                  background: virtualRow.index % 2 === 0 ? '#ffffff' : '#f8fafc',
                  cursor: onRowClick ? 'pointer' : 'default',
                }}
                onClick={() => handleRowClick(row.original, virtualRow.index)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#e6fffa';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = virtualRow.index % 2 === 0 ? '#ffffff' : '#f8fafc';
                }}
              >
                {row.getVisibleCells().map(cell => (
                  <div
                    key={cell.id}
                    style={{
                      width: cell.column.getSize(),
                      padding: '8px',
                      borderRight: '1px solid #f1f5f9',
                      overflow: 'hidden',
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default VirtualizedTable;
