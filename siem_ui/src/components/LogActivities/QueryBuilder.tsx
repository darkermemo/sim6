/**
 * Query Builder Component
 * Visual query construction interface
 */

import React, { useCallback } from 'react';
import { SearchFilter, FilterOperator } from '@/types/search';

interface QueryBuilderProps {
  filters: SearchFilter[];
  onFiltersChange: (filters: SearchFilter[]) => void;
  availableFields: string[];
}

const OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Not Contains' },
  { value: 'starts_with', label: 'Starts With' },
  { value: 'ends_with', label: 'Ends With' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'greater_than_or_equal', label: 'Greater Than or Equal' },
  { value: 'less_than_or_equal', label: 'Less Than or Equal' },
  { value: 'in', label: 'In List' },
  { value: 'not_in', label: 'Not In List' },
  { value: 'exists', label: 'Field Exists' },
  { value: 'not_exists', label: 'Field Not Exists' },
  { value: 'regex', label: 'Regex Match' },
  { value: 'range', label: 'Range' },
];

const DEFAULT_FIELDS = [
  'event_category',
  'event_action',
  'event_outcome',
  'source_ip',
  'destination_ip',
  'user_id',
  'user_name',
  'severity',
  'event_timestamp',
];

export const QueryBuilder: React.FC<QueryBuilderProps> = ({
  filters,
  onFiltersChange,
  availableFields,
}) => {
  const fields = availableFields.length > 0 ? availableFields : DEFAULT_FIELDS;

  const addFilter = useCallback(() => {
    const newFilter: SearchFilter = {
      field: fields[0] || 'event_category',
      operator: 'equals',
      value: '',
    };
    onFiltersChange([...filters, newFilter]);
  }, [filters, onFiltersChange, fields]);

  const removeFilter = useCallback((index: number) => {
    const newFilters = filters.filter((_, i) => i !== index);
    onFiltersChange(newFilters);
  }, [filters, onFiltersChange]);

  const updateFilter = useCallback((index: number, updates: Partial<SearchFilter>) => {
    const newFilters = filters.map((filter, i) => 
      i === index ? { ...filter, ...updates } : filter
    );
    onFiltersChange(newFilters);
  }, [filters, onFiltersChange]);

  const clearAllFilters = useCallback(() => {
    onFiltersChange([]);
  }, [onFiltersChange]);

  const styles = {
    container: {
      padding: '16px',
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      backgroundColor: '#f9f9f9',
    },
    filterRow: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 2fr auto',
      gap: '8px',
      alignItems: 'center',
      marginBottom: '8px',
      padding: '8px',
      backgroundColor: 'white',
      borderRadius: '4px',
      border: '1px solid #ddd',
    },
    select: {
      padding: '8px',
      border: '1px solid #ccc',
      borderRadius: '4px',
      fontSize: '14px',
    },
    input: {
      padding: '8px',
      border: '1px solid #ccc',
      borderRadius: '4px',
      fontSize: '14px',
    },
    button: {
      padding: '6px 12px',
      border: '1px solid #ccc',
      borderRadius: '4px',
      backgroundColor: '#f5f5f5',
      cursor: 'pointer',
      fontSize: '14px',
    },
    removeButton: {
      padding: '6px 12px',
      border: '1px solid #f44336',
      borderRadius: '4px',
      backgroundColor: '#ffebee',
      color: '#c62828',
      cursor: 'pointer',
      fontSize: '14px',
    },
    addButton: {
      padding: '8px 16px',
      border: 'none',
      borderRadius: '4px',
      backgroundColor: '#1976d2',
      color: 'white',
      cursor: 'pointer',
      fontSize: '14px',
      marginRight: '8px',
    },
    clearButton: {
      padding: '8px 16px',
      border: '1px solid #f44336',
      borderRadius: '4px',
      backgroundColor: '#ffebee',
      color: '#c62828',
      cursor: 'pointer',
      fontSize: '14px',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '16px',
    },
    title: {
      margin: 0,
      fontSize: '18px',
      fontWeight: 'bold',
    },
    emptyState: {
      textAlign: 'center' as const,
      color: '#666',
      padding: '32px',
      fontStyle: 'italic',
    },
  };

  const renderValueInput = (filter: SearchFilter, index: number) => {
    if (filter.operator === 'exists' || filter.operator === 'not_exists') {
      return (
        <span style={{ color: '#666', fontStyle: 'italic' }}>
          No value required
        </span>
      );
    }

    if (filter.operator === 'in' || filter.operator === 'not_in') {
      return (
        <input
          style={styles.input}
          type="text"
          placeholder="value1, value2, value3"
          value={Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value)}
          onChange={(e) => {
            const values = e.target.value.split(',').map(v => v.trim()).filter(v => v);
            updateFilter(index, { value: values as string[] });
          }}
        />
      );
    }

    if (filter.operator === 'range') {
      const rangeValue = Array.isArray(filter.value) ? filter.value : ['', ''];
      return (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <input
            style={{ ...styles.input, width: '80px' }}
            type="text"
            placeholder="Min"
            value={rangeValue[0] || ''}
            onChange={(e) => {
              const newRange = [e.target.value, rangeValue[1] || ''];
              updateFilter(index, { value: newRange as string[] });
            }}
          />
          <span>to</span>
          <input
            style={{ ...styles.input, width: '80px' }}
            type="text"
            placeholder="Max"
            value={rangeValue[1] || ''}
            onChange={(e) => {
              const newRange = [rangeValue[0] || '', e.target.value];
              updateFilter(index, { value: newRange as string[] });
            }}
          />
        </div>
      );
    }

    return (
      <input
        style={styles.input}
        type="text"
        placeholder="Enter value"
        value={Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value)}
        onChange={(e) => updateFilter(index, { value: e.target.value })}
      />
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Query Builder</h3>
        <div>
          <button style={styles.addButton} onClick={addFilter}>
            Add Filter
          </button>
          {filters.length > 0 && (
            <button style={styles.clearButton} onClick={clearAllFilters}>
              Clear All
            </button>
          )}
        </div>
      </div>

      {filters.length === 0 ? (
        <div style={styles.emptyState}>
          No filters added. Click &quot;Add Filter&quot; to start building your query.
        </div>
      ) : (
        <div>
          {filters.map((filter, index) => (
            <div key={index} style={styles.filterRow}>
              <select
                style={styles.select}
                value={filter.field}
                onChange={(e) => updateFilter(index, { field: e.target.value })}
              >
                {fields.map(field => (
                  <option key={field} value={field}>
                    {field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </option>
                ))}
              </select>

              <select
                style={styles.select}
                value={filter.operator}
                onChange={(e) => updateFilter(index, { operator: e.target.value as FilterOperator })}
              >
                {OPERATORS.map(op => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>

              {renderValueInput(filter, index)}

              <button
                style={styles.removeButton}
                onClick={() => removeFilter(index)}
                title="Remove filter"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {filters.length > 0 && (
        <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
          <strong>Generated Query Preview:</strong>
          <div style={{ marginTop: '8px', fontFamily: 'monospace', fontSize: '12px' }}>
            {filters.map((filter, index) => {
              let queryPart = `${filter.field}:${filter.operator}`;
              if (filter.operator !== 'exists' && filter.operator !== 'not_exists') {
                if (Array.isArray(filter.value)) {
                  queryPart += `:[${filter.value.join(', ')}]`;
                } else {
                  queryPart += `:${filter.value}`;
                }
              }
              return (
                <span key={index}>
                  {index > 0 && ' AND '}
                  {queryPart}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default QueryBuilder;