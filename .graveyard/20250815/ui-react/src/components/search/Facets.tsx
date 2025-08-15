import React from 'react';
import { ChevronDown, AlertCircle } from 'lucide-react';
import type { FacetBucket } from '@/lib/search';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface FacetsProps {
  facets: Record<string, FacetBucket[]>;
  isLoading?: boolean;
  error?: string;
  onFacetClick: (field: string, value: string) => void;
}

const FACET_LABELS: Record<string, string> = {
  log_source: 'Log Sources',
  user: 'Users',
  src_ip: 'Source IPs',
  severity: 'Severity',
  event_type: 'Event Types',
  host: 'Hosts',
};

export function Facets({ facets, isLoading, error, onFacetClick }: FacetsProps) {
  const [expandedFacets, setExpandedFacets] = React.useState<Set<string>>(
    new Set(['log_source', 'user', 'src_ip'])
  );

  const toggleFacet = (field: string) => {
    const newExpanded = new Set(expandedFacets);
    if (newExpanded.has(field)) {
      newExpanded.delete(field);
    } else {
      newExpanded.add(field);
    }
    setExpandedFacets(newExpanded);
  };

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">Facet service busy</span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i}>
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2 animate-pulse" />
              <div className="space-y-2">
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const facetEntries = Object.entries(facets);
  if (facetEntries.length === 0) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">Refine Results</h3>
      </div>

      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {facetEntries.map(([field, buckets]) => (
          <div key={field} className="p-4">
            <button
              onClick={() => toggleFacet(field)}
              className="flex items-center justify-between w-full text-left"
            >
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {FACET_LABELS[field] || field}
              </span>
              <ChevronDown 
                className={cn(
                  "w-4 h-4 text-gray-500 transition-transform",
                  expandedFacets.has(field) && "transform rotate-180"
                )}
              />
            </button>

            {expandedFacets.has(field) && buckets.length > 0 && (
              <div className="mt-3 space-y-2">
                {buckets.slice(0, 10).map((bucket) => (
                  <button
                    key={bucket.value}
                    onClick={() => onFacetClick(field, bucket.value)}
                    className={cn(
                      "flex items-center justify-between w-full",
                      "px-3 py-2 rounded-md text-sm",
                      "hover:bg-gray-100 dark:hover:bg-gray-700",
                      "transition-colors"
                    )}
                  >
                    <span className="text-gray-700 dark:text-gray-300 truncate" title={bucket.value}>
                      {bucket.value || '(empty)'}
                    </span>
                    <Badge variant="secondary" className="ml-2">
                      {bucket.count.toLocaleString()}
                    </Badge>
                  </button>
                ))}
                
                {buckets.length > 10 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 pl-3">
                    +{buckets.length - 10} more
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
