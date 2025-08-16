"use client";
import React from 'react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { dispatchFilter } from '@/state/queryBuilder';

export function Cell({ field, value }: { field: string; value: any }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">—</span>;
  }

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.altKey || e.metaKey) dispatchFilter({ type: 'exclude', field, value });
    else dispatchFilter({ type: 'include', field, value });
  };

  const str = String(value);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          onClick={onClick}
          className="max-w-[28rem] truncate rounded px-1.5 py-0.5 text-left hover:bg-muted"
          title={`${field} = ${str}`}
        >
          {str}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => dispatchFilter({ type: 'include', field, value })}>Include</ContextMenuItem>
        <ContextMenuItem onClick={() => dispatchFilter({ type: 'exclude', field, value })}>Exclude</ContextMenuItem>
        <ContextMenuItem onClick={() => dispatchFilter({ type: 'in', field, values: [value] })}>Add to IN(…)</ContextMenuItem>
        <ContextMenuItem onClick={() => dispatchFilter({ type: 'op', field, op: 'contains', value: str })}>Contains…</ContextMenuItem>
        <ContextMenuItem onClick={() => dispatchFilter({ type: 'exists', field })}>Exists</ContextMenuItem>
        <ContextMenuItem onClick={() => dispatchFilter({ type: 'exists', field, negate: true })}>Not exists</ContextMenuItem>
        <ContextMenuItem onClick={() => dispatchFilter({ type: 'sequence_add', stage: 'A', field, value })}>Add to Sequence (A)</ContextMenuItem>
        <ContextMenuItem onClick={() => navigator.clipboard.writeText(str)}>Copy value</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}


