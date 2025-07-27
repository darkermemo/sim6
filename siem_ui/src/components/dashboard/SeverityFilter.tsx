import { useState } from 'react';
import { Filter, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

export type SeverityLevel = 'Critical' | 'High' | 'Medium' | 'Low';

interface SeverityFilterProps {
  selectedSeverities: SeverityLevel[];
  onChange: (severities: SeverityLevel[]) => void;
}

const severityOptions: { value: SeverityLevel; label: string; variant: any }[] = [
  { value: 'Critical', label: 'Critical', variant: 'critical' },
  { value: 'High', label: 'High', variant: 'high' },
  { value: 'Medium', label: 'Medium', variant: 'medium' },
  { value: 'Low', label: 'Low', variant: 'low' },
];

export function SeverityFilter({ selectedSeverities, onChange }: SeverityFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSeverityToggle = (severity: SeverityLevel) => {
    const isSelected = selectedSeverities.includes(severity);
    if (isSelected) {
      onChange(selectedSeverities.filter(s => s !== severity));
    } else {
      onChange([...selectedSeverities, severity]);
    }
  };

  const clearAll = () => {
    onChange([]);
  };

  const selectAll = () => {
    onChange(severityOptions.map(option => option.value));
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="justify-start text-left font-normal"
      >
        <Filter className="mr-2 h-4 w-4" />
        Severity
        {selectedSeverities.length > 0 && (
          <Badge variant="secondary" className="ml-2">
            {selectedSeverities.length}
          </Badge>
        )}
        <ChevronDown className="ml-auto h-4 w-4" />
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-2 w-56 rounded-md border border-border bg-card p-3 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-primary-text">Filter by Severity</span>
            <div className="flex gap-1">
              <button
                onClick={selectAll}
                className="text-xs text-accent hover:text-blue-400"
              >
                All
              </button>
              <span className="text-xs text-secondary-text">|</span>
              <button
                onClick={clearAll}
                className="text-xs text-accent hover:text-blue-400"
              >
                None
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {severityOptions.map((option) => {
              const isSelected = selectedSeverities.includes(option.value);
              return (
                <label
                  key={option.value}
                  className="flex items-center space-x-3 cursor-pointer hover:bg-border rounded-md p-2 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleSeverityToggle(option.value)}
                    className="h-4 w-4 text-accent border-border rounded focus:ring-accent focus:ring-offset-0"
                  />
                  <Badge 
                    variant={option.variant}
                    className="min-w-0 flex-shrink-0"
                  >
                    {option.label}
                  </Badge>
                </label>
              );
            })}
          </div>

          {selectedSeverities.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-xs text-secondary-text mb-2">Selected:</div>
              <div className="flex flex-wrap gap-1">
                {selectedSeverities.map((severity) => {
                  const option = severityOptions.find(opt => opt.value === severity);
                  return (
                    <Badge
                      key={severity}
                      variant={option?.variant}
                      className="text-xs"
                    >
                      {severity}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 