/**
 * Unit tests for VirtualizedTable component
 * 
 * Tests the core enterprise table that handles 10-50k rows
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VirtualizedTable from '../VirtualizedTable';

const mockColumns = [
  { name: 'id', type: 'String', label: 'ID' },
  { name: 'name', type: 'String', label: 'Name' },
  { name: 'count', type: 'Int32', label: 'Count' },
  { name: 'timestamp', type: 'DateTime', label: 'Timestamp' },
];

const mockData = [
  { id: '1', name: 'Event A', count: 100, timestamp: 1640995200 },
  { id: '2', name: 'Event B', count: 250, timestamp: 1640995260 },
  { id: '3', name: 'Event C', count: 75, timestamp: 1640995320 },
];

describe('VirtualizedTable', () => {
  it('renders with data', () => {
    render(
      <VirtualizedTable
        columns={mockColumns}
        data={mockData}
      />
    );

    // Should show data count
    expect(screen.getByText('3 rows')).toBeInTheDocument();
    
    // Should show column headers
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Count')).toBeInTheDocument();
    expect(screen.getByText('Timestamp')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(
      <VirtualizedTable
        columns={mockColumns}
        data={[]}
        loading={true}
      />
    );

    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('shows error state', () => {
    const error = new Error('Failed to load data');
    
    render(
      <VirtualizedTable
        columns={mockColumns}
        data={[]}
        error={error}
      />
    );

    expect(screen.getByText('Error loading data')).toBeInTheDocument();
    expect(screen.getByText('Failed to load data')).toBeInTheDocument();
  });

  it('shows empty state', () => {
    render(
      <VirtualizedTable
        columns={mockColumns}
        data={[]}
      />
    );

    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('handles row clicks', async () => {
    const onRowClick = jest.fn();
    const user = userEvent.setup();

    render(
      <VirtualizedTable
        columns={mockColumns}
        data={mockData}
        onRowClick={onRowClick}
      />
    );

    // Find and click first row
    const firstRow = screen.getByText('Event A').closest('[style*="position: absolute"]');
    expect(firstRow).toBeInTheDocument();
    
    if (firstRow) {
      await user.click(firstRow);
      expect(onRowClick).toHaveBeenCalledWith(mockData[0], 0);
    }
  });

  it('handles selection when enabled', async () => {
    const onRowSelect = jest.fn();
    const user = userEvent.setup();

    render(
      <VirtualizedTable
        columns={mockColumns}
        data={mockData}
        enableSelection={true}
        onRowSelect={onRowSelect}
      />
    );

    // Should have selection column
    const selectAllCheckbox = screen.getByRole('checkbox');
    expect(selectAllCheckbox).toBeInTheDocument();

    // Click select all
    await user.click(selectAllCheckbox);
    
    // Should call onRowSelect with all rows
    await waitFor(() => {
      expect(onRowSelect).toHaveBeenCalledWith(mockData);
    });
  });

  it('formats cell values correctly', () => {
    const dataWithTimestamp = [
      { id: '1', name: 'Test', count: 1000, timestamp: 1640995200 },
    ];

    render(
      <VirtualizedTable
        columns={mockColumns}
        data={dataWithTimestamp}
      />
    );

    // Number should be formatted with locale
    expect(screen.getByText('1,000')).toBeInTheDocument();
    
    // Timestamp should be formatted as date
    expect(screen.getByText(/2022/)).toBeInTheDocument();
  });

  it('handles sorting when enabled', async () => {
    const user = userEvent.setup();

    render(
      <VirtualizedTable
        columns={mockColumns}
        data={mockData}
        enableSorting={true}
      />
    );

    // Click on Count header to sort
    const countHeader = screen.getByText('Count');
    await user.click(countHeader);

    // Should show sort indicator
    expect(countHeader.parentElement).toHaveTextContent('↑');
  });

  it('handles column visibility toggle', async () => {
    const user = userEvent.setup();

    render(
      <VirtualizedTable
        columns={mockColumns}
        data={mockData}
      />
    );

    // Find column visibility dropdown
    const visibilitySelect = screen.getByDisplayValue('Toggle visibility...');
    
    // Select a column to toggle
    await user.selectOptions(visibilitySelect, 'name');

    // Column should still be visible by default
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('applies custom className and style', () => {
    const { container } = render(
      <VirtualizedTable
        columns={mockColumns}
        data={mockData}
        className="custom-table"
        style={{ border: '2px solid red' }}
      />
    );

    const table = container.querySelector('.virtualized-table');
    expect(table).toHaveClass('custom-table');
    expect(table).toHaveStyle({ border: '2px solid red' });
  });

  it('handles large datasets without performance issues', () => {
    // Generate large dataset
    const largeData = Array.from({ length: 10000 }, (_, i) => ({
      id: `${i}`,
      name: `Event ${i}`,
      count: Math.floor(Math.random() * 1000),
      timestamp: 1640995200 + i,
    }));

    const startTime = performance.now();
    
    render(
      <VirtualizedTable
        columns={mockColumns}
        data={largeData}
      />
    );

    const endTime = performance.now();
    
    // Should render quickly even with large dataset
    expect(endTime - startTime).toBeLessThan(1000); // Less than 1 second
    
    // Should show correct row count
    expect(screen.getByText('10,000 rows')).toBeInTheDocument();
  });
});
