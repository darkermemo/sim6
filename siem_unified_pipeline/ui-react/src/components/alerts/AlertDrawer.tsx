import React, { useState, useEffect } from 'react';
import { X, Clock, AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { InlineKeyValue } from '@/components/common/InlineKeyValue';
import { CopyButton } from '@/components/common/CopyButton';
import { Notes } from './Notes';
import { cn } from '@/lib/utils';
import { alertsApi, getSeverityColor, getStatusColor } from '@/lib/alerts';
import { useQueryClient } from '@tanstack/react-query';
import { RunNowModal } from '@/components/rules/RunNowModal';
import type { Alert, AlertNote, AlertStatus, Severity } from '@/lib/alerts';
import { toast } from '@/lib/toast';

interface AlertDrawerProps {
  alertId: string | null;
  tenantId: number;
  onClose: () => void;
  onStatusChange?: (alertId: string, newStatus: AlertStatus) => void;
  onPivotToSearch?: (alert: Alert) => void;
}

type Tab = 'summary' | 'evidence' | 'notes' | 'actions';

export function AlertDrawer({
  alertId,
  tenantId,
  onClose,
  onStatusChange,
  onPivotToSearch,
}: AlertDrawerProps) {
  const queryClient = useQueryClient();
  const [alert, setAlert] = React.useState<Alert | null>(null);
  const [notes, setNotes] = React.useState<AlertNote[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<Tab>('summary');
  const [updating, setUpdating] = React.useState(false);
  const [showRunNowModal, setShowRunNowModal] = React.useState(false);

  useEffect(() => {
    if (alertId && tenantId) {
      const fetchAlert = async () => {
        try {
          setLoading(true);
          const data = await alertsApi.get(alertId, tenantId);
          setAlert(data);
          setNotes(data.notes || []);
        } catch (error) {
          // Handle error silently
        } finally {
          setLoading(false);
        }
      };
      fetchAlert();
    }
  }, [alertId, tenantId]);

  const handleStatusChange = async (newStatus: AlertStatus) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/v2/alerts/${alertId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        setAlert(prev => prev ? { ...prev, status: newStatus } : null);
        toast.show(`Alert status changed to ${newStatus}`, 'success');
      } else {
        throw new Error('Failed to update status');
      }
    } catch (error) {
      toast.show('Failed to update alert status', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSeverityChange = async (newSeverity: Severity) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/v2/alerts/${alertId}/severity`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ severity: newSeverity })
      });

      if (response.ok) {
        setAlert(prev => prev ? { ...prev, severity: newSeverity } : null);
        toast.show(`Alert severity changed to ${newSeverity}`, 'success');
      } else {
        throw new Error('Failed to update severity');
      }
    } catch (error) {
      toast.show('Failed to update alert severity', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async (note: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/v2/alerts/${alertId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note })
      });

      if (response.ok) {
        const newNote = await response.json();
        setNotes([...notes, newNote]);
        toast.show('Note added successfully', 'success');
      } else {
        throw new Error('Failed to add note');
      }
    } catch (error) {
      toast.show('Failed to add note', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePivotToSearch = () => {
    if (!alert || !onPivotToSearch) return;
    onPivotToSearch(alert);
  };

  const handleRunRuleNow = () => {
    if (alert) {
      setShowRunNowModal(true);
    }
  };

  // Calculate watermark window (example: last 24h to now-120s)
  const getWatermarkWindow = () => {
    const now = new Date();
    const nowMinus120s = new Date(now.getTime() - 120 * 1000);
    const watermark = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24h ago
    
    return {
      from: watermark,
      to: nowMinus120s,
    };
  };

  if (!alert) {
    return null;
  }

  const StatusIcon = {
    OPEN: AlertTriangle,
    ACK: Clock,
    CLOSED: CheckCircle,
    SUPPRESSED: XCircle,
  }[alert?.status || 'OPEN'];

  return (
    <div
      className={cn(
        "fixed right-0 top-0 h-full bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col transition-transform duration-300",
        alertId ? "translate-x-0" : "translate-x-full"
      )}
      style={{ width: '640px' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          {loading ? (
            <Skeleton className="h-6 w-48" />
          ) : alert ? (
            <>
              <StatusIcon className={cn("w-5 h-5", `text-${getStatusColor(alert.status) as any}-500`)} />
              <h2 id="drawer-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                {alert.title}
              </h2>
            </>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close drawer"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {(['summary', 'evidence', 'notes', 'actions'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 px-4 py-2 text-sm font-medium capitalize transition-colors",
              activeTab === tab
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            )}
            role="tab"
            aria-selected={activeTab === tab}
          >
            {tab}
            {tab === 'notes' && notes.length > 0 && (
              <span className="ml-1 text-xs">({notes.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden" role="tabpanel" aria-busy={loading}>
        {loading ? (
          <div className="p-4 space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : alert ? (
          <>
            {activeTab === 'summary' && (
              <div className="p-4 space-y-4 overflow-y-auto h-full">
                <InlineKeyValue label="Alert ID" value={alert.alert_id} copyable />
                <InlineKeyValue label="Rule ID" value={alert.rule_id} copyable />
                <InlineKeyValue 
                  label="Severity" 
                  value={
                    <Badge variant={getSeverityColor(alert.severity) as any}>
                      {alert.severity}
                    </Badge>
                  } 
                />
                <InlineKeyValue 
                  label="Status" 
                  value={
                    <Badge variant={getStatusColor(alert.status) as any}>
                      {alert.status}
                    </Badge>
                  } 
                />
                <InlineKeyValue label="Created" value={new Date(alert.created_at).toLocaleString()} />
                {alert.event_timestamp && (
                  <InlineKeyValue label="Event Time" value={new Date(alert.event_timestamp).toLocaleString()} />
                )}
                {alert.alert_key && <InlineKeyValue label="Alert Key" value={alert.alert_key} copyable />}
                {alert.source && <InlineKeyValue label="Source" value={alert.source} />}
                {alert.user && <InlineKeyValue label="User" value={alert.user} />}
                {alert.src_ip && <InlineKeyValue label="Source IP" value={alert.src_ip} copyable />}
                {alert.dst_ip && <InlineKeyValue label="Dest IP" value={alert.dst_ip} copyable />}
                {alert.host && <InlineKeyValue label="Host" value={alert.host} />}
                {alert.tags && alert.tags.length > 0 && (
                  <InlineKeyValue 
                    label="Tags" 
                    value={
                      <div className="flex flex-wrap gap-1">
                        {alert.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    } 
                  />
                )}
                {alert.summary && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Summary</h4>
                    <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                      {alert.summary}
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'evidence' && (
              <div className="p-4 h-full overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Raw Event Data</h3>
                  <CopyButton 
                    text={JSON.stringify(alert.event || {}, null, 2)} 
                    size="sm"
                  />
                </div>
                <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto text-xs text-gray-900 dark:text-gray-100">
                  {JSON.stringify(alert.event || {}, null, 2)}
                </pre>
              </div>
            )}

            {activeTab === 'notes' && (
              <Notes
                notes={notes}
                onAddNote={handleAddNote}
                loading={loading}
              />
            )}

            {activeTab === 'actions' && (
              <div className="p-4 space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Quick Actions</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={alert.status === 'ACK' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleStatusChange('ACK')}
                      disabled={updating || alert.status === 'ACK'}
                    >
                      Acknowledge
                    </Button>
                    <Button
                      variant={alert.status === 'CLOSED' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleStatusChange('CLOSED')}
                      disabled={updating || alert.status === 'CLOSED'}
                    >
                      Close
                    </Button>
                    <Button
                      variant={alert.status === 'OPEN' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleStatusChange('OPEN')}
                      disabled={updating || alert.status === 'OPEN'}
                    >
                      Reopen
                    </Button>
                    <Button
                      variant={alert.status === 'SUPPRESSED' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleStatusChange('SUPPRESSED')}
                      disabled={updating || alert.status === 'SUPPRESSED'}
                    >
                      Suppress
                    </Button>
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Investigation</h4>
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      onClick={handlePivotToSearch}
                    >
                      <Info className="w-4 h-4 mr-2" />
                      Pivot to Search
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => setShowRunNowModal(true)}
                    >
                      Run Rule Now
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            Failed to load alert details
          </div>
        )}
      </div>
      
      {/* Run Rule Now Modal */}
      {alert && (
        <RunNowModal
          open={showRunNowModal}
          onClose={() => setShowRunNowModal(false)}
          onConfirm={handleRunRuleNow}
          ruleId={alert.rule_id}
          ruleName={alert.title || alert.rule_id}
          watermarkWindow={getWatermarkWindow()}
        />
      )}
    </div>
  );
}
