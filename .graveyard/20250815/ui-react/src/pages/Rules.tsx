import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUrlState } from '@/hooks/useUrlState';
import { RulesList } from '@/components/rules/RulesList';
import { RuleEditor } from '@/components/rules/RuleEditor';
import { RunNowModal } from '@/components/rules/RunNowModal';
import { EmptyState } from '@/components/search/EmptyState';
import { 
  rulesApi, 
  generateIdempotencyKey,
  type Rule, 
  type RuleKind,
  type RulesListReq,
  type CompileRes,
  type DryRunRes,
} from '@/lib/rules';
import { toast } from '@/lib/toast';

export function RulesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  
  // URL state
  const [urlState, setUrlState] = useUrlState({
    tenant: '',
    q: '',
  });

  // Parse URL state
  const tenantId = urlState.tenant ? parseInt(urlState.tenant, 10) : 0;
  const selectedRuleId = location.hash.replace('#rule=', '') || null;


  // Local state
  const [isCreatingNew, setIsCreatingNew] = React.useState(false);
  const [selectedRule, setSelectedRule] = React.useState<Rule | null>(null);
  const [compileResult, setCompileResult] = React.useState<CompileRes | null>(null);
  const [dryRunResult, setDryRunResult] = React.useState<DryRunRes | null>(null);
  const [showRunNowModal, setShowRunNowModal] = React.useState(false);
  const [cursor, setCursor] = React.useState<string | undefined>();
  const [allRules, setAllRules] = React.useState<Rule[]>([]);
  const [seenIds] = React.useState<Set<string>>(new Set());
  const [rateLimitedUntil, setRateLimitedUntil] = React.useState<Date | null>(null);

  // Build request
  const request: RulesListReq = {
    tenant_id: tenantId,
    q: urlState.q,
    limit: 100,
    cursor,
    sort: 'updated_at',
    dir: 'desc',
  };

  // Fetch rules list
  const { data: rulesData, isLoading: loadingList, error: listError, refetch: refetchList } = useQuery({
    queryKey: ['rules', tenantId, urlState.q, cursor, request.sort, request.dir],
    queryFn: ({ signal }) => rulesApi.list(request, signal),
    enabled: tenantId > 0 && (!rateLimitedUntil || new Date() > rateLimitedUntil),
    staleTime: 30000,
    gcTime: 5 * 60 * 1000,
  });

  // Append rules on data change
  React.useEffect(() => {
    if (rulesData) {
      if (cursor) {
        // Append only new rules (deduplication)
        const newRules = rulesData.data.filter(rule => !seenIds.has(rule.rule_id));
        newRules.forEach(rule => seenIds.add(rule.rule_id));
        setAllRules(prev => [...prev, ...newRules]);
      } else {
        // Reset for new query
        seenIds.clear();
        rulesData.data.forEach(rule => seenIds.add(rule.rule_id));
        setAllRules(rulesData.data);
      }
    }
  }, [rulesData, cursor, seenIds]);

  // Handle 429 rate limiting
  React.useEffect(() => {
    if (listError instanceof Error && listError.message.includes('429')) {
      const retryAfter = parseInt(listError.message.match(/Retry-After: (\d+)/)?.[1] || '60');
      setRateLimitedUntil(new Date(Date.now() + retryAfter * 1000));
    }
  }, [listError]);

  // Rate limit countdown
  React.useEffect(() => {
    if (!rateLimitedUntil) return;
    
    const interval = setInterval(() => {
      if (new Date() > rateLimitedUntil) {
        setRateLimitedUntil(null);
        refetchList();
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [rateLimitedUntil, refetchList]);

  // Fetch selected rule details
  const { data: ruleDetails } = useQuery({
    queryKey: ['rule', selectedRuleId, tenantId],
    queryFn: ({ signal }) => selectedRuleId ? rulesApi.get(selectedRuleId, tenantId, signal) : null,
    enabled: !!selectedRuleId && tenantId > 0,
  });

  // Update selected rule when details load
  React.useEffect(() => {
    if (ruleDetails) {
      setSelectedRule(ruleDetails);
      setIsCreatingNew(false);
    }
  }, [ruleDetails]);

  // Create rule mutation
  const createMutation = useMutation({
    mutationFn: (rule: Omit<Rule, 'rule_id'>) => rulesApi.create(rule, tenantId),
    onSuccess: (newRule) => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      setIsCreatingNew(false);
      navigate(`#rule=${newRule.rule_id}`);
      // Emit instrumentation
      if ((window as any).__ux) {
        (window as any).__ux.emit('rules:save', { ok: true });
      }
    },
    onError: () => {
      if ((window as any).__ux) {
        (window as any).__ux.emit('rules:save', { ok: false });
      }
    },
  });

  // Update rule mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, rule }: { id: string; rule: Partial<Rule> }) => 
      rulesApi.update(id, rule, tenantId),
    onSuccess: (updatedRule) => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      queryClient.invalidateQueries({ queryKey: ['rule', updatedRule.rule_id] });
      setSelectedRule(updatedRule);
      // Emit instrumentation
      if ((window as any).__ux) {
        (window as any).__ux.emit('rules:save', { ok: true });
      }
    },
    onError: (error: any) => {
      if (error.message?.includes('409')) {
        // Handle conflict - refetch rule
        queryClient.invalidateQueries({ queryKey: ['rule', selectedRule?.rule_id] });
        
        // Refetch the latest data
        if (selectedRule) {
          rulesApi.get(selectedRule.rule_id, tenantId)
            .then((data) => {
              setSelectedRule(data);
              toast.show('Updated elsewhere. Refreshed.', 'info', 3000);
            })
            .catch(console.error);
        }
      }
      if ((window as any).__ux) {
        (window as any).__ux.emit('rules:save', { ok: false });
      }
    },
  });

  // Delete rule mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => rulesApi.delete(id, tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      navigate('#');
      setSelectedRule(null);
    },
  });

  // Compile mutation
  const compileMutation = useMutation({
    mutationFn: (req: { kind: RuleKind; content: string }) => 
      rulesApi.compile({
        tenant_id: tenantId,
        kind: req.kind,
        dsl: req.kind === 'NATIVE' ? req.content : undefined,
        sigma_yaml: req.kind === 'SIGMA' ? req.content : undefined,
      }),
    onSuccess: (result) => {
      setCompileResult(result);
      // Emit instrumentation
      if ((window as any).__ux) {
        (window as any).__ux.emit('rules:compile', { 
          ok: result.ok,
          took_ms: 0, // TODO: Add timing
          error_count: result.errors?.length || 0,
        });
      }
    },
  });

  // Dry run mutation
  const dryRunMutation = useMutation({
    mutationFn: ({ id, timeRange, limit }: { id: string; timeRange: number; limit: number }) =>
      rulesApi.dryRun(id, {
        tenant_id: tenantId,
        last_seconds: timeRange,
        limit,
      }),
    onSuccess: (result) => {
      setDryRunResult(result);
      // Emit instrumentation
      if ((window as any).__ux) {
        (window as any).__ux.emit('rules:dryrun', {
          rows: result.rows,
          took_ms: result.took_ms,
        });
      }
    },
  });

  // Run now mutation
  const runNowMutation = useMutation({
    mutationFn: (id: string) =>
      rulesApi.runNow(id, {
        tenant_id: tenantId,
        idempotency_key: generateIdempotencyKey(),
      }),
    onSuccess: (result) => {
      setShowRunNowModal(false);
      // TODO: Show success toast
      // Emit instrumentation
      if ((window as any).__ux) {
        (window as any).__ux.emit('rules:runnow', {
          ok: true,
          replay: result.replayed,
        });
      }
    },
    onError: (error: any) => {
      if ((window as any).__ux) {
        (window as any).__ux.emit('rules:runnow', {
          ok: false,
          conflict: error.message?.includes('409'),
        });
      }
    },
  });

  // Handlers
  const handleRuleSelect = (rule: Rule) => {
    setSelectedRule(rule);
    setIsCreatingNew(false);
    navigate(`#rule=${rule.rule_id}`);
    setCompileResult(null);
    setDryRunResult(null);
  };

  const handleCreateNew = () => {
    setIsCreatingNew(true);
    setSelectedRule(null);
    navigate('#');
    setCompileResult(null);
    setDryRunResult(null);
  };

  const handleSave = (ruleData: Partial<Rule>) => {
    if (isCreatingNew) {
      createMutation.mutate(ruleData as Omit<Rule, 'rule_id'>);
    } else if (selectedRule) {
      updateMutation.mutate({ id: selectedRule.rule_id, rule: ruleData });
    }
  };

  const handleDelete = () => {
    if (selectedRule && window.confirm('Are you sure you want to delete this rule?')) {
      deleteMutation.mutate(selectedRule.rule_id);
    }
  };

  const handleCompile = (kind: RuleKind, content: string) => {
    compileMutation.mutate({ kind, content });
  };

  const handleDryRun = (timeRange: number, limit: number) => {
    if (selectedRule) {
      dryRunMutation.mutate({ id: selectedRule.rule_id, timeRange, limit });
    }
  };

  const handleRunNow = () => {
    setShowRunNowModal(true);
  };

  const handleConfirmRunNow = () => {
    if (selectedRule) {
      runNowMutation.mutate(selectedRule.rule_id);
    }
  };

  const handleEnableToggle = (enabled: boolean) => {
    if (selectedRule) {
      updateMutation.mutate({ 
        id: selectedRule.rule_id, 
        rule: { enabled } 
      });
    }
  };

  const handleLoadMore = () => {
    if (rulesData?.meta.next_cursor) {
      setCursor(rulesData.meta.next_cursor);
    }
  };

  const getRateLimitCountdown = () => {
    if (!rateLimitedUntil) return null;
    const seconds = Math.max(0, Math.floor((rateLimitedUntil.getTime() - Date.now()) / 1000));
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getWatermarkWindow = () => {
    const now = new Date();
    const watermarkSec = selectedRule?.watermark_sec || 120;
    const nowMinus120s = new Date(now.getTime() - 120 * 1000);
    
    // TODO: Get actual watermark from backend
    // For now, simulate a watermark based on rule's watermark_sec
    const watermark = new Date(nowMinus120s.getTime() - (watermarkSec * 1000));
    
    // Ensure window is valid (upper > watermark)
    if (nowMinus120s <= watermark) {
      return null;
    }
    
    return {
      from: watermark,
      to: nowMinus120s,
    };
  };

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState
          type="no-tenant"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Rate limit banner */}
      {rateLimitedUntil && (
        <div className="bg-amber-100 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2 flex items-center justify-between">
          <span className="text-amber-800 dark:text-amber-200">
            Rate limited. Retrying in {getRateLimitCountdown()}
          </span>
        </div>
      )}
      
      <div className="flex h-full">
        {/* Rules List */}
        <RulesList
        rules={allRules}
        loading={loadingList}
        selectedRuleId={selectedRuleId}
        searchQuery={urlState.q}
        onSearchChange={(q) => setUrlState({ q })}
        onRuleSelect={handleRuleSelect}
        onCreateNew={handleCreateNew}
        onLoadMore={handleLoadMore}
        hasMore={!!rulesData?.meta.next_cursor}
      />

      {/* Rule Editor */}
      {(selectedRule || isCreatingNew) && (
        <RuleEditor
          rule={isCreatingNew ? null : selectedRule}
          isNew={isCreatingNew}
          compileResult={compileResult}
          dryRunResult={dryRunResult}
          saving={createMutation.isPending || updateMutation.isPending}
          compiling={compileMutation.isPending}
          dryRunning={dryRunMutation.isPending}
          onSave={handleSave}
          onDelete={isCreatingNew ? undefined : handleDelete}
          onCompile={handleCompile}
          onDryRun={handleDryRun}
          onRunNow={isCreatingNew ? undefined : handleRunNow}
          onEnableToggle={isCreatingNew ? undefined : handleEnableToggle}
        />
      )}

      {/* Empty state when no rule selected */}
      {!selectedRule && !isCreatingNew && (
        <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="text-center">
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Select a rule to edit or create a new one
            </p>
            <Button onClick={handleCreateNew}>
              Create New Rule
            </Button>
          </div>
        </div>
      )}

      {/* Run Now Modal */}
      {selectedRule && (
        <RunNowModal
          open={showRunNowModal}
          onClose={() => setShowRunNowModal(false)}
          onConfirm={handleConfirmRunNow}
          ruleId={selectedRule.rule_id}
          ruleName={selectedRule.name}
          watermarkWindow={getWatermarkWindow() || undefined}
          loading={runNowMutation.isPending}
        />
      )}
      </div>
    </div>
  );
}

// Need to import Button
import { Button } from '@/components/ui/button';
