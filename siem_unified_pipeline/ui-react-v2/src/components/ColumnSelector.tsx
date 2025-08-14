import React, { useState, useMemo } from 'react';

interface Column {
  name: string;
  type?: string;
}

interface Props {
  columns: Column[];
  selectedColumns: string[];
  onChange: (selected: string[]) => void;
  defaultColumns?: string[];
}

/**
 * ColumnSelector - Modern checkbox-based column selection dropdown
 * Features: search, select all/none, grouped columns, clean design
 */
export default function ColumnSelector({ 
  columns, 
  selectedColumns, 
  onChange, 
  defaultColumns = [] 
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter columns based on search
  const filteredColumns = useMemo(() => {
    if (!searchTerm) return columns;
    return columns.filter(col => 
      col.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [columns, searchTerm]);

  // Group columns by type for better organization
  const groupedColumns = useMemo(() => {
    const groups: Record<string, Column[]> = {};
    filteredColumns.forEach(col => {
      const group = col.type || 'Other';
      if (!groups[group]) groups[group] = [];
      groups[group].push(col);
    });
    return groups;
  }, [filteredColumns]);

  const handleColumnToggle = (columnName: string) => {
    const isSelected = selectedColumns.includes(columnName);
    if (isSelected) {
      onChange(selectedColumns.filter(name => name !== columnName));
    } else {
      onChange([...selectedColumns, columnName]);
    }
  };

  const handleSelectAll = () => {
    onChange(columns.map(col => col.name));
  };

  const handleSelectNone = () => {
    onChange([]);
  };

  const handleSelectDefault = () => {
    onChange(defaultColumns);
  };

  const allSelected = selectedColumns.length === columns.length;
  const noneSelected = selectedColumns.length === 0;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '4px 8px',
          border: '1px solid var(--border-default)',
          borderRadius: '4px',
          backgroundColor: 'var(--bg-surface)',
          cursor: 'pointer',
          fontSize: '11px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          minWidth: '120px',
          justifyContent: 'space-between'
        }}
      >
        <span>Columns ({selectedColumns.length})</span>
        <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
          v
        </span>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 1000,
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: '6px',
            boxShadow: 'var(--shadow-3)',
            minWidth: '320px',
            maxHeight: '400px',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Header with search and quick actions */}
          <div style={{ 
            padding: '8px', 
            borderBottom: '1px solid var(--border-default)',
            backgroundColor: 'var(--bg-muted)'
          }}>
            {/* Search */}
            <input
              type="text"
              placeholder="Search columns..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '4px 8px',
                border: '1px solid var(--border-default)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--fg-default)',
                borderRadius: '3px',
                fontSize: '11px',
                marginBottom: '6px'
              }}
            />
            
            {/* Quick Actions */}
            <div style={{ display: 'flex', gap: '4px', fontSize: '10px' }}>
              <button
                onClick={handleSelectAll}
                disabled={allSelected}
                style={{
                  padding: '2px 6px',
                  border: '1px solid var(--border-default)',
                  borderRadius: '2px',
                  backgroundColor: allSelected ? 'var(--bg-muted)' : 'var(--color-primary)',
                  color: allSelected ? 'var(--fg-muted)' : 'white',
                  cursor: allSelected ? 'not-allowed' : 'pointer',
                  fontSize: '9px'
                }}
              >
                All
              </button>
              <button
                onClick={handleSelectNone}
                disabled={noneSelected}
                style={{
                  padding: '2px 6px',
                  border: '1px solid var(--border-default)',
                  borderRadius: '2px',
                  backgroundColor: noneSelected ? 'var(--bg-muted)' : 'var(--color-destructive)',
                  color: noneSelected ? 'var(--fg-muted)' : 'white',
                  cursor: noneSelected ? 'not-allowed' : 'pointer',
                  fontSize: '9px'
                }}
              >
                None
              </button>
              {defaultColumns.length > 0 && (
                <button
                  onClick={handleSelectDefault}
                  style={{
                    padding: '2px 6px',
                    border: '1px solid var(--border-default)',
                    borderRadius: '2px',
                    backgroundColor: 'var(--color-success)',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '9px'
                  }}
                >
                  Default
                </button>
              )}
            </div>
          </div>

          {/* Column List */}
          <div style={{ 
            flex: 1, 
            overflow: 'auto',
            maxHeight: '300px'
          }}>
            {Object.keys(groupedColumns).length === 0 ? (
              <div style={{ 
                padding: '16px', 
                textAlign: 'center', 
                color: '#9ca3af', 
                fontSize: '11px' 
              }}>
                No columns found
              </div>
            ) : (
              Object.entries(groupedColumns).map(([groupName, groupColumns]) => (
                <div key={groupName}>
                  {/* Group Header */}
                  {Object.keys(groupedColumns).length > 1 && (
                    <div style={{
                      padding: '4px 8px',
                      backgroundColor: '#f3f4f6',
                      fontSize: '9px',
                      fontWeight: 600,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      {groupName} ({groupColumns.length})
                    </div>
                  )}
                  
                  {/* Group Columns */}
                  {groupColumns.map((column) => {
                    const isSelected = selectedColumns.includes(column.name);
                    return (
                      <label
                        key={column.name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '4px 8px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                          borderLeft: isSelected ? '3px solid #3b82f6' : '3px solid transparent'
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.backgroundColor = '#f9fafb';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }
                        }}
                      >
                        {/* Custom Checkbox */}
                        <div
                          style={{
                            width: '14px',
                            height: '14px',
                            border: `2px solid ${isSelected ? '#3b82f6' : '#d1d5db'}`,
                            borderRadius: '2px',
                            backgroundColor: isSelected ? '#3b82f6' : '#ffffff',
                            marginRight: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}
                        >
                          {isSelected && (
                            <span style={{ color: 'white', fontSize: '10px', lineHeight: 1 }}>✓</span>
                          )}
                        </div>
                        
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleColumnToggle(column.name)}
                          style={{ display: 'none' }}
                        />
                        
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ 
                            fontWeight: isSelected ? 600 : 400,
                            color: isSelected ? '#1f2937' : '#374151'
                          }}>
                            {column.name}
                          </div>
                          {column.type && (
                            <div style={{ 
                              fontSize: '9px', 
                              color: '#9ca3af',
                              marginTop: '1px'
                            }}>
                              {column.type}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '6px 8px',
            borderTop: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb',
            fontSize: '9px',
            color: '#6b7280',
            textAlign: 'center'
          }}>
            {selectedColumns.length} of {columns.length} columns selected
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999
          }}
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
