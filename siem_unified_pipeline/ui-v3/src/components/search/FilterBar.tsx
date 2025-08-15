'use client'
import React from 'react'
import type { Filter } from '@/types/filters'
import { Button } from '@/components/ui/button'

export function FilterBar({ onAddRule, onAddGroup, onClear, onApply }: {
  onAddRule: () => void
  onAddGroup: () => void
  onClear: () => void
  onApply: () => void
}) {
  return (
    <div className="flex gap-2">
      <Button variant="secondary" onClick={onAddRule}>Add Filter</Button>
      <Button variant="secondary" onClick={onAddGroup}>Add Group</Button>
      <Button variant="outline" onClick={onClear}>Clear</Button>
      <Button onClick={onApply}>Apply</Button>
    </div>
  )
}


