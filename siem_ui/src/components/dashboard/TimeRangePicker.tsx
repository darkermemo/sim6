import { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export type TimeRange = 
  | 'last-24h' 
  | 'last-7d' 
  | 'last-30d' 
  | 'custom';

interface TimeRangePickerProps {
  value: TimeRange;
  onChange: (range: TimeRange, customStart?: Date, customEnd?: Date) => void;
}

const timeRangeOptions = [
  { value: 'last-24h' as TimeRange, label: 'Last 24 Hours' },
  { value: 'last-7d' as TimeRange, label: 'Last 7 Days' },
  { value: 'last-30d' as TimeRange, label: 'Last 30 Days' },
  { value: 'custom' as TimeRange, label: 'Custom Range' },
];

export function TimeRangePicker({ value, onChange }: TimeRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  const currentLabel = timeRangeOptions.find(option => option.value === value)?.label || 'Last 24 Hours';

  const handleOptionSelect = (option: TimeRange) => {
    if (option === 'custom') {
      onChange(option);
    } else {
      onChange(option);
      setIsOpen(false);
    }
  };

  const handleCustomRangeApply = () => {
    if (customStart && customEnd) {
      onChange('custom', new Date(customStart), new Date(customEnd));
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="justify-start text-left font-normal"
      >
        <Calendar className="mr-2 h-4 w-4" />
        {currentLabel}
        <ChevronDown className="ml-auto h-4 w-4" />
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-2 w-64 rounded-md border border-border bg-card p-2 shadow-lg">
          <div className="space-y-1">
            {timeRangeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleOptionSelect(option.value)}
                className={cn(
                  "w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-border",
                  value === option.value && "bg-accent text-white"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {value === 'custom' && (
            <div className="mt-4 border-t border-border pt-4">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-secondary-text">Start Date</label>
                  <input
                    type="datetime-local"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-primary-text focus:border-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-text">End Date</label>
                  <input
                    type="datetime-local"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-primary-text focus:border-accent focus:outline-none"
                  />
                </div>
                <Button 
                  size="sm" 
                  onClick={handleCustomRangeApply}
                  disabled={!customStart || !customEnd}
                  className="w-full"
                >
                  Apply Range
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 