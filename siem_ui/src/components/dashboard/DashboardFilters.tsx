
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TimeRangePicker, type TimeRange } from './TimeRangePicker';
import { SeverityFilter, type SeverityLevel } from './SeverityFilter';

interface DashboardFiltersProps {
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange, customStart?: Date, customEnd?: Date) => void;
  selectedSeverities: SeverityLevel[];
  onSeveritiesChange: (severities: SeverityLevel[]) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function DashboardFilters({
  timeRange,
  onTimeRangeChange,
  selectedSeverities,
  onSeveritiesChange,
  onRefresh,
  isRefreshing = false
}: DashboardFiltersProps) {
  return (
    <div className="dashboard-filters">
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 bg-card rounded-lg border border-border">
        {/* Left side - Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <TimeRangePicker 
            value={timeRange} 
            onChange={onTimeRangeChange}
          />
          
          <SeverityFilter
            selectedSeverities={selectedSeverities}
            onChange={onSeveritiesChange}
          />
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="default"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>
    </div>
  );
} 