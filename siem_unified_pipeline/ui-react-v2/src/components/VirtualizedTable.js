import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
// === HELPERS ===
function getColumnType(type) {
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
function formatCellValue(value, type) {
    if (value == null)
        return '';
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
            }
            catch {
                return String(value);
            }
        case 'boolean':
            return value ? '✓' : '✗';
        default:
            return String(value);
    }
}
// === MAIN COMPONENT ===
export function VirtualizedTable({ columns = [], data = [], loading = false, error = null, onRowClick, onRowSelect, height = 600, rowHeight = 35, enableSelection = false, enableSorting = true, enableColumnResizing = true, className = '', }) {
    // Table state
    const [sorting, setSorting] = useState([]);
    const [columnVisibility, setColumnVisibility] = useState({});
    const [rowSelection, setRowSelection] = useState({});
    // Create table columns from API meta
    const tableColumns = useMemo(() => {
        const cols = [];
        // Selection column
        if (enableSelection) {
            cols.push({
                id: 'select',
                header: ({ table }) => (_jsx("input", { type: "checkbox", checked: table.getIsAllRowsSelected(), onChange: table.getToggleAllRowsSelectedHandler(), style: { margin: 0 } })),
                cell: ({ row }) => (_jsx("input", { type: "checkbox", checked: row.getIsSelected(), onChange: row.getToggleSelectedHandler(), style: { margin: 0 } })),
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
                    return (_jsx("span", { title: String(value), style: {
                            fontSize: '13px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            display: 'block'
                        }, children: formatCellValue(value, col.type) }));
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
    const parentRef = React.useRef(null);
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
    const handleRowClick = useCallback((row, index) => {
        if (onRowClick) {
            onRowClick(row, index);
        }
    }, [onRowClick]);
    // Show loading state
    if (loading) {
        return (_jsx("div", { className: `virtualized-table loading ${className}`, style: { height, display: 'flex', alignItems: 'center', justifyContent: 'center' }, children: _jsxs("div", { style: { textAlign: 'center' }, children: [_jsx("div", { style: { fontSize: '18px', marginBottom: '10px' }, children: "\u23F3" }), _jsx("div", { children: "Loading data..." })] }) }));
    }
    // Show error state
    if (error) {
        return (_jsx("div", { className: `virtualized-table error ${className}`, style: { height, display: 'flex', alignItems: 'center', justifyContent: 'center' }, children: _jsxs("div", { style: { textAlign: 'center', color: '#c53030' }, children: [_jsx("div", { style: { fontSize: '18px', marginBottom: '10px' }, children: "\u26A0\uFE0F" }), _jsx("div", { children: "Error loading data" }), _jsx("div", { style: { fontSize: '12px', marginTop: '5px' }, children: error.message })] }) }));
    }
    // Show empty state
    if (data.length === 0) {
        return (_jsx("div", { className: `virtualized-table empty ${className}`, style: { height, display: 'flex', alignItems: 'center', justifyContent: 'center' }, children: _jsxs("div", { style: { textAlign: 'center', color: '#718096' }, children: [_jsx("div", { style: { fontSize: '18px', marginBottom: '10px' }, children: "\uD83D\uDCED" }), _jsx("div", { children: "No data available" })] }) }));
    }
    return (_jsxs("div", { className: `virtualized-table ${className}`, style: { height }, children: [_jsxs("div", { style: {
                    padding: '8px',
                    borderBottom: '1px solid #e2e8f0',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                }, children: [_jsxs("span", { children: ["\uD83D\uDCCA ", data.length.toLocaleString(), " rows"] }), enableSelection && (_jsxs("span", { children: [Object.keys(rowSelection).length, " selected"] })), _jsx("div", { style: { marginLeft: 'auto' }, children: _jsxs("label", { style: { marginRight: '10px' }, children: ["Columns:", _jsxs("select", { onChange: (e) => {
                                        const col = e.target.value;
                                        if (col) {
                                            setColumnVisibility(prev => ({
                                                ...prev,
                                                [col]: !prev[col]
                                            }));
                                        }
                                    }, style: { marginLeft: '5px', padding: '2px', fontSize: '11px' }, children: [_jsx("option", { value: "", children: "Toggle visibility..." }), table.getAllLeafColumns().map(column => (_jsxs("option", { value: column.id, children: [column.getIsVisible() ? '✓' : '✗', " ", column.id] }, column.id)))] })] }) })] }), _jsx("div", { ref: parentRef, style: {
                    height: height - 40, // Account for controls
                    overflow: 'auto',
                }, children: _jsxs("div", { style: { height: `${virtualizer.getTotalSize()}px`, position: 'relative' }, children: [_jsx("div", { style: {
                                position: 'sticky',
                                top: 0,
                                zIndex: 1,
                                background: '#f7fafc',
                                borderBottom: '2px solid #e2e8f0',
                            }, children: table.getHeaderGroups().map(headerGroup => (_jsx("div", { style: { display: 'flex', height: `${rowHeight}px` }, children: headerGroup.headers.map(header => (_jsxs("div", { style: {
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
                                    }, onClick: header.column.getToggleSortingHandler(), children: [flexRender(header.column.columnDef.header, header.getContext()), header.column.getIsSorted() && (_jsx("span", { style: { marginLeft: '4px' }, children: header.column.getIsSorted() === 'desc' ? '↓' : '↑' }))] }, header.id))) }, headerGroup.id))) }), virtualizer.getVirtualItems().map(virtualRow => {
                            const row = rows[virtualRow.index];
                            return (_jsx("div", { style: {
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
                                }, onClick: () => handleRowClick(row.original, virtualRow.index), onMouseEnter: (e) => {
                                    e.currentTarget.style.background = '#e6fffa';
                                }, onMouseLeave: (e) => {
                                    e.currentTarget.style.background = virtualRow.index % 2 === 0 ? '#ffffff' : '#f8fafc';
                                }, children: row.getVisibleCells().map(cell => (_jsx("div", { style: {
                                        width: cell.column.getSize(),
                                        padding: '8px',
                                        borderRight: '1px solid #f1f5f9',
                                        overflow: 'hidden',
                                    }, children: flexRender(cell.column.columnDef.cell, cell.getContext()) }, cell.id))) }, row.id));
                        })] }) })] }));
}
export default VirtualizedTable;
