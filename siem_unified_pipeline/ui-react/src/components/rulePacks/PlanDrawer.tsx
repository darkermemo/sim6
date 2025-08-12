import React from 'react';
import { X, RefreshCw, AlertTriangle, XCircle, SkipForward, Plus, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

import { Alert, AlertDescription } from '@/components/ui/alert';

import { getActionColor } from '@/lib/rulePacks';
import type { RulePack, PlanResponse, PlanEntry } from '@/lib/rulePacks';

interface PlanDrawerProps {
  pack: RulePack;
  plan: PlanResponse | null;
  isLoading: boolean;
  onClose: () => void;
  onApply: () => void;
  onRefresh: (strategy: 'safe' | 'force', matchBy: 'rule_id' | 'name') => void;
}

export function PlanDrawer({ pack, plan, isLoading, onClose, onApply, onRefresh }: PlanDrawerProps) {
  const [filter, setFilter] = React.useState<'all' | PlanEntry['action']>('all');
  
  const filteredEntries = React.useMemo(() => {
    if (!plan || filter === 'all') return plan?.entries || [];
    return plan.entries.filter(entry => entry.action === filter);
  }, [plan, filter]);
  
  const hasWarnings = plan?.entries.some(e => e.warnings.length > 0);
  const hasCompileErrors = plan?.entries.some(e => 
    e.warnings.some(w => w.includes('Compilation failed'))
  );
  
  return (
    <div className="fixed inset-y-0 right-0 w-[600px] bg-white dark:bg-gray-900 shadow-xl border-l border-gray-200 dark:border-gray-700 flex flex-col z-50">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Deployment Plan
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {pack.name} v{pack.version}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : plan ? (
          <>
            {/* Summary */}
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-semibold text-green-600 dark:text-green-400">
                    {plan.totals.create}
                  </div>
                  <p className="text-sm text-gray-500">Create</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-semibold text-blue-600 dark:text-blue-400">
                    {plan.totals.update}
                  </div>
                  <p className="text-sm text-gray-500">Update</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-semibold text-red-600 dark:text-red-400">
                    {plan.totals.disable}
                  </div>
                  <p className="text-sm text-gray-500">Disable</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-semibold text-gray-600 dark:text-gray-400">
                    {plan.totals.skip}
                  </div>
                  <p className="text-sm text-gray-500">Skip</p>
                </div>
              </div>
              
              {/* Warnings */}
              {hasWarnings && (
                <Alert variant={hasCompileErrors ? 'destructive' : 'warning'}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {hasCompileErrors
                      ? 'Some rules have compilation errors and cannot be deployed.'
                      : 'Some rules have warnings. Review before applying.'}
                  </AlertDescription>
                </Alert>
              )}
            </div>
            
            {/* Filters */}
            <div className="px-6 pb-4">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={filter === 'all' ? 'default' : 'outline'}
                  onClick={() => setFilter('all')}
                >
                  All ({plan.entries.length})
                </Button>
                <Button
                  size="sm"
                  variant={filter === 'CREATE' ? 'default' : 'outline'}
                  onClick={() => setFilter('CREATE')}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Create ({plan.totals.create})
                </Button>
                <Button
                  size="sm"
                  variant={filter === 'UPDATE' ? 'default' : 'outline'}
                  onClick={() => setFilter('UPDATE')}
                >
                  <Edit className="w-3 h-3 mr-1" />
                  Update ({plan.totals.update})
                </Button>
                <Button
                  size="sm"
                  variant={filter === 'DISABLE' ? 'default' : 'outline'}
                  onClick={() => setFilter('DISABLE')}
                >
                  <XCircle className="w-3 h-3 mr-1" />
                  Disable ({plan.totals.disable})
                </Button>
                <Button
                  size="sm"
                  variant={filter === 'SKIP' ? 'default' : 'outline'}
                  onClick={() => setFilter('SKIP')}
                >
                  <SkipForward className="w-3 h-3 mr-1" />
                  Skip ({plan.totals.skip})
                </Button>
              </div>
            </div>
            
            {/* Rules List */}
            <div className="border-t border-gray-200 dark:border-gray-700">
              {filteredEntries.map((entry, idx) => (
                <div
                  key={idx}
                  className="px-6 py-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={getActionColor(entry.action) as any}>
                          {entry.action}
                        </Badge>
                        <span className="font-medium text-sm">{entry.name}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">
                        {entry.rule_id}
                      </p>
                      {entry.warnings.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {entry.warnings.map((warning, i) => (
                            <div key={i} className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                              <AlertTriangle className="w-3 h-3" />
                              {warning}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {(entry.from_sha || entry.to_sha) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {/* TODO: Show diff */}}
                      >
                        Diff
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="p-6">
            <Alert>
              <AlertDescription>
                No plan generated yet. Click refresh to create a deployment plan.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </div>
      
      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRefresh('safe', 'rule_id')}
              disabled={isLoading}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh (Safe)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRefresh('force', 'rule_id')}
              disabled={isLoading}
            >
              Force Plan
            </Button>
          </div>
          <Button
            onClick={onApply}
            disabled={!plan || hasCompileErrors}
          >
            Apply Plan
          </Button>
        </div>
      </div>
    </div>
  );
}
