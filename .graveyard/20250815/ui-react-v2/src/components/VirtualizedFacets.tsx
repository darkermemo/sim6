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

// === TYPES ===

export interface FacetValue {
  value: string;
  count: number;
}

export interface FacetGroup {
  field: string;
  label?: string;
  values: FacetValue[];
  expanded?: boolean;
}

export interface VirtualizedFacetsProps {
  facets: Record<string, FacetValue[]>;
  loading?: boolean;
  error?: Error | null;
  onFacetClick?: (field: string, value: string, count: number) => void;
  maxHeight?: number;
  itemHeight?: number;
  className?: string;
}

// === HELPERS ===

function formatFacetField(field: string): string {
  return field
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

// === FACET ITEM COMPONENT ===

interface FacetItemProps {
  field: string;
  value: FacetValue;
  onFacetClick?: (field: string, value: string, count: number) => void;
  searchTerm: string;
}

function FacetItem({ field, value, onFacetClick, searchTerm }: FacetItemProps) {
  const handleClick = useCallback(() => {
    if (onFacetClick) {
      onFacetClick(field, value.value, value.count);
    }
  }, [field, value, onFacetClick]);

  // Highlight search term
  const highlightedValue = useMemo(() => {
    if (!searchTerm) return value.value;
    
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    const parts = value.value.split(regex);
    
    return parts.map((part, i) => 
      regex.test(part) ? 
        <mark key={i} style={{ background: '#fef08a', padding: 0 }}>{part}</mark> : 
        part
    );
  }, [value.value, searchTerm]);

  return (
    <div
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        cursor: 'pointer',
        fontSize: '13px',
        borderBottom: '1px solid #f1f5f9',
        transition: 'background-color 0.1s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#f0f9ff';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <span 
        style={{ 
          flex: 1, 
          overflow: 'hidden', 
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginRight: '8px'
        }}
        title={value.value}
      >
        {highlightedValue}
      </span>
      <span 
        style={{ 
          background: '#e5e7eb', 
          color: '#374151',
          padding: '2px 6px', 
          borderRadius: '10px', 
          fontSize: '11px',
          fontWeight: '500',
          minWidth: '20px',
          textAlign: 'center',
          flexShrink: 0
        }}
      >
        {formatCount(value.count)}
      </span>
    </div>
  );
}

// === FACET GROUP COMPONENT ===

interface FacetGroupProps {
  field: string;
  values: FacetValue[];
  expanded: boolean;
  onToggle: () => void;
  onFacetClick?: (field: string, value: string, count: number) => void;
  maxHeight: number;
  itemHeight: number;
}

function FacetGroupComponent({
  field,
  values,
  expanded,
  onToggle,
  onFacetClick,
  maxHeight,
  itemHeight,
}: FacetGroupProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter values based on search term
  const filteredValues = useMemo(() => {
    if (!searchTerm) return values;
    return values.filter(v => 
      v.value.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [values, searchTerm]);

  // Virtualization for large facet lists
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filteredValues.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight,
    overscan: 5,
  });

  const totalCount = values.reduce((sum, v) => sum + v.count, 0);

  return (
    <div style={{ borderBottom: '1px solid #e2e8f0' }}>
      {/* Header */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px',
          cursor: 'pointer',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            {expanded ? '▼' : '▶'}
          </span>
          <span style={{ fontWeight: '600', fontSize: '13px', color: '#374151' }}>
            {formatFacetField(field)}
          </span>
          <span style={{ 
            background: '#d1d5db', 
            color: '#374151',
            padding: '2px 6px', 
            borderRadius: '10px', 
            fontSize: '10px',
            fontWeight: '500'
          }}>
            {values.length}
          </span>
        </div>
        <span style={{ fontSize: '11px', color: '#6b7280' }}>
          {formatCount(totalCount)} events
        </span>
      </div>

      {/* Content */}
      {expanded && (
        <div>
          {/* Search */}
          {values.length > 10 && (
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
              <input
                type="text"
                placeholder={`Search ${field}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  outline: 'none',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#3b82f6';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#d1d5db';
                }}
              />
            </div>
          )}

          {/* Values List */}
          {filteredValues.length === 0 ? (
            <div style={{ 
              padding: '20px', 
              textAlign: 'center', 
              color: '#6b7280',
              fontSize: '12px' 
            }}>
              No values found
            </div>
          ) : filteredValues.length > 20 ? (
            /* Virtualized for large lists */
            <div
              ref={parentRef}
              style={{
                height: Math.min(maxHeight, filteredValues.length * itemHeight),
                overflow: 'auto',
              }}
            >
              <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
                {virtualizer.getVirtualItems().map(virtualItem => {
                  const value = filteredValues[virtualItem.index];
                  return (
                    <div
                      key={virtualItem.key}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <FacetItem
                        field={field}
                        value={value}
                        onFacetClick={onFacetClick}
                        searchTerm={searchTerm}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Non-virtualized for small lists */
            <div style={{ maxHeight: maxHeight, overflow: 'auto' }}>
              {filteredValues.map((value, index) => (
                <FacetItem
                  key={`${field}-${value.value}-${index}`}
                  field={field}
                  value={value}
                  onFacetClick={onFacetClick}
                  searchTerm={searchTerm}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// === MAIN COMPONENT ===

export function VirtualizedFacets({
  facets = {},
  loading = false,
  error = null,
  onFacetClick,
  maxHeight = 200,
  itemHeight = 32,
  className = '',
}: VirtualizedFacetsProps) {
  
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Convert facets to groups and auto-expand first few
  const facetGroups = useMemo<FacetGroup[]>(() => {
    return Object.entries(facets).map(([field, values]) => ({
      field,
      label: formatFacetField(field),
      values: (values || []).slice().sort((a, b) => b.count - a.count),
      expanded: expandedGroups[field] ?? false,
    }));
  }, [facets, expandedGroups]);

  // Auto-expand first 3 groups after facets load (avoid state updates during render)
  React.useEffect(() => {
    if (Object.keys(expandedGroups).length === 0 && facetGroups.length > 0) {
      const autoExpanded: Record<string, boolean> = {};
      facetGroups.slice(0, 3).forEach(group => {
        autoExpanded[group.field] = true;
      });
      setExpandedGroups(autoExpanded);
    }
  }, [facetGroups, expandedGroups]);

  const handleToggleGroup = useCallback((field: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  }, []);

  // Show loading state
  if (loading) {
    return (
      <div className={`virtualized-facets loading ${className}`}>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', marginBottom: '8px' }}>⏳</div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>Loading facets...</div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className={`virtualized-facets error ${className}`}>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', marginBottom: '8px', color: '#dc2626' }}>⚠️</div>
          <div style={{ fontSize: '12px', color: '#dc2626' }}>Error loading facets</div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
            {error.message}
          </div>
        </div>
      </div>
    );
  }

  // Show empty state
  if (facetGroups.length === 0) {
    return (
      <div className={`virtualized-facets empty ${className}`}>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', marginBottom: '8px' }}>📊</div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>No facets available</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`virtualized-facets ${className}`} style={{ height: '100%', overflow: 'auto' }}>
      
      {/* Header */}
      <div style={{
        padding: '12px',
        background: '#f8fafc',
        borderBottom: '2px solid #e2e8f0',
        position: 'sticky',
        top: 0,
        zIndex: 1,
      }}>
        <h3 style={{ 
          margin: 0, 
          fontSize: '14px', 
          fontWeight: '600',
          color: '#374151',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          🎯 Facets
          <span style={{
            background: '#e5e7eb',
            color: '#374151',
            padding: '2px 6px',
            borderRadius: '10px',
            fontSize: '10px',
            fontWeight: '500'
          }}>
            {facetGroups.length}
          </span>
        </h3>
      </div>

      {/* Facet Groups */}
      <div>
        {facetGroups.map((group) => (
          <FacetGroupComponent
            key={group.field}
            field={group.field}
            values={group.values}
            expanded={group.expanded ?? false}
            onToggle={() => handleToggleGroup(group.field)}
            onFacetClick={onFacetClick}
            maxHeight={maxHeight}
            itemHeight={itemHeight}
          />
        ))}
      </div>

      {/* Collapse All / Expand All */}
      <div style={{
        padding: '12px',
        borderTop: '1px solid #e2e8f0',
        background: '#f8fafc',
        position: 'sticky',
        bottom: 0,
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => {
              const allExpanded: Record<string, boolean> = {};
              facetGroups.forEach(group => {
                allExpanded[group.field] = true;
              });
              setExpandedGroups(allExpanded);
            }}
            style={{
              flex: 1,
              padding: '6px',
              fontSize: '11px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            Expand All
          </button>
          <button
            onClick={() => setExpandedGroups({})}
            style={{
              flex: 1,
              padding: '6px',
              fontSize: '11px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            Collapse All
          </button>
        </div>
      </div>
    </div>
  );
}

export default VirtualizedFacets;
