
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AlertStatus, Severity } from '@/lib/alerts';

interface AlertFiltersProps {
  statuses: AlertStatus[];
  severities: Severity[];
  ruleIds: string[];
  q: string;
  onStatusesChange: (statuses: AlertStatus[]) => void;
  onSeveritiesChange: (severities: Severity[]) => void;
  onRuleIdsChange: (ruleIds: string[]) => void;
  onQChange: (q: string) => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const ALL_STATUSES: AlertStatus[] = ['OPEN', 'ACK', 'CLOSED', 'SUPPRESSED'];
const ALL_SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

export function AlertFilters({
  statuses,
  severities,
  ruleIds,
  q,
  onStatusesChange,
  onSeveritiesChange,
  onRuleIdsChange,
  onQChange,
  collapsed = false,
  onCollapsedChange,
}: AlertFiltersProps) {
  const toggleStatus = (status: AlertStatus) => {
    if (statuses.includes(status)) {
      onStatusesChange(statuses.filter(s => s !== status));
    } else {
      onStatusesChange([...statuses, status]);
    }
  };

  const toggleSeverity = (severity: Severity) => {
    if (severities.includes(severity)) {
      onSeveritiesChange(severities.filter(s => s !== severity));
    } else {
      onSeveritiesChange([...severities, severity]);
    }
  };

  const getStatusVariant = (status: AlertStatus): "default" | "secondary" | "destructive" | "outline" => {
    if (!statuses.includes(status)) return "outline";
    switch (status) {
      case 'OPEN': return 'destructive';
      case 'ACK': return 'secondary';
      case 'CLOSED': return 'default';
      case 'SUPPRESSED': return 'outline';
      default: return 'outline';
    }
  };

  const getSeverityVariant = (severity: Severity): "default" | "secondary" | "destructive" | "outline" => {
    if (!severities.includes(severity)) return "outline";
    switch (severity) {
      case 'CRITICAL': return 'destructive';
      case 'HIGH': return 'destructive';
      case 'MEDIUM': return 'secondary';
      case 'LOW': return 'default';
      case 'INFO': return 'outline';
      default: return 'outline';
    }
  };

  if (collapsed) {
    return (
      <div className="w-12 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex items-center justify-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onCollapsedChange?.(false)}
          aria-label="Expand filters"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-white">Filters</h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onCollapsedChange?.(true)}
          aria-label="Collapse filters"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Status Filter */}
        <div>
          <label htmlFor="status-filter" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
            Status
          </label>
          <div id="status-filter" className="flex flex-wrap gap-2">
            {ALL_STATUSES.map(status => (
              <Badge
                key={status}
                variant={getStatusVariant(status)}
                className={cn(
                  "cursor-pointer select-none",
                  !statuses.includes(status) && "opacity-50"
                )}
                onClick={() => toggleStatus(status)}
              >
                {status}
              </Badge>
            ))}
          </div>
        </div>

        {/* Severity Filter */}
        <div>
          <label htmlFor="severity-filter" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
            Severity
          </label>
          <div id="severity-filter" className="flex flex-wrap gap-2">
            {ALL_SEVERITIES.map(severity => (
              <Badge
                key={severity}
                variant={getSeverityVariant(severity)}
                className={cn(
                  "cursor-pointer select-none",
                  !severities.includes(severity) && "opacity-50"
                )}
                onClick={() => toggleSeverity(severity)}
              >
                {severity}
              </Badge>
            ))}
          </div>
        </div>

        {/* Rule Filter */}
        <div>
          <label htmlFor="rule-filter" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
            Rule
          </label>
          <Input
            id="rule-filter"
            type="text"
            placeholder="Type to search rules..."
            value={ruleIds.join(', ')}
            onChange={(e) => {
              const value = e.target.value;
              const ids = value.split(',').map(id => id.trim()).filter(Boolean);
              onRuleIdsChange(ids);
            }}
            className="text-sm"
          />
        </div>

        {/* Free-text Filter */}
        <div>
          <label htmlFor="search-filter" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
            Search
          </label>
          <Input
            id="search-filter"
            type="text"
            placeholder="user:&quot;alice&quot; src_ip:10.0.0.1"
            value={q}
            onChange={(e) => onQChange(e.target.value)}
            className="text-sm"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Use field:&quot;value&quot; for exact matches
          </p>
        </div>

        {/* Quick Actions */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              onStatusesChange(['OPEN', 'ACK']);
              onSeveritiesChange([]);
              onRuleIdsChange([]);
              onQChange('');
            }}
          >
            Reset Filters
          </Button>
        </div>
      </div>
    </div>
  );
}
