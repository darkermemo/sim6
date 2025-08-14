import React, { useState, useRef, useCallback, useMemo } from 'react';

interface Column {
  name: string;
  type: string;
}

interface Props {
  data: any[];
  columns: Column[];
  onSort?: (field: string) => void;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
  height?: number;
}

/**
 * ExcelTable - Excel-like data table with compact cells and resizable columns
 * Features: compact spacing, resizable columns, proper scrolling, Excel-like appearance
 */
export default function ExcelTable({
  data,
  columns,
  onSort,
  sortField,
  sortDirection,
  height = 400
}: Props) {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);

  // Get column width with default
  const getColumnWidth = (columnName: string) => {
    return columnWidths[columnName] || 120;
  };

  // Handle mouse down on resize handle
  const handleResizeStart = useCallback((e: React.MouseEvent, columnName: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsResizing(columnName);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = getColumnWidth(columnName);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing) return;
      
      const diff = moveEvent.clientX - resizeStartX.current;
      const newWidth = Math.max(60, resizeStartWidth.current + diff);
      
      setColumnWidths(prev => ({
        ...prev,
        [columnName]: newWidth
      }));
    };

    const handleMouseUp = () => {
      setIsResizing(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [isResizing]);

  // Handle column sort
  const handleSort = (columnName: string) => {
    if (onSort) {
      onSort(columnName);
    }
  };



  // Format cell value
  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <div 
      ref={tableRef}
      style={{ 
        height,
        border: '1px solid var(--border-default)',
        borderRadius: '4px',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-surface)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Fixed Header */}
      <div
        style={{
          backgroundColor: 'var(--bg-muted)',
          borderBottom: '1px solid var(--border-default)',
          display: 'flex',
          flexShrink: 0,
          position: 'relative',
          zIndex: 2
        }}
      >


        {/* Data Columns */}
        {columns.map((column, index) => {
          const width = getColumnWidth(column.name);
          const isSorted = sortField === column.name;
          
          return (
            <div
              key={column.name}
              style={{
                width: `${width}px`,
                minWidth: `${width}px`,
                maxWidth: `${width}px`,
                padding: '4px 6px',
                borderRight: index < columns.length - 1 ? '1px solid var(--border-muted)' : 'none',
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--fg-default)',
                backgroundColor: isSorted ? 'var(--bg-accent)' : 'var(--bg-muted)',
                cursor: 'pointer',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'center',
                userSelect: 'none'
              }}
              onClick={() => handleSort(column.name)}
            >
              {/* Column Name */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '4px',
                width: '100%'
              }}>
                <span style={{ 
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1
                }}>
                  {column.name}
                </span>
                {isSorted && (
                  <span style={{ color: 'var(--color-primary)', fontSize: '8px' }}>
                    {sortDirection === 'asc' ? 'ASC' : 'DESC'}
                  </span>
                )}
              </div>
              
              {/* Column Type */}
              <div style={{ 
                fontSize: '8px', 
                color: 'var(--fg-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                width: '100%'
              }}>
                {column.type}
              </div>

              {/* Resize Handle */}
              <div
                style={{
                  position: 'absolute',
                  right: '-2px',
                  top: '0',
                  bottom: '0',
                  width: '4px',
                  cursor: 'col-resize',
                  backgroundColor: isResizing === column.name ? 'var(--color-primary)' : 'transparent',
                  borderRight: '1px solid var(--border-default)'
                }}
                onMouseDown={(e) => handleResizeStart(e, column.name)}
              />
            </div>
          );
        })}
      </div>

      {/* Scrollable Body */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          backgroundColor: 'var(--bg-surface)'
        }}
      >
        {data.length === 0 ? (
          <div style={{
            padding: '20px',
            textAlign: 'center',
            color: 'var(--fg-muted)',
            fontSize: '12px'
          }}>
            No data available
          </div>
        ) : (
          data.map((row, rowIndex) => (
            <div
              key={rowIndex}
              style={{
                display: 'flex',
                borderBottom: '1px solid var(--border-muted)',
                backgroundColor: rowIndex % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-muted)'
              }}
            >


              {/* Data Cells */}
              {columns.map((column, colIndex) => {
                const width = getColumnWidth(column.name);
                const value = formatValue(row[column.name]);
                
                return (
                  <div
                    key={column.name}
                    style={{
                      width: `${width}px`,
                      minWidth: `${width}px`,
                      maxWidth: `${width}px`,
                      padding: '2px 4px',
                      borderRight: colIndex < columns.length - 1 ? '1px solid var(--border-muted)' : 'none',
                      fontSize: '10px',
                      color: 'var(--fg-default)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      minHeight: '20px'
                    }}
                    title={value} // Tooltip for truncated content
                  >
                    {value}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
