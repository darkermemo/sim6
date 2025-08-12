import React from 'react';
import { Play, FileText, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { DryRunRes } from '@/lib/rules';

interface RuleDryRunPanelProps {
  result?: DryRunRes | null;
  loading: boolean;
  onRun: (timeRange: number, limit: number) => void;
  disabled?: boolean;
}

const TIME_RANGES = [
  { value: 300, label: '5 minutes' },
  { value: 900, label: '15 minutes' },
  { value: 3600, label: '1 hour' },
  { value: 21600, label: '6 hours' },
];

export function RuleDryRunPanel({ 
  result, 
  loading, 
  onRun, 
  disabled = false 
}: RuleDryRunPanelProps) {
  const [timeRange, setTimeRange] = React.useState(900);
  const [limit, setLimit] = React.useState(100);

  const handleRun = () => {
    onRun(timeRange, limit);
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-end gap-4">
        <div>
          <Label htmlFor="timeRange">Time Range</Label>
          <Select 
            value={String(timeRange)} 
            onValueChange={(v) => setTimeRange(Number(v))}
          >
            <SelectTrigger id="timeRange" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGES.map(range => (
                <SelectItem key={range.value} value={String(range.value)}>
                  {range.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="limit">Limit</Label>
          <Input
            id="limit"
            type="number"
            value={limit}
            onChange={(e) => setLimit(Math.min(100, Math.max(1, Number(e.target.value))))}
            min={1}
            max={100}
            className="w-20"
          />
        </div>

        <Button
          onClick={handleRun}
          disabled={disabled || loading}
          className="gap-2"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Running...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Run Test
            </>
          )}
        </Button>
      </div>

      {/* Help text */}
      <Alert>
        <FileText className="w-4 h-4" />
        <AlertDescription>
          Dry run executes the rule against historical data without creating alerts. 
          Use this to test your rule before enabling it.
        </AlertDescription>
      </Alert>

      {/* Results */}
      {loading ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : result ? (
        <div className="space-y-4">
          {/* Stats */}
          <div className="flex items-center gap-4">
            <Badge variant={result.rows > 0 ? 'default' : 'secondary'}>
              {result.rows} {result.rows === 1 ? 'match' : 'matches'}
            </Badge>
            <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
              <Clock className="w-3 h-3" />
              {result.took_ms}ms
            </div>
          </div>

          {/* Sample data */}
          {result.sample && result.sample.length > 0 ? (
            <div>
              <h3 className="font-medium mb-2">Sample Results ({Math.min(result.sample.length, 50)} shown):</h3>
              <div className="bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <pre className="p-4 text-xs">
                    {JSON.stringify(result.sample.slice(0, 50), null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          ) : result.rows === 0 ? (
            <Alert>
              <AlertDescription>
                No events matched this rule in the selected time range. 
                Try adjusting the query or expanding the time range.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
