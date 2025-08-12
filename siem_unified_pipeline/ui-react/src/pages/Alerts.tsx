import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Tag, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { alertsApi } from '@/lib/alerts';
import { parseTimeRange } from '@/lib/search';
import { hasMorePages } from '@/lib/paging';
import { useUrlState } from '@/hooks/useUrlState';
import { AlertsTable } from '@/components/alerts/AlertsTable';
import { AlertFilters } from '@/components/alerts/AlertFilters';
import { AlertDrawer } from '@/components/alerts/AlertDrawer';
import { EmptyState } from '@/components/search/EmptyState';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Alert, AlertStatus, Severity, AlertsListReq, AlertsListRes } from '@/lib/alerts';

const DEFAULT_COLUMNS = ['created_at', 'severity', 'status', 'title', 'rule_id', 'source'];

export function AlertsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // URL state management
  const [urlState, setUrlState] = useUrlState({
    tenant: '',
    range: '24h',
    status: 'OPEN,ACK',
    sev: '',
    rule: '',
    q: '',
    sort: 'created_at',
    dir: 'desc',
    cols: DEFAULT_COLUMNS.join(','),
  });

  // Local state
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [filtersCollapsed, setFiltersCollapsed] = React.useState(false);
  const [cursor, setCursor] = React.useState<string | undefined>();
  const [allAlerts, setAllAlerts] = React.useState<Alert[]>([]);
  const [seenIds] = React.useState<Set<string>>(new Set());
  const [rateLimitedUntil, setRateLimitedUntil] = React.useState<Date | null>(null);
  const [lastFocusedRowId, setLastFocusedRowId] = React.useState<string | null>(null);

  // Parse URL state
  const tenantId = urlState.tenant ? parseInt(urlState.tenant, 10) : 0;
  const statuses = urlState.status ? urlState.status.split(',').filter(s => ['OPEN', 'ACK', 'CLOSED', 'SUPPRESSED'].includes(s)) as AlertStatus[] : ['OPEN', 'ACK'] as AlertStatus[];
  const severities = urlState.sev ? urlState.sev.split(',').filter(s => ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].includes(s)) as Severity[] : [];
  const ruleIds = urlState.rule ? urlState.rule.split(',').filter(Boolean) : [];
  const visibleColumns = urlState.cols ? urlState.cols.split(',') : DEFAULT_COLUMNS;
  const sortColumn = urlState.sort as 'created_at' | 'severity';
  const sortDirection = urlState.dir as 'asc' | 'desc';

  // Get selected alert from URL hash
  const selectedAlertId = location.hash.replace('#alert=', '') || null;

  // Build request
  const request: AlertsListReq = {
    tenant_id: tenantId,
    q: urlState.q,
    statuses: statuses.length > 0 ? statuses : undefined,
    severities: severities.length > 0 ? severities : undefined,
    rule_ids: ruleIds.length > 0 ? ruleIds : undefined,
    time: parseTimeRange(urlState.range),
    limit: 100,
    cursor,
    sort: sortColumn,
    dir: sortDirection,
  };

  // Fetch alerts
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['alerts', tenantId, statuses, severities, ruleIds, urlState.q, urlState.range, sortColumn, sortDirection, cursor],
    queryFn: ({ signal }) => alertsApi.list(request, signal),
    enabled: tenantId > 0 && (!rateLimitedUntil || new Date() > rateLimitedUntil),
    staleTime: 30000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  }) as {
    data: AlertsListRes | undefined;
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
  };

  // Handle data updates
  React.useEffect(() => {
    if (data) {
      if (cursor) {
        // Append to existing alerts for pagination, avoiding duplicates
        const newAlerts = data.data.filter(alert => !seenIds.has(alert.alert_id));
        newAlerts.forEach(alert => seenIds.add(alert.alert_id));
        setAllAlerts(prev => [...prev, ...newAlerts]);
      } else {
        // Replace alerts for new query
        seenIds.clear();
        data.data.forEach(alert => seenIds.add(alert.alert_id));
        setAllAlerts(data.data);
      }
      
      // Emit instrumentation event
      if ((window as any).__ux) {
        (window as any).__ux.emit('alerts:list:loaded', {
          rows: data.data.length,
          took_ms: data.meta.took_ms,
        });
      }
    }
  }, [data, cursor, seenIds]);

  // Status update mutation - currently unused, but will be used for bulk actions
  // const updateStatusMutation = useMutation({
  //   mutationFn: ({ alertId, status }: { alertId: string; status: AlertStatus }) =>
  //     alertsApi.patch(alertId, { status }, tenantId),
  //   onSuccess: () => {
  //     queryClient.invalidateQueries({ queryKey: ['alerts'] });
  //   },
  // });

  // Reset cursor when filters change
  React.useEffect(() => {
    setCursor(undefined);
    setAllAlerts([]);
  }, [urlState.tenant, urlState.range, urlState.status, urlState.sev, urlState.rule, urlState.q, sortColumn, sortDirection]);

  const handleFilterChange = (key: string, value: string) => {
    setUrlState({ [key]: value });
  };

  const handleRowClick = (alert: Alert) => {
    setLastFocusedRowId(alert.alert_id);
    window.location.hash = `alert=${alert.alert_id}`;
  };

  const handleDrawerClose = () => {
    window.location.hash = '';
    // Restore focus to previously focused row
    if (lastFocusedRowId) {
      const rowElement = document.querySelector(`[data-alert-id="${lastFocusedRowId}"]`);
      if (rowElement instanceof HTMLElement) {
        rowElement.focus();
      }
    }
  };

  const handleStatusChange = (alertId: string, newStatus: AlertStatus) => {
    // Optimistically update the alert in the list
    setAllAlerts(prev => prev.map(a => 
      a.alert_id === alertId ? { ...a, status: newStatus } : a
    ));
  };

  const handlePivotToSearch = (alert: Alert) => {
    // Build search query from alert fields
    const searchTerms = [];
    if (alert.alert_key) searchTerms.push(`alert_key:"${alert.alert_key}"`);
    if (alert.rule_id) searchTerms.push(`rule_id:"${alert.rule_id}"`);
    if (alert.user) searchTerms.push(`user:"${alert.user}"`);
    if (alert.src_ip) searchTerms.push(`src_ip:"${alert.src_ip}"`);
    
    navigate(`/search?tenant=${tenantId}&range=24h&q=${encodeURIComponent(searchTerms.join(' AND '))}`);
  };

  const handleLoadMore = () => {
    if (data?.meta.next_cursor) {
      setCursor(data.meta.next_cursor);
    }
  };

  const handleBulkAction = async (action: 'ack' | 'close' | 'tag' | 'export') => {
    if (selectedIds.size === 0) return;

    switch (action) {
      case 'ack':
        // TODO: Implement bulk acknowledge
        console.log('Bulk acknowledge:', Array.from(selectedIds));
        break;
      case 'close':
        // TODO: Implement bulk close
        console.log('Bulk close:', Array.from(selectedIds));
        break;
      case 'tag':
        // TODO: Implement bulk tag
        console.log('Bulk tag:', Array.from(selectedIds));
        break;
      case 'export':
        // TODO: Implement export
        console.log('Export:', Array.from(selectedIds));
        break;
    }
  };

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center h-full">
                  <EmptyState type="no-tenant" />
      </div>
    );
  }

    if (error) {
    // Check for 429 rate limit
    if (error instanceof Error && error.message.includes('429')) {
      const retryAfter = parseInt(error.message.match(/Retry-After: (\d+)/)?.[1] || '60');
      if (!rateLimitedUntil) {
        setRateLimitedUntil(new Date(Date.now() + retryAfter * 1000));
      }
    }
    
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState
          type="error"
          onRetry={refetch}
        />
      </div>
    );
  }

  // Rate limit countdown
  React.useEffect(() => {
    if (!rateLimitedUntil) return;
    
    const interval = setInterval(() => {
      if (new Date() > rateLimitedUntil) {
        setRateLimitedUntil(null);
        refetch();
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [rateLimitedUntil, refetch]);

  const getRateLimitCountdown = () => {
    if (!rateLimitedUntil) return null;
    const seconds = Math.max(0, Math.floor((rateLimitedUntil.getTime() - Date.now()) / 1000));
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

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
        {/* Filters */}
        <AlertFilters
        statuses={statuses}
        severities={severities}
        ruleIds={ruleIds}
        q={urlState.q}
        onStatusesChange={(s: AlertStatus[]) => handleFilterChange('status', s.join(','))}
        onSeveritiesChange={(s: Severity[]) => handleFilterChange('sev', s.join(','))}
        onRuleIdsChange={(r: string[]) => handleFilterChange('rule', r.join(','))}
        onQChange={(q: string) => handleFilterChange('q', q)}
        collapsed={filtersCollapsed}
        onCollapsedChange={setFiltersCollapsed}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Alerts</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {allAlerts.length} alerts{data && ` (${data.meta.took_ms}ms)`}
                </p>
              </div>
              {/* ClickHouse latency indicator */}
              {data && data.meta.took_ms > 1500 && (
                <div className="flex items-center gap-2">
                  <Badge variant="amber" className="text-xs">
                    <Clock className="w-3 h-3 mr-1" />
                    CH: {(data.meta.took_ms / 1000).toFixed(1)}s
                  </Badge>
                  <Tooltip>
                    <TooltipTrigger>
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                    </TooltipTrigger>
                    <TooltipContent>
                      ClickHouse query took longer than expected
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>

            {/* Bulk Actions */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedIds.size} selected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkAction('ack')}
                >
                  Acknowledge
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkAction('close')}
                >
                  Close
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkAction('tag')}
                  disabled
                >
                  <Tag className="w-4 h-4 mr-1" />
                  Tag
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkAction('export')}
                  disabled
                >
                  <Download className="w-4 h-4 mr-1" />
                  Export
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-hidden">
          {allAlerts.length === 0 && !isLoading ? (
            <div className="flex items-center justify-center h-full">
                              <EmptyState
                  type="no-results"
                  onReset={() => {
                    setUrlState({
                      status: 'OPEN,ACK',
                      sev: '',
                      rule: '',
                      q: '',
                    });
                  }}
                />
            </div>
          ) : (
            <AlertsTable
              alerts={allAlerts}
              loading={isLoading && allAlerts.length === 0}
              selectedIds={selectedIds}
              visibleColumns={visibleColumns}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onRowClick={handleRowClick}
              onSelectionChange={setSelectedIds}
              onColumnsChange={(cols: string[]) => handleFilterChange('cols', cols.join(','))}
              onSortChange={(col: 'created_at' | 'severity', dir: 'asc' | 'desc') => {
                setUrlState({ sort: col, dir });
              }}
            />
          )}
        </div>

        {/* Load More */}
        {data && hasMorePages(data.meta) && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 text-center">
            <Button
              variant="outline"
              onClick={handleLoadMore}
              disabled={isLoading}
            >
              {isLoading ? 'Loading...' : 'Load More'}
            </Button>
          </div>
        )}
      </div>

        {/* Drawer */}
        <AlertDrawer
          alertId={selectedAlertId}
          tenantId={tenantId}
          onClose={handleDrawerClose}
          onStatusChange={handleStatusChange}
          onPivotToSearch={handlePivotToSearch}
        />
      </div>
    </div>
  );
}