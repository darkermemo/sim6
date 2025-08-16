export type FilterAction =
  | { type: 'include'; field: string; value: any }
  | { type: 'exclude'; field: string; value: any }
  | { type: 'in'; field: string; values: any[] }
  | { type: 'exists'; field: string; negate?: boolean }
  | {
      type: 'op';
      field: string;
      op:
        | '<'
        | '>'
        | '<='
        | '>='
        | 'regex'
        | 'contains'
        | 'startsWith'
        | 'endsWith';
      value: any;
    }
  | { type: 'sequence_add'; stage: 'A' | 'B' | 'C'; field: string; value: any }
  | { type: 'time_range'; from: number; to: number };

type FilterExecutor = (action: FilterAction) => void;

let currentExecutor: FilterExecutor | null = null;

export function setFilterExecutor(executor: FilterExecutor) {
  currentExecutor = executor;
}

export function dispatchFilter(action: FilterAction) {
  if (currentExecutor) {
    currentExecutor(action);
  } else {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[queryBuilder] No executor set for dispatchFilter', action);
    }
  }
}

// Utility to safely quote a value for simple DSL fragments
export function quoteValue(value: any): string {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  if (/^[A-Za-z0-9_.:-]+$/.test(str)) return str;
  return '"' + str.replace(/"/g, '\\"') + '"';
}


