import React from 'react';
import { X, ExternalLink, AlertTriangle, Check, Clock, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { InlineKeyValue } from '@/components/common/InlineKeyValue';
import { CopyButton } from '@/components/common/CopyButton';
import { Notes } from './Notes';
import { cn } from '@/lib/utils';
import { alertsApi, getSeverityColor, getStatusColor } from '@/lib/alerts';
import type { Alert, AlertNote, AlertStatus } from '@/lib/alerts';

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
  const [alert, setAlert] = React.useState<Alert | null>(null);
  const [notes, setNotes] = React.useState<AlertNote[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<Tab>('summary');
  const [updating, setUpdating] = React.useState(false);

  React.useEffect(() => {
    if (!alertId) {
      setAlert(null);
      setNotes([]);
      return;
    }

    setLoading(true);
    alertsApi.get(alertId, tenantId)
      .then((data) => {
        setAlert(data);
        setNotes(data.notes || []);
      })
      .catch((error) => {
        console.error('Failed to load alert:', error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [alertId, tenantId]);

  const handleStatusChange = async (newStatus: AlertStatus) => {
    if (!alert || updating) return;

    setUpdating(true);
    const oldStatus = alert.status;
    
    // Optimistic update
    setAlert({ ...alert, status: newStatus });
    onStatusChange?.(alert.alert_id, newStatus);

    try {
      await alertsApi.patch(alert.alert_id, { status: newStatus }, tenantId);
      // Emit instrumentation event
      if (window.__ux) {
        window.__ux.emit('alerts:patch:status', {
          alert_id: alert.alert_id,
          from: oldStatus,
          to: newStatus,
          ok: true,
        });
      }
    } catch (error: any) {
      // Revert on failure
      setAlert({ ...alert, status: oldStatus });
      onStatusChange?.(alert.alert_id, oldStatus);
      
      if (window.__ux) {
        window.__ux.emit('alerts:patch:status', {
          alert_id: alert.alert_id,
          from: oldStatus,
          to: newStatus,
          ok: false,
        });
      }

      // Show error toast or handle 409 specifically
      console.error('Failed to update status:', error);
    } finally {
      setUpdating(false);
    }
  };

  const handleAddNote = async (body: string) => {
    if (!alert) return;

    const result = await alertsApi.addNote(alert.alert_id, { body }, tenantId);
    const newNote: AlertNote = {
      note_id: result.note_id,
      created_at: result.created_at,
      body,
      author: 'Current User', // TODO: Get from auth context
    };
    setNotes([...notes, newNote]);
  };

  const handlePivotToSearch = () => {
    if (!alert || !onPivotToSearch) return;
    onPivotToSearch(alert);
  };

  if (!alertId) return null;

  const StatusIcon = {
    OPEN: AlertTriangle,
    ACK: Clock,
    CLOSED: Check,
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
              <StatusIcon className={cn("w-5 h-5", `text-${getStatusColor(alert.status)}-500`)} />
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
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Pivot to Search
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      disabled
                    >
                      Run Rule Now (Coming Soon)
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
    </div>
  );
}
