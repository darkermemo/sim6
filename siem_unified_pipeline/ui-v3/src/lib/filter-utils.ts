import { nanoid } from 'nanoid';
import type { UiFilter } from '@/types/filters';

/**
 * Creates a new UiFilter with a stable unique ID
 */
export function createUiFilter(overrides: Partial<UiFilter> = {}): UiFilter {
  return {
    id: nanoid(),
    field: null,
    op: null,
    value: null,
    groupBy: [],
    ...overrides
  };
}

/**
 * Utility to ensure field options have unique keys for React rendering
 */
export function dedupeFieldOptions<T extends { name: string }>(fields: T[]): T[] {
  const byName = new Map<string, T>();
  
  fields.forEach((field, index) => {
    const name = (field.name && field.name.trim()) || `__unnamed_field_${index}`;
    const normalizedField = { ...field, name };
    
    if (!byName.has(name)) {
      byName.set(name, normalizedField);
    }
  });
  
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Generates a stable key for React lists that handles empty/null values
 */
export function generateStableKey(prefix: string, value: unknown, index: number, suffix?: string): string {
  const cleanValue = value || `empty_${index}`;
  const parts = [prefix, index, cleanValue];
  if (suffix) parts.push(suffix);
  return parts.join('-');
}
