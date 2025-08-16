"use client";
import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/ActionButton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createSavedSearch } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  currentQuery: string;
  timeLastSeconds: number;
  onSaved?: () => void;
}

export function SaveSearchDialog({ open, onOpenChange, tenantId, currentQuery, timeLastSeconds, onSaved }: Props) {
  const [name, setName] = useState("");
  const [pinned, setPinned] = useState("0");
  const [saving, setSaving] = useState(false);
  const canSave = name.trim().length > 0 && !!tenantId;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await createSavedSearch({ tenant_id: tenantId || "all", name: name.trim(), q: currentQuery || "", time_last_seconds: timeLastSeconds, pinned: pinned === "1" });
      onOpenChange(false);
      setName("");
      if (onSaved) onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-white p-4 shadow-lg dark:bg-slate-900">
          <VisuallyHidden.Root>
            <Dialog.Title>Save Filter</Dialog.Title>
          </VisuallyHidden.Root>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., High Severity AD" />
            </div>
            <div>
              <Label>Pinned</Label>
              <Select value={pinned} onValueChange={setPinned}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">No</SelectItem>
                  <SelectItem value="1">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
              <ActionButton onClick={handleSave} disabled={!canSave || saving} data-action="search:saved:create" data-intent="api" data-endpoint="/api/v2/search/saved">Save</ActionButton>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}


