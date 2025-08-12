import React from 'react';
import { Search, Filter, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/alerts';
import type { Rule } from '@/lib/rules';

interface RulesListProps {
  rules: Rule[];
  loading: boolean;
  selectedRuleId?: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onRuleSelect: (rule: Rule) => void;
  onCreateNew: () => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

export function RulesList({
  rules,
  loading,
  selectedRuleId,
  searchQuery,
  onSearchChange,
  onRuleSelect,
  onCreateNew,
  onLoadMore,
  hasMore,
}: RulesListProps) {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'red';
      case 'HIGH': return 'orange';
      case 'MEDIUM': return 'yellow';
      case 'LOW': return 'blue';
      case 'INFO': return 'gray';
      default: return 'gray';
    }
  };

  return (
    <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Rules</h2>
          <Button
            size="sm"
            onClick={onCreateNew}
            className="gap-1"
          >
            <Plus className="w-4 h-4" />
            New
          </Button>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search rules..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 text-sm"
          />
        </div>
        
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Use name:, tags:, enabled:, kind:
        </p>
      </div>

      {/* Rules List */}
      <div className="flex-1 overflow-y-auto">
        {loading && rules.length === 0 ? (
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <Filter className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No rules found</p>
            <Button
              variant="link"
              size="sm"
              onClick={onCreateNew}
              className="mt-2"
            >
              Create your first rule
            </Button>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {rules.map((rule) => (
                <button
                  key={rule.rule_id}
                  onClick={() => onRuleSelect(rule)}
                  className={cn(
                    "w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors",
                    selectedRuleId === rule.rule_id && "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500"
                  )}
                >
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium text-gray-900 dark:text-white text-sm truncate">
                        {rule.name}
                      </h3>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Badge 
                          variant={getSeverityColor(rule.severity) as any} 
                          className="text-xs"
                        >
                          {rule.severity}
                        </Badge>
                        {!rule.enabled && (
                          <Badge variant="outline" className="text-xs">
                            Disabled
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    {rule.description && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                        {rule.description}
                      </p>
                    )}
                    
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>{rule.kind}</span>
                      {rule.updated_at && (
                        <>
                          <span>•</span>
                          <span>{formatRelativeTime(rule.updated_at)}</span>
                        </>
                      )}
                    </div>
                    
                    {rule.tags && rule.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {rule.tags.slice(0, 3).map((tag) => (
                          <Badge 
                            key={tag} 
                            variant="outline" 
                            className="text-xs py-0 px-1"
                          >
                            {tag}
                          </Badge>
                        ))}
                        {rule.tags.length > 3 && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            +{rule.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
            
            {/* Load More */}
            {hasMore && onLoadMore && (
              <div className="p-4 text-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onLoadMore}
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Load More'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
