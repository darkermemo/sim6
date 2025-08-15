'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { searchFacets } from '@/lib/api';
import { 
  Filter, 
  AlertTriangle, 
  Server, 
  Monitor, 
  AppWindow, 
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  X
} from 'lucide-react';

export interface FacetData {
  field: string;
  buckets: Array<{
    key: string;
    doc_count: number;
  }>;
}

interface FacetResponse {
  facets: Record<string, Array<{
    value: string;
    count: number;
  }>>;
}

export interface FacetPanelProps {
  query: string;
  tenantId: string;
  timeRange: number;
  onFacetSelect: (field: string, value: string) => void;
  selectedFacets: Record<string, string[]>;
  onFacetRemove: (field: string, value: string) => void;
  facetsData?: any; // Optional pre-loaded facets data
}

const FACET_CONFIGS = [
  {
    field: 'severity',
    label: 'Severity',
    icon: AlertTriangle,
    color: 'text-red-500',
    size: 8
  },
  {
    field: 'source_type',
    label: 'Source',
    icon: Server,
    color: 'text-blue-500',
    size: 10
  },
  {
    field: 'host',
    label: 'Host',
    icon: Monitor,
    color: 'text-green-500',
    size: 8
  },
  {
    field: 'vendor',
    label: 'Vendor',
    icon: AppWindow,
    color: 'text-purple-500',
    size: 6
  },
  {
    field: 'event_type',
    label: 'Event Type',
    icon: ShieldCheck,
    color: 'text-orange-500',
    size: 8
  }
];

export function FacetPanel({
  query,
  tenantId,
  timeRange,
  onFacetSelect,
  selectedFacets,
  onFacetRemove
}: FacetPanelProps) {
  const [facets, setFacets] = useState<FacetData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedFacets, setExpandedFacets] = useState<Set<string>>(new Set(['severity', 'source_type']));

  // Load facets when query changes
  useEffect(() => {
    const loadFacets = async () => {
      setLoading(true);
      setError(null);

      try {
        const facetQueries = FACET_CONFIGS.map(config => ({
          field: config.field,
          size: config.size
        }));

        const result = await searchFacets(query || '', facetQueries, tenantId);
        // Transform the facets object into an array
        const facetsData: FacetData[] = [];
        if (result.facets && typeof result.facets === 'object') {
          Object.entries(result.facets).forEach(([field, buckets]) => {
            if (Array.isArray(buckets)) {
              facetsData.push({
                field,
                buckets: buckets.map(bucket => ({
                  key: bucket.key || bucket.value || '',
                  doc_count: bucket.count || bucket.doc_count || 0
                }))
              });
            }
          });
        }
        setFacets(facetsData);
      } catch (err) {
        console.error('Facet loading error:', err);
        setError('Failed to load facets');
        setFacets([]);
      } finally {
        setLoading(false);
      }
    };

    loadFacets();
  }, [query, tenantId, timeRange]);

  const toggleFacetExpansion = (field: string) => {
    const newExpanded = new Set(expandedFacets);
    if (newExpanded.has(field)) {
      newExpanded.delete(field);
    } else {
      newExpanded.add(field);
    }
    setExpandedFacets(newExpanded);
  };

  const handleFacetClick = (field: string, value: string) => {
    onFacetSelect(field, value);
  };

  const getSeverityColor = (severity: string) => {
    const sev = severity.toLowerCase();
    if (sev.includes('critical') || sev.includes('fatal')) return 'bg-red-100 text-red-800 border-red-200';
    if (sev.includes('high') || sev.includes('error')) return 'bg-orange-100 text-orange-800 border-orange-200';
    if (sev.includes('medium') || sev.includes('warn')) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (sev.includes('low') || sev.includes('info')) return 'bg-blue-100 text-blue-800 border-blue-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const hasSelectedFacets = Object.keys(selectedFacets).some(field => selectedFacets[field].length > 0);

  return (
    <div className="w-64 space-y-4">
      {/* Selected Facets */}
      {hasSelectedFacets && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Active Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(selectedFacets).map(([field, values]) =>
              values.map(value => (
                <Badge
                  key={`${field}:${value}`}
                  variant="secondary"
                  className="gap-1 justify-between w-full"
                >
                  <span className="truncate">{field}:{value}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onFacetRemove(field, value)}
                    className="h-4 w-4 p-0 hover:bg-transparent"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Facets */}
      {FACET_CONFIGS.map(config => {
        const facetData = Array.isArray(facets) ? facets.find(f => f.field === config.field) : undefined;
        const IconComponent = config.icon;
        const isExpanded = expandedFacets.has(config.field);

        return (
          <Card key={config.field}>
            <CardHeader 
              className="pb-2 cursor-pointer"
              onClick={() => toggleFacetExpansion(config.field)}
            >
              <CardTitle className="text-sm flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <IconComponent className={`h-4 w-4 ${config.color}`} />
                  {config.label}
                </div>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </CardTitle>
            </CardHeader>
            
            {isExpanded && (
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-8" />
                      </div>
                    ))}
                  </div>
                ) : error ? (
                  <p className="text-xs text-red-600">{error}</p>
                ) : facetData?.buckets?.length ? (
                  <div className="space-y-1">
                    {facetData.buckets.map(bucket => {
                      const isSelected = selectedFacets[config.field]?.includes(bucket.key);
                      
                      return (
                        <button
                          key={bucket.key}
                          onClick={() => handleFacetClick(config.field, bucket.key)}
                          className={`w-full flex items-center justify-between p-2 rounded text-xs hover:bg-slate-50 dark:hover:bg-slate-700 ${
                            isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700' : ''
                          }`}
                        >
                          <span className={`truncate ${
                            config.field === 'severity' ? getSeverityColor(bucket.key).split(' ')[1] : ''
                          }`}>
                            {bucket.key}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {bucket.doc_count.toLocaleString()}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No data</p>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}