import { useState, useMemo } from 'react';
import { Plus, Search, Filter, Edit3, Trash2, Eye } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Switch } from '@/components/ui/Switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { useRules, useToggleRule, useDeleteRule } from '@/hooks/api/useRules';
import { useUiStore } from '@/stores/uiStore';
import { useToast } from '@/hooks/useToast';
import { stopPropagation } from '@/lib/dom';
import type { Rule, RuleFilters } from '@/types/api';

export function Rules() {
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const { toast } = useToast();
  const { openRuleDrawer } = useUiStore();
  const { toggleRule, isLoading: isToggling } = useToggleRule();
  const { deleteRule, isLoading: isDeleting } = useDeleteRule();

  // Convert filters to API format
  const apiFilters = useMemo<RuleFilters>(() => {
    const filters: RuleFilters = {
      page: currentPage,
      limit: 20,
    };

    if (searchQuery.trim()) {
      filters.search = searchQuery.trim();
    }

    if (statusFilter === 'active') {
      filters.is_active = true;
    } else if (statusFilter === 'inactive') {
      filters.is_active = false;
    }

    return filters;
  }, [searchQuery, statusFilter, currentPage]);

  // Fetch rules
  const { rules, total, isLoading, error, refresh } = useRules(apiFilters);

  // Handle rule toggle
  const handleToggleRule = async (ruleId: string, currentStatus: boolean) => {
    try {
      await toggleRule(ruleId, !currentStatus);
      await refresh();
      toast({
        title: 'Rule Updated',
        description: `Rule ${!currentStatus ? 'enabled' : 'disabled'} successfully`,
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'Toggle Failed',
        description: 'Failed to update rule status',
        variant: 'destructive',
      });
    }
  };

  // Handle rule deletion
  const handleDeleteRule = async (ruleId: string, ruleName: string) => {
    if (window.confirm(`Are you sure you want to delete rule "${ruleName}"? This action cannot be undone.`)) {
      try {
        await deleteRule(ruleId);
        await refresh();
        toast({
          title: 'Rule Deleted',
          description: `Rule "${ruleName}" deleted successfully`,
          variant: 'success',
        });
      } catch (error) {
        toast({
          title: 'Deletion Failed',
          description: 'Failed to delete rule',
          variant: 'destructive',
        });
      }
    }
  };

  // Handle rule editing
  const handleEditRule = (ruleId: string) => {
    // Find the rule to edit
    const ruleToEdit = rules?.find(rule => rule.id === ruleId);
    if (!ruleToEdit) {
      toast({
        title: 'Error',
        description: 'Rule not found',
        variant: 'destructive',
      });
      return;
    }
    
    // Open the rule drawer for editing
    openRuleDrawer(ruleToEdit.id);
    // Store the rule data for editing
    // The drawer will handle the editing interface
    toast({
      title: 'Edit Rule',
      description: `Editing rule: ${ruleToEdit.name}`,
      variant: 'default',
    });
  };

  // Handle row click
  const handleRowClick = (ruleId: string) => {
    openRuleDrawer(ruleId);
  };

  // Helper functions
  const getStatusBadge = (isActive: boolean) => {
    return isActive ? 'success' : 'warning';
  };

  const formatTimestamp = (timestamp: string | number) => {
    // Handle both string ISO dates and numeric timestamps
    const date = typeof timestamp === 'string' 
      ? new Date(timestamp) 
      : new Date(timestamp * 1000);
    
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary-text">Detection Rules</h1>
            <p className="text-secondary-text">
              Manage detection rules for threat identification and analysis
            </p>
          </div>
          <Button
            onClick={() => openRuleDrawer('new')}
            className="flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Create Rule</span>
          </Button>
        </div>

        {/* Filters */}
        <Card title="Filters" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <label htmlFor="rules-search" className="sr-only">Search rules</label>
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-secondary-text" />
              <input
                id="rules-search"
                type="text"
                placeholder="Search rules..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 border border-border rounded-md bg-background text-primary-text placeholder-secondary-text focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Status Filter */}
            <div>
              <label htmlFor="status-filter" className="sr-only">Filter by status</label>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Results count */}
            <div className="flex items-center text-sm text-secondary-text">
              <Filter className="h-4 w-4 mr-2" />
              {total} rule{total !== 1 ? 's' : ''}
            </div>
          </div>
        </Card>

        {/* Rules Table */}
        <Card title="Rules" className="overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <p className="mt-2 text-secondary-text">Loading rules...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-red-500">Failed to load rules</p>
              <Button onClick={() => refresh()} className="mt-2">
                Retry
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-sm font-medium text-secondary-text">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-secondary-text">
                      Rule Name
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-secondary-text">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-secondary-text">
                      Created
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-secondary-text">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rules.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 px-4 text-center text-secondary-text">
                        No rules found
                      </td>
                    </tr>
                  ) : (
                    rules.map((rule: Rule) => (
                      <tr 
                        key={rule.id} 
                        className="border-b border-border hover:bg-card/50 transition-colors cursor-pointer"
                        onClick={() => handleRowClick(rule.id)}
                      >
                        {/* Status Column */}
                        <td className="py-3 px-4">
                          <div 
                            className="flex items-center space-x-2" 
                            onClick={stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                              }
                            }}
                            role="button"
                            tabIndex={0}
                            aria-label="Rule status controls"
                          >
                            <Switch
                              checked={rule.enabled}
                              onChange={() => handleToggleRule(rule.id, rule.enabled)}
                              disabled={isToggling}
                              size="sm"
                            />
                            <Badge variant={getStatusBadge(rule.enabled)}>
                              {rule.enabled ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        </td>

                        {/* Rule Name Column */}
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-medium text-primary-text">{rule.name}</p>
                            <p className="text-sm text-secondary-text truncate max-w-xs">
                              {rule.description}
                            </p>
                          </div>
                        </td>

                        {/* Stateful Column */}
                        <td className="py-3 px-4">
                          <Badge variant={rule.enabled ? 'default' : 'secondary'}>
                            {rule.enabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </td>

                        {/* Created Column */}
                        <td className="py-3 px-4 text-sm text-secondary-text font-mono">
                          {formatTimestamp(rule.createdAt)}
                        </td>

                        {/* Actions Column */}
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={stopPropagation(() => openRuleDrawer(rule.id))}
                              className="flex items-center space-x-1"
                            >
                              <Eye className="h-3 w-3" />
                              <span>View</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={stopPropagation(() => handleEditRule(rule.id))}
                              className="flex items-center space-x-1"
                            >
                              <Edit3 className="h-3 w-3" />
                              <span>Edit</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={stopPropagation(() => handleDeleteRule(rule.id, rule.name))}
                              disabled={isDeleting}
                              className="flex items-center space-x-1 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Delete</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-border">
              <div className="text-sm text-secondary-text">
                Page {currentPage} of {totalPages} ({total} total rules)
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage <= 1 || isLoading}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage >= totalPages || isLoading}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}