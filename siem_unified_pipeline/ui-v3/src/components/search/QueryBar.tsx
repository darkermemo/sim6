"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Search, Play, Save, Download, Database } from "lucide-react";
import type { TimeRange } from "@/types/search";

export interface QueryBarProps {
  tenantId: string;
  query: string;
  time: TimeRange;
  onTenantChange: (tenant: string) => void;
  onQueryChange: (query: string) => void;
  onTimeChange: (time: TimeRange) => void;
  onCompile: () => void;
  onRun: () => void;
  onSave: (name: string) => void;
  onExport: () => void;
  saving?: boolean;
  exporting?: boolean;
  compiling?: boolean;
  running?: boolean;
}

export function QueryBar(props: QueryBarProps) {
  const {
    tenantId,
    query,
    time,
    onTenantChange,
    onQueryChange,
    onTimeChange,
    onCompile,
    onRun,
    onSave,
    onExport,
    saving,
    exporting,
    compiling,
    running,
  } = props;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onRun();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onCompile();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        const name = prompt("Save search as:");
        if (name) onSave(name);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onRun, onCompile, onSave]);

  const handleTimeChange = (value: string) => {
    if (value === "custom") {
      const fromDate = prompt("From date (YYYY-MM-DD HH:MM):");
      const toDate = prompt("To date (YYYY-MM-DD HH:MM):");
      if (fromDate && toDate) {
        const from = Math.floor(new Date(fromDate).getTime() / 1000);
        const to = Math.floor(new Date(toDate).getTime() / 1000);
        if (!Number.isNaN(from) && !Number.isNaN(to)) onTimeChange({ from, to });
      }
    } else {
      onTimeChange({ last_seconds: parseInt(value) });
    }
  };

  return (
    <Card className="p-4 border-0 rounded-none border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <Select value={tenantId} onValueChange={onTenantChange}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Tenant" />
            </SelectTrigger>
            <SelectContent>
              {[
                "all",
                "default",
                "1",
                "hr",
                "finance",
                "engineering",
                "sales",
                "marketing",
                "ops",
                "security",
                "admin",
              ].map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Time:</span>
          <Select
            value={"last_seconds" in time ? String(time.last_seconds ?? "custom") : "custom"}
            onValueChange={handleTimeChange}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="300">5m</SelectItem>
              <SelectItem value="600">10m</SelectItem>
              <SelectItem value="3600">1h</SelectItem>
              <SelectItem value="86400">24h</SelectItem>
              <SelectItem value="604800">7d</SelectItem>
              <SelectItem value="2592000">30d</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            className="pl-10 font-mono"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (e.metaKey || e.ctrlKey) onCompile();
                else onRun();
              }
            }}
            placeholder="Enter your search query..."
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={onCompile}
            disabled={!!compiling}
            variant="outline"
            size="sm"
          >
            {compiling ? "Compiling..." : "Compile"}
          </Button>

          <Button
            onClick={onRun}
            disabled={!!running}
            size="sm"
          >
            <Play className="h-4 w-4 mr-2" />
            {running ? "Running..." : "Run"}
          </Button>

          <Button
            onClick={() => {
              const name = prompt("Save search as:");
              if (name) onSave(name);
            }}
            disabled={!!saving}
            variant="outline"
            size="sm"
          >
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>

          <Button
            onClick={onExport}
            disabled={!!exporting}
            variant="outline"
            size="sm"
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>
    </Card>
  );
}


