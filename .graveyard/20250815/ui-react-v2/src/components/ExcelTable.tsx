import React, { useState, useRef, useCallback } from 'react';

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
 * Updated: Fixed sorting and resizing UX
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
    
    const startX = e.clientX;
    const startWidth = getColumnWidth(columnName);
    setIsResizing(columnName);
    
    // Add visual feedback to body cursor
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const diff = moveEvent.clientX - startX;
      const newWidth = Math.max(60, Math.min(500, startWidth + diff)); // Min 60px, Max 500px
      
      setColumnWidths(prev => ({
        ...prev,
        [columnName]: newWidth
      }));
    };

    const handleMouseUp = () => {
      setIsResizing(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

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
        border: '2px solid red', // TEMPORARY: Debug border to see if changes load
        borderRadius: 'var(--radius-2)',
        overflow: 'hidden',
        backgroundColor: 'var(--card)',
        display: 'flex',
        flexDirection: 'column'
      }}
      title="ExcelTable - Updated with new sorting/resizing"
    >
      {/* Fixed Header */}
      <div
        style={{
          backgroundColor: 'var(--muted)',
          borderBottom: '1px solid var(--border)',
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
                color: 'var(--fg)',
                backgroundColor: isSorted ? 'var(--accent)' : 'var(--muted)',
                cursor: 'pointer',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'center',
                userSelect: 'none',
                transition: 'background-color 0.15s ease'
              }}
              onClick={() => handleSort(column.name)}
              onMouseEnter={(e) => {
                if (!isSorted) {
                  e.currentTarget.style.backgroundColor = 'var(--accent)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSorted) {
                  e.currentTarget.style.backgroundColor = 'var(--muted)';
                }
              }}
              title={`Click to sort by ${column.name} ${isSorted ? (sortDirection === 'asc' ? '(currently ascending)' : '(currently descending)') : ''}`}
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
                {isSorted ? (
                  <span style={{ 
                    color: 'var(--accent-9)', 
                    fontSize: '10px', 
                    fontWeight: 'bold',
                    backgroundColor: 'var(--bg)',
                    padding: '1px 3px',
                    borderRadius: '2px',
                    border: '1px solid var(--accent-9)'
                  }}>
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                ) : (
                  <span style={{ 
                    color: 'var(--fg-muted)', 
                    fontSize: '8px',
                    opacity: 0.5
                  }}>
                    ↕
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
              {index < columns.length - 1 && (
                <div
                  style={{
                    position: 'absolute',
                    right: '-4px',
                    top: '0',
                    bottom: '0',
                    width: '8px',
                    cursor: 'col-resize',
                    backgroundColor: 'transparent',
                    borderRight: isResizing === column.name ? '2px solid var(--accent-9)' : '1px solid var(--border)',
                    transition: 'border-color 0.15s ease',
                    zIndex: 10
                  }}
                  onMouseDown={(e) => handleResizeStart(e, column.name)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderRight = '2px solid var(--accent-9)';
                  }}
                  onMouseLeave={(e) => {
                    if (isResizing !== column.name) {
                      e.currentTarget.style.borderRight = '1px solid var(--border)';
                    }
                  }}
                  title={`Resize ${column.name} column`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Scrollable Body */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          backgroundColor: 'var(--bg)'
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
                backgroundColor: rowIndex % 2 === 0 ? 'var(--bg)' : 'var(--muted)'
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
                      color: 'var(--fg)',
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
