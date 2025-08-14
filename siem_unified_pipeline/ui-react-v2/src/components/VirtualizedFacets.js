import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * VirtualizedFacets - High-performance facet panel with virtualization
 *
 * Features:
 * - Handles 1000+ facet values with smooth scrolling
 * - Search/filter within facets
 * - Expandable/collapsible facet groups
 * - Click to add filters to query
 * - Shows count badges
 * - Virtualized rendering for performance
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
// === HELPERS ===
function formatFacetField(field) {
    return field
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
function formatCount(count) {
    if (count >= 1000000) {
        return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
        return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
}
function FacetItem({ field, value, onFacetClick, searchTerm }) {
    const handleClick = useCallback(() => {
        if (onFacetClick) {
            onFacetClick(field, value.value, value.count);
        }
    }, [field, value, onFacetClick]);
    // Highlight search term
    const highlightedValue = useMemo(() => {
        if (!searchTerm)
            return value.value;
        const regex = new RegExp(`(${searchTerm})`, 'gi');
        const parts = value.value.split(regex);
        return parts.map((part, i) => regex.test(part) ?
            _jsx("mark", { style: { background: '#fef08a', padding: 0 }, children: part }, i) :
            part);
    }, [value.value, searchTerm]);
    return (_jsxs("div", { onClick: handleClick, style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            cursor: 'pointer',
            fontSize: '13px',
            borderBottom: '1px solid #f1f5f9',
            transition: 'background-color 0.1s',
        }, onMouseEnter: (e) => {
            e.currentTarget.style.backgroundColor = '#f0f9ff';
        }, onMouseLeave: (e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
        }, children: [_jsx("span", { style: {
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginRight: '8px'
                }, title: value.value, children: highlightedValue }), _jsx("span", { style: {
                    background: '#e5e7eb',
                    color: '#374151',
                    padding: '2px 6px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: '500',
                    minWidth: '20px',
                    textAlign: 'center',
                    flexShrink: 0
                }, children: formatCount(value.count) })] }));
}
function FacetGroupComponent({ field, values, expanded, onToggle, onFacetClick, maxHeight, itemHeight, }) {
    const [searchTerm, setSearchTerm] = useState('');
    // Filter values based on search term
    const filteredValues = useMemo(() => {
        if (!searchTerm)
            return values;
        return values.filter(v => v.value.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [values, searchTerm]);
    // Virtualization for large facet lists
    const parentRef = React.useRef(null);
    const virtualizer = useVirtualizer({
        count: filteredValues.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => itemHeight,
        overscan: 5,
    });
    const totalCount = values.reduce((sum, v) => sum + v.count, 0);
    return (_jsxs("div", { style: { borderBottom: '1px solid #e2e8f0' }, children: [_jsxs("div", { onClick: onToggle, style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    cursor: 'pointer',
                    background: '#f8fafc',
                    borderBottom: '1px solid #e2e8f0',
                    userSelect: 'none',
                }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '8px' }, children: [_jsx("span", { style: { fontSize: '12px', color: '#6b7280' }, children: expanded ? '▼' : '▶' }), _jsx("span", { style: { fontWeight: '600', fontSize: '13px', color: '#374151' }, children: formatFacetField(field) }), _jsx("span", { style: {
                                    background: '#d1d5db',
                                    color: '#374151',
                                    padding: '2px 6px',
                                    borderRadius: '10px',
                                    fontSize: '10px',
                                    fontWeight: '500'
                                }, children: values.length })] }), _jsxs("span", { style: { fontSize: '11px', color: '#6b7280' }, children: [formatCount(totalCount), " events"] })] }), expanded && (_jsxs("div", { children: [values.length > 10 && (_jsx("div", { style: { padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }, children: _jsx("input", { type: "text", placeholder: `Search ${field}...`, value: searchTerm, onChange: (e) => setSearchTerm(e.target.value), style: {
                                width: '100%',
                                padding: '6px 8px',
                                fontSize: '12px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                outline: 'none',
                            }, onFocus: (e) => {
                                e.target.style.borderColor = '#3b82f6';
                            }, onBlur: (e) => {
                                e.target.style.borderColor = '#d1d5db';
                            } }) })), filteredValues.length === 0 ? (_jsx("div", { style: {
                            padding: '20px',
                            textAlign: 'center',
                            color: '#6b7280',
                            fontSize: '12px'
                        }, children: "No values found" })) : filteredValues.length > 20 ? (
                    /* Virtualized for large lists */
                    _jsx("div", { ref: parentRef, style: {
                            height: Math.min(maxHeight, filteredValues.length * itemHeight),
                            overflow: 'auto',
                        }, children: _jsx("div", { style: { height: `${virtualizer.getTotalSize()}px`, position: 'relative' }, children: virtualizer.getVirtualItems().map(virtualItem => {
                                const value = filteredValues[virtualItem.index];
                                return (_jsx("div", { style: {
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: `${virtualItem.size}px`,
                                        transform: `translateY(${virtualItem.start}px)`,
                                    }, children: _jsx(FacetItem, { field: field, value: value, onFacetClick: onFacetClick, searchTerm: searchTerm }) }, virtualItem.key));
                            }) }) })) : (
                    /* Non-virtualized for small lists */
                    _jsx("div", { style: { maxHeight: maxHeight, overflow: 'auto' }, children: filteredValues.map((value, index) => (_jsx(FacetItem, { field: field, value: value, onFacetClick: onFacetClick, searchTerm: searchTerm }, `${field}-${value.value}-${index}`))) }))] }))] }));
}
// === MAIN COMPONENT ===
export function VirtualizedFacets({ facets = {}, loading = false, error = null, onFacetClick, maxHeight = 200, itemHeight = 32, className = '', }) {
    const [expandedGroups, setExpandedGroups] = useState({});
    // Convert facets to groups and auto-expand first few
    const facetGroups = useMemo(() => {
        const groups = Object.entries(facets).map(([field, values]) => ({
            field,
            label: formatFacetField(field),
            values: values.sort((a, b) => b.count - a.count), // Sort by count desc
            expanded: expandedGroups[field] ?? false,
        }));
        // Auto-expand first 3 groups if none are expanded
        if (Object.keys(expandedGroups).length === 0 && groups.length > 0) {
            const autoExpanded = {};
            groups.slice(0, 3).forEach(group => {
                autoExpanded[group.field] = true;
            });
            setExpandedGroups(autoExpanded);
        }
        return groups;
    }, [facets, expandedGroups]);
    const handleToggleGroup = useCallback((field) => {
        setExpandedGroups(prev => ({
            ...prev,
            [field]: !prev[field]
        }));
    }, []);
    // Show loading state
    if (loading) {
        return (_jsx("div", { className: `virtualized-facets loading ${className}`, children: _jsxs("div", { style: { padding: '20px', textAlign: 'center' }, children: [_jsx("div", { style: { fontSize: '14px', marginBottom: '8px' }, children: "\u23F3" }), _jsx("div", { style: { fontSize: '12px', color: '#6b7280' }, children: "Loading facets..." })] }) }));
    }
    // Show error state
    if (error) {
        return (_jsx("div", { className: `virtualized-facets error ${className}`, children: _jsxs("div", { style: { padding: '20px', textAlign: 'center' }, children: [_jsx("div", { style: { fontSize: '14px', marginBottom: '8px', color: '#dc2626' }, children: "\u26A0\uFE0F" }), _jsx("div", { style: { fontSize: '12px', color: '#dc2626' }, children: "Error loading facets" }), _jsx("div", { style: { fontSize: '11px', color: '#6b7280', marginTop: '4px' }, children: error.message })] }) }));
    }
    // Show empty state
    if (facetGroups.length === 0) {
        return (_jsx("div", { className: `virtualized-facets empty ${className}`, children: _jsxs("div", { style: { padding: '20px', textAlign: 'center' }, children: [_jsx("div", { style: { fontSize: '14px', marginBottom: '8px' }, children: "\uD83D\uDCCA" }), _jsx("div", { style: { fontSize: '12px', color: '#6b7280' }, children: "No facets available" })] }) }));
    }
    return (_jsxs("div", { className: `virtualized-facets ${className}`, style: { height: '100%', overflow: 'auto' }, children: [_jsx("div", { style: {
                    padding: '12px',
                    background: '#f8fafc',
                    borderBottom: '2px solid #e2e8f0',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                }, children: _jsxs("h3", { style: {
                        margin: 0,
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#374151',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }, children: ["\uD83C\uDFAF Facets", _jsx("span", { style: {
                                background: '#e5e7eb',
                                color: '#374151',
                                padding: '2px 6px',
                                borderRadius: '10px',
                                fontSize: '10px',
                                fontWeight: '500'
                            }, children: facetGroups.length })] }) }), _jsx("div", { children: facetGroups.map((group) => (_jsx(FacetGroupComponent, { field: group.field, values: group.values, expanded: group.expanded, onToggle: () => handleToggleGroup(group.field), onFacetClick: onFacetClick, maxHeight: maxHeight, itemHeight: itemHeight }, group.field))) }), _jsx("div", { style: {
                    padding: '12px',
                    borderTop: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    position: 'sticky',
                    bottom: 0,
                }, children: _jsxs("div", { style: { display: 'flex', gap: '8px' }, children: [_jsx("button", { onClick: () => {
                                const allExpanded = {};
                                facetGroups.forEach(group => {
                                    allExpanded[group.field] = true;
                                });
                                setExpandedGroups(allExpanded);
                            }, style: {
                                flex: 1,
                                padding: '6px',
                                fontSize: '11px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                background: 'white',
                                cursor: 'pointer',
                            }, children: "Expand All" }), _jsx("button", { onClick: () => setExpandedGroups({}), style: {
                                flex: 1,
                                padding: '6px',
                                fontSize: '11px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                background: 'white',
                                cursor: 'pointer',
                            }, children: "Collapse All" })] }) })] }));
}
export default VirtualizedFacets;
