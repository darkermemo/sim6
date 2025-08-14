"use client";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { normalizeSeverity, type Severity } from "@/lib/severity";

import { ArrowUpDown, ArrowUp, ArrowDown, Database, Clock, HardDrive } from "lucide-react";

export interface ColumnMeta { name: string; type: string }

export function ResultTable({
  data,
  meta,
  rows,
  rowsBeforeLimit,
  statistics,
  sort,
  onSort,
  limit,
  onLimitChange,
}: {
  data: any[];
  meta: ColumnMeta[];
  rows: number;
  rowsBeforeLimit?: number;
  statistics?: { elapsed?: number; rows_read?: number; bytes_read?: number };
  sort: Array<{ field: string; dir: "asc" | "desc" }>;
  onSort: (sort: Array<{ field: string; dir: "asc" | "desc" }>) => void;
  limit: number;
  onLimitChange: (limit: number) => void;
}) {
  const handleSort = (field: string) => {
    const s = sort.find((x) => x.field === field);
    const dir = s?.dir === "asc" ? "desc" : "asc";
    onSort([{ field, dir }]);
  };

  const defaultCompact = useMemo(
    () => [
      "event_timestamp",
      "created_at",
      "severity",
      "event_type",
      "message",
      "source_type",
      "source_ip",
      "destination_ip",
      "user",
      "host",
    ],
    []
  );
  const allColumnNames = useMemo(() => meta.map((m) => m.name), [meta]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    allColumnNames.filter((n) => defaultCompact.includes(n))
  );
  const [hideEmpty, setHideEmpty] = useState<boolean>(true);

  const isEmpty = (v: any) =>
    v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && Object.keys(v).length === 0);

  const nonEmptyByColumn = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const m of meta) map[m.name] = data.some((row) => !isEmpty((row as any)[m.name]));
    return map;
  }, [data, meta]);

  const columnsToRender = useMemo(() => {
    const base = visibleColumns.length ? visibleColumns : allColumnNames;
    return meta
      .filter((m) => base.includes(m.name))
      .filter((m) => (hideEmpty ? nonEmptyByColumn[m.name] : true));
  }, [meta, visibleColumns, hideEmpty, nonEmptyByColumn, allColumnNames]);

  const getSortIcon = (field: string) => {
    const currentSort = sort.find((s) => s.field === field);
    if (!currentSort) return <ArrowUpDown className="h-3 w-3 ml-1" />;
    return currentSort.dir === "asc" ? 
      <ArrowUp className="h-3 w-3 ml-1" /> : 
      <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const getSeverityBadge = (severity: unknown) => {
    const severityMap: Record<Severity, "default" | "secondary" | "destructive" | "outline"> = {
      "critical": "destructive",
      "high": "destructive", 
      "medium": "secondary",
      "low": "outline",
      "info": "outline",
      "unknown": "outline"
    };
    const normalizedSeverity = normalizeSeverity(severity);
    return <Badge variant={severityMap[normalizedSeverity]}>{normalizedSeverity}</Badge>;
  };

  return (
    <Card className="flex-1 flex flex-col overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Search Results
            <Badge variant="outline" className="ml-2">
              {rows.toLocaleString()} {rows === 1 ? 'row' : 'rows'}
            </Badge>
          </CardTitle>
          
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {statistics && (
              <>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {statistics.elapsed?.toFixed(2) ?? 0}s
                </div>
                <div className="flex items-center gap-1">
                  <Database className="h-4 w-4" />
                  {statistics.rows_read?.toLocaleString() ?? 0} rows read
                </div>
                <div className="flex items-center gap-1">
                  <HardDrive className="h-4 w-4" />
                  {(statistics.bytes_read ? statistics.bytes_read / 1024 / 1024 : 0).toFixed(1)} MB
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Limit:</span>
            <Select value={String(limit)} onValueChange={(value) => onLimitChange(parseInt(value))}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 50, 100, 500, 1000].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="hide-empty"
              checked={hideEmpty}
              onChange={(e) => setHideEmpty(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="hide-empty" className="text-sm font-medium">
              Hide empty columns
            </label>
          </div>

          {rowsBeforeLimit && rowsBeforeLimit > rows && (
            <Badge variant="secondary">
              {rowsBeforeLimit.toLocaleString()} total (limited to {rows.toLocaleString()})
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {columnsToRender.map((column) => (
                <TableHead 
                  key={column.name}
                  onClick={() => handleSort(column.name)}
                  className="cursor-pointer hover:bg-muted/50 transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center">
                    <span className="font-medium">{column.name}</span>
                    {getSortIcon(column.name)}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, idx) => (
              <TableRow key={idx} className="hover:bg-muted/50">
                {columnsToRender.map((column) => (
                  <TableCell key={column.name} className="max-w-xs">
                    {column.name === 'severity' && row[column.name] ? 
                      getSeverityBadge(row[column.name]) :
                      <span className="truncate block">
                        {formatValue(row[column.name], column.type)}
                      </span>
                    }
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function formatValue(value: any, type: string): string {
  if (value === null || value === undefined) return "";
  if (type.includes("DateTime")) {
    const toMs = (v: any): number | null => {
      if (v === null || v === undefined) return null;
      if (typeof v === "number") {
        if (v > 1e12) return v;
        if (v > 1e9) return Math.round(v * 1000);
        return v;
      }
      if (typeof v === "string") {
        if (/^\d+(\.\d+)?$/.test(v)) {
          const num = parseFloat(v);
          return num > 1e12 ? num : Math.round(num * 1000);
        }
        const isoLike = v.includes("T") ? v : v.replace(" ", "T");
        const d1 = new Date(isoLike);
        if (!Number.isNaN(d1.getTime())) return d1.getTime();
        const d2 = new Date(isoLike + "Z");
        if (!Number.isNaN(d2.getTime())) return d2.getTime();
        return null;
      }
      return null;
    };
    const ms = toMs(value);
    if (ms === null) return "";
    return new Date(ms).toLocaleString();
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}


