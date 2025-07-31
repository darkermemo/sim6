import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { X, Plus, Filter } from 'lucide-react';
import { EventSearchRequest, EventFilter, TimeRange } from '../types/events';
import { useEventsStore } from '../stores/eventsStore';
import { clickhouseSearchApi } from '../services/clickhouseSearchApi';

interface AdvancedFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FilterField {
  field: string;
  operator: string;
  value: string;
}

const FILTER_FIELDS = [
  'source_ip',
  'destination_ip',
  'source_type',
  'event_category',
  'event_action',
  'event_outcome',
  'tenant_id',
  'parser',
  'severity',
  'user_name',
  'process_name',
  'file_path'
];

const FILTER_OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'ends_with', label: 'Ends with' },
  { value: 'regex', label: 'Regex' },
  { value: 'not_equals', label: 'Not equals' },
  { value: 'greater_than', label: 'Greater than' },
  { value: 'less_than', label: 'Less than' }
];

const SEVERITY_OPTIONS = [
  'low',
  'medium',
  'high',
  'critical'
];

const PARSER_OPTIONS = [
  'json',
  'syslog',
  'windows',
  'linux',
  'firewall',
  'custom'
];

export const AdvancedFilterModal: React.FC<AdvancedFilterModalProps> = ({
  isOpen,
  onClose
}) => {
  const { setFilters, setLoading, setError, replaceEvents } = useEventsStore();
  
  const [timeRange, setTimeRange] = useState<TimeRange>({
    start_unix: Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000), // Last 24 hours
    end_unix: Math.floor(Date.now() / 1000)
  });
  
  const [filterFields, setFilterFields] = useState<FilterField[]>([
    { field: '', operator: 'equals', value: '' }
  ]);
  
  const [freeText, setFreeText] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeRange({
        start_unix: Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000),
        end_unix: Math.floor(Date.now() / 1000)
      });
      setFilterFields([{ field: '', operator: 'equals', value: '' }]);
      setFreeText('');
    }
  }, [isOpen]);

  const addFilterField = () => {
    setFilterFields([...filterFields, { field: '', operator: 'equals', value: '' }]);
  };

  const removeFilterField = (index: number) => {
    if (filterFields.length > 1) {
      setFilterFields(filterFields.filter((_, i) => i !== index));
    }
  };

  const updateFilterField = (index: number, updates: Partial<FilterField>) => {
    const updated = filterFields.map((field, i) => 
      i === index ? { ...field, ...updates } : field
    );
    setFilterFields(updated);
  };

  const handleApply = async () => {
    setIsApplying(true);
    setError(null);
    
    try {
      // Build filters from form
      const filters: EventFilter[] = filterFields
        .filter(f => f.field && f.value)
        .map(f => ({
          field: f.field,
          operator: f.operator as any,
          value: f.value
        }));

      // Build search request for ClickHouse API
      const searchRequest = {
        tenant_id: 'default', // TODO: Get from auth context
        query: freeText || undefined,
        time_range: {
          start: new Date(timeRange.start_unix * 1000).toISOString(),
          end: new Date(timeRange.end_unix * 1000).toISOString(),
        },
        filters: filters.map(filter => ({
          field: filter.field,
          operator: filter.operator as any,
          value: filter.value,
        })),
        sorting: [{
          field: 'event_timestamp',
          direction: 'desc' as const,
        }],
        fields: ['*'], // Get all fields
        aggregations: [], // No aggregations for now
        options: {
          max_results: 1000,
          include_raw_event: true,
        },
      };

      // Update store with new filters (convert back to EventSearchRequest format)
      const eventSearchRequest: EventSearchRequest = {
        time_range: timeRange,
        filters,
        free_text: freeText || undefined,
        sort: {
          field: 'event_timestamp',
          direction: 'desc'
        },
        limit: 1000,
        offset: 0
      };
      setFilters(eventSearchRequest);
      setLoading(true);

      // Call search API
      const response = await clickhouseSearchApi.search(searchRequest);
      
      // Convert search events to UI events format
      const convertedEvents = response.hits.map(searchEvent => ({
        event_id: searchEvent.event_id,
        tenant_id: searchEvent.metadata?.tenant_id || 'default',
        event_timestamp: new Date(searchEvent.event_timestamp).getTime() / 1000,
        source_ip: searchEvent.source_ip || '',
        source_type: searchEvent.metadata?.source_type || 'unknown',
        source_name: searchEvent.metadata?.source_name || 'unknown',
        raw_event: JSON.stringify(searchEvent.raw_event || searchEvent),
        event_category: searchEvent.event_category || 'unknown',
        event_outcome: searchEvent.event_outcome || 'unknown',
        event_action: searchEvent.event_action || 'unknown',
        is_threat: searchEvent.severity === 'critical' || searchEvent.severity === 'high' ? 1 : 0,
      }));
      
      // Replace events in store
      replaceEvents(convertedEvents);
      
      onClose();
    } catch (error) {
      console.error('Search failed:', error);
      setError(error instanceof Error ? error.message : 'Search failed');
    } finally {
      setIsApplying(false);
      setLoading(false);
    }
  };

  const handleReset = () => {
    setTimeRange({
      start_unix: Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000),
      end_unix: Math.floor(Date.now() / 1000)
    });
    setFilterFields([{ field: '', operator: 'equals', value: '' }]);
    setFreeText('');
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="max-w-4xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center space-x-2">
            <Filter className="w-5 h-5" />
            <span>Advanced Event Filters</span>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Time Range */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Time Range</label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500">Start Time</label>
                <Input
                  type="datetime-local"
                  value={new Date(timeRange.start_unix * 1000).toISOString().slice(0, 16)}
                  onChange={(e) => setTimeRange(prev => ({
                    ...prev,
                    start_unix: Math.floor(new Date(e.target.value).getTime() / 1000)
                  }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">End Time</label>
                <Input
                  type="datetime-local"
                  value={new Date(timeRange.end_unix * 1000).toISOString().slice(0, 16)}
                  onChange={(e) => setTimeRange(prev => ({
                    ...prev,
                    end_unix: Math.floor(new Date(e.target.value).getTime() / 1000)
                  }))}
                />
              </div>
            </div>
          </div>

          {/* Free Text Search */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Free Text Search</label>
            <Input
              placeholder="Search across all fields..."
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
            />
          </div>

          {/* Field Filters */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Field Filters</label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addFilterField}
                className="flex items-center space-x-1"
              >
                <Plus className="w-4 h-4" />
                <span>Add Filter</span>
              </Button>
            </div>
            
            <div className="space-y-3">
              {filterFields.map((filter, index) => (
                <div key={index} className="flex items-center space-x-2 p-3 border rounded-lg">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    {/* Field Selection */}
                    <Select
                      value={filter.field}
                      onValueChange={(value) => updateFilterField(index, { field: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent>
                        {FILTER_FIELDS.map(field => (
                          <SelectItem key={field} value={field}>
                            {field.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Operator Selection */}
                    <Select
                      value={filter.operator}
                      onValueChange={(value) => updateFilterField(index, { operator: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FILTER_OPERATORS.map(op => (
                          <SelectItem key={op.value} value={op.value}>
                            {op.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Value Input */}
                    {filter.field === 'severity' ? (
                      <Select
                        value={filter.value}
                        onValueChange={(value) => updateFilterField(index, { value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select severity" />
                        </SelectTrigger>
                        <SelectContent>
                          {SEVERITY_OPTIONS.map(severity => (
                            <SelectItem key={severity} value={severity}>
                              <Badge variant={severity === 'critical' ? 'critical' : severity === 'high' ? 'high' : severity === 'medium' ? 'medium' : severity === 'low' ? 'low' : 'info'}>
                                {severity.toUpperCase()}
                              </Badge>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : filter.field === 'parser' ? (
                      <Select
                        value={filter.value}
                        onValueChange={(value) => updateFilterField(index, { value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select parser" />
                        </SelectTrigger>
                        <SelectContent>
                          {PARSER_OPTIONS.map(parser => (
                            <SelectItem key={parser} value={parser}>
                              {parser.toUpperCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        placeholder="Enter value"
                        value={filter.value}
                        onChange={(e) => updateFilterField(index, { value: e.target.value })}
                      />
                    )}
                  </div>

                  {/* Remove Button */}
                  {filterFields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFilterField(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-between mt-6 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
          >
            Reset
          </Button>
          
          <div className="flex space-x-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleApply}
              disabled={isApplying}
            >
              {isApplying ? 'Applying...' : 'Apply Filters'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AdvancedFilterModal;