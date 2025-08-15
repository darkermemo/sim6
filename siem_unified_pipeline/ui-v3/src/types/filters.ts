export type FilterOp =
  | 'eq' | 'neq' | 'in' | 'contains' | 'prefix' | 'regex'
  | 'lt' | 'lte' | 'gt' | 'gte' | 'range' | 'exists' | 'not_exists'
  | 'cidr';

export type Scalar = string | number | boolean;
export type Range = [number, number] | [string, string];

export type Filter =
  | { kind: 'rule'; field: string; op: FilterOp; value?: Scalar | Scalar[] | Range | null; negate?: boolean }
  | { kind: 'group'; logic: 'AND' | 'OR'; children: Filter[] };

// UI-specific filter type with stable IDs for React keys
export type UiFilter = {
  id: string;                // stable unique ID for React keys
  field?: string | null;
  op?: string | null;
  value?: unknown;
  groupBy?: string[];
};

export interface FilterRequest {
  tenant_id: string;
  time: { last_seconds?: number; from?: string; to?: string };
  root: Filter;
  limit?: number;
  offset?: number;
}

export type FieldMeta = { name: string; type: string; source: 'column' | 'json'; freq?: number };
export type SchemaMap = Record<string, { type: string; source: 'column' | 'json' }>;


