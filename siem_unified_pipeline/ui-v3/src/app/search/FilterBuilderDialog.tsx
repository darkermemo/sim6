"use client";
import React, { useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import type { Block, TimeCtrl } from '@/types/blocks'
import { serializeBlocks } from '@/lib/blocks-serializer'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export function FilterBuilderDialog({ open, onOpenChange, onApply }: { open: boolean; onOpenChange: (o:boolean)=>void; onApply: (q: string, time: TimeCtrl) => void }) {
  const [time, setTime] = useState<TimeCtrl>({ last_seconds: 900 })
  const [blocks, setBlocks] = useState<Block[]>([])

  const valid = useMemo(() => {
    return blocks.every(b => {
      if (b.kind==='field') return b.field && b.op && (b.op==='exists' || b.op==='not in' || b.value!==undefined)
      if (b.kind==='sequence') return b.stages.length>=2 && b.window_sec>0
      if (b.kind==='rolling') return b.metric && b.func && b.window_sec>0
      if (b.kind==='ratio') return b.numerator && b.denominator && b.bucket_sec>0
      if (b.kind==='spike') return b.metric && b.window_sec>0 && b.history_buckets>0
      if (b.kind==='first_seen') return b.dimension && b.horizon_days>0
      return false
    })
  }, [blocks])

  const q = useMemo(() => serializeBlocks(blocks), [blocks])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed inset-0 bg-background p-4 overflow-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-semibold">Filter Builder</div>
            <div className="flex items-center gap-2">
              <Label>Last</Label>
              <select className="border rounded px-2 py-1 text-sm" value={time.last_seconds || 900} onChange={e=>setTime({ last_seconds: parseInt(e.target.value) })}>
                <option value={300}>5m</option>
                <option value={900}>15m</option>
                <option value={3600}>1h</option>
                <option value={86400}>24h</option>
              </select>
            </div>
          </div>
          <Tabs.Root defaultValue="blocks">
            <Tabs.List className="border-b mb-3">
              <Tabs.Trigger className="px-3 py-2" value="blocks">Blocks</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="blocks">
              <div className="space-y-2">
                {/* Minimal UX: add buttons for block kinds; detailed editors can be expanded later */}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={()=>setBlocks(b=>[...b,{kind:'field', field:'event_type', op:'=', value:'auth'} as any])}>Add Field</Button>
                  <Button variant="secondary" onClick={()=>setBlocks(b=>[...b,{kind:'sequence', stages:[{conditions:[{kind:'field', field:'event_type', op:'=', value:'auth'} as any]}], window_sec:180, by:['user'], strict_once:true} as any])}>Add Sequence</Button>
                  <Button variant="secondary" onClick={()=>setBlocks(b=>[...b,{kind:'rolling', metric:'fails', func:'sum', op:'>', value:100, window_sec:300, by:['src_ip']} as any])}>Add Rolling</Button>
                  <Button variant="secondary" onClick={()=>setBlocks(b=>[...b,{kind:'ratio', numerator:'auth_fail', denominator:'auth_succ', op:'>', k:20, bucket_sec:600, by:['src_ip']} as any])}>Add Ratio</Button>
                  <Button variant="secondary" onClick={()=>setBlocks(b=>[...b,{kind:'spike', metric:'auth_fail', window_sec:300, history_buckets:288, z:3, by:['user']} as any])}>Add Spike</Button>
                  <Button variant="secondary" onClick={()=>setBlocks(b=>[...b,{kind:'first_seen', dimension:'src_geo', horizon_days:180, by:['user']} as any])}>Add First-seen</Button>
                </div>
                <div className="rounded border p-3 text-sm bg-muted/30">
                  <div className="font-medium mb-1">Blocks</div>
                  <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(blocks,null,2)}</pre>
                </div>
              </div>
            </Tabs.Content>
          </Tabs.Root>

          <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-3 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button>
            <Button variant="secondary">Save</Button>
            <Button disabled={!valid} onClick={()=>{ onApply(q, time); onOpenChange(false); }}>Apply</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}


