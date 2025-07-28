import React, { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { TimeRange, TIME_RANGE_PRESETS } from '../types/events';

interface TimeRangePickerProps {
  value: TimeRange | null;
  onChange: (timeRange: TimeRange | null) => void;
}

export const TimeRangePicker: React.FC<TimeRangePickerProps> = ({
  value,
  onChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const getCurrentLabel = () => {
    if (!value) return 'All time';
    
    // Check if it matches a preset
    for (const preset of TIME_RANGE_PRESETS) {
      const presetRange = preset.getValue();
      if (Math.abs(presetRange.start_unix - value.start_unix) < 60 && 
          Math.abs(presetRange.end_unix - value.end_unix) < 60) {
        return preset.label;
      }
    }
    
    // Custom range
    return `${new Date(value.start_unix * 1000).toLocaleDateString()} - ${new Date(value.end_unix * 1000).toLocaleDateString()}`;
  };

  const handlePresetSelect = (preset: typeof TIME_RANGE_PRESETS[0]) => {
    onChange(preset.getValue());
    setIsOpen(false);
    setShowCustom(false);
  };

  const handleCustomSubmit = () => {
    if (!customStart || !customEnd) return;
    
    const startDate = new Date(customStart);
    const endDate = new Date(customEnd);
    
    if (startDate >= endDate) {
      alert('Start time must be before end time');
      return;
    }
    
    onChange({
      start_unix: Math.floor(startDate.getTime() / 1000),
      end_unix: Math.floor(endDate.getTime() / 1000)
    });
    
    setIsOpen(false);
    setShowCustom(false);
  };

  const formatDateTimeLocal = (unixTimestamp: number) => {
    const date = new Date(unixTimestamp * 1000);
    return date.toISOString().slice(0, 16);
  };

  React.useEffect(() => {
    if (value && showCustom) {
      setCustomStart(formatDateTimeLocal(value.start_unix));
      setCustomEnd(formatDateTimeLocal(value.end_unix));
    }
  }, [value, showCustom]);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-2 bg-card border border-border rounded-md hover:bg-border transition-colors"
      >
        <Calendar className="w-4 h-4 text-gray-500" />
        <span className="text-sm text-gray-700">{getCurrentLabel()}</span>
        <ChevronDown className="w-4 h-4 text-gray-500" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-card border border-border rounded-md shadow-lg z-10">
          {!showCustom ? (
            <div className="py-1">
              <button
                onClick={() => {
                  onChange(null);
                  setIsOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-primary-text hover:bg-border transition-colors"
              >
                All time
              </button>
              
              {TIME_RANGE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePresetSelect(preset)}
                  className="w-full text-left px-4 py-2 text-sm text-primary-text hover:bg-border transition-colors"
                >
                  {preset.label}
                </button>
              ))}
              
              <hr className="my-1" />
              
              <button
                onClick={() => setShowCustom(true)}
                className="w-full text-left px-4 py-2 text-sm text-primary-text hover:bg-border transition-colors"
              >
                Custom range...
              </button>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              <div>
                <label htmlFor="start-time" className="block text-xs font-medium text-gray-700 mb-1">
                  Start time
                </label>
                <input
                  id="start-time"
                  type="datetime-local"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label htmlFor="end-time" className="block text-xs font-medium text-gray-700 mb-1">
                  End time
                </label>
                <input
                  id="end-time"
                  type="datetime-local"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => {
                    setShowCustom(false);
                    setCustomStart('');
                    setCustomEnd('');
                  }}
                  className="text-xs text-gray-600 hover:text-gray-800"
                >
                  Back
                </button>
                
                <div className="space-x-2">
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      setShowCustom(false);
                    }}
                    className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCustomSubmit}
                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};