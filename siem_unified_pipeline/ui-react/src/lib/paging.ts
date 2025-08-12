// Cursor-based pagination helpers

export interface CursorPaging {
  cursor?: string;
  limit?: number;
}

export interface PageMeta {
  took_ms: number;
  row_count: number;
  next_cursor?: string;
}

export function hasMorePages(meta?: PageMeta): boolean {
  return Boolean(meta?.next_cursor);
}

export function getNextCursor(meta?: PageMeta): string | undefined {
  return meta?.next_cursor;
}

// Build query params for cursor-based pagination
export function buildPagingParams(cursor?: string, limit?: number): CursorPaging {
  return {
    ...(cursor && { cursor }),
    ...(limit && { limit: Math.min(limit, 1000) }), // Cap at 1000
  };
}
