'use client'
import React from 'react'
import type { Filter } from '@/types/filters'
import { ActionButton } from '@/components/ui/ActionButton'

export function FilterBar({ onAddRule, onAddGroup, onClear, onApply }: {
  onAddRule: () => void
  onAddGroup: () => void
  onClear: () => void
  onApply: () => void
}) {
  return (
    <div className="flex gap-2">
      <ActionButton 
        variant="secondary" 
        onClick={onAddRule}
        data-action="search:filter:add-rule"
        data-intent="open-modal"
      >
        Add Filter
      </ActionButton>
      <ActionButton 
        variant="secondary" 
        onClick={onAddGroup}
        data-action="search:filter:add-group"
        data-intent="open-modal"
      >
        Add Group
      </ActionButton>
      <ActionButton 
        variant="outline" 
        onClick={onClear}
        data-action="search:filter:clear"
        data-intent="api"
        data-endpoint="/api/v2/search/filters/clear"
      >
        Clear
      </ActionButton>
      <ActionButton 
        onClick={onApply}
        data-action="search:filter:apply"
        data-intent="api"
        data-endpoint="/api/v2/search/execute"
      >
        Apply
      </ActionButton>
    </div>
  )
}


