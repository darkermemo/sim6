import { useState, useMemo } from 'react';
import { useUiStore } from '@/stores/uiStore';
import { useAlertDetail } from '@/hooks/api/useAlertDetail';
import { useAlertNotes, useAddAlertNote } from '@/hooks/api/useAlertNotes';
import { useUpdateAlertStatus } from '@/hooks/api/useUpdateAlertStatus';
import { useAlertNotesSSE } from '@/hooks/useSSE';
import { useToast } from '@/hooks/useToast';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/Sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Timeline, TimelineEvent } from '@/components/ui/Timeline';
import { MonacoViewer } from '@/components/ui/MonacoViewer';
import { SkeletonDrawer, SkeletonNotesTab, SkeletonRawTab, SkeletonTimelineTab } from '@/components/ui/SkeletonDrawer';
import { AlertTriangle, User, Calendar, Hash, Terminal, Shield, Flag, MessageSquare, Plus } from 'lucide-react';

/**
 * AlertDetailDrawer - Comprehensive slide-over panel for alert investigation
 * 
 * Features:
 * - Four tabs: Overview, Raw, Timeline, Notes
 * - Real-time note updates via SSE
 * - Optimistic status updates
 * - Monaco editor for raw JSON
 * - Timeline view with activity history
 * - Comprehensive alert metadata display
 */
export function AlertDetailDrawer() {
  const { alertDrawerOpen, selectedAlertId, closeAlertDrawer } = useUiStore();
  const [activeTab, setActiveTab] = useState('overview');
  const [newNote, setNewNote] = useState('');
  const { toast } = useToast();

  // Data fetching hooks
  const { data: alertDetail, isLoading: isLoadingAlert, error: alertError } = useAlertDetail(selectedAlertId);
  const { data: notes, isLoading: isLoadingNotes } = useAlertNotes(selectedAlertId);
  const { addNote, isLoading: isAddingNote } = useAddAlertNote();
  const { updateStatus, isLoading: isUpdatingStatus } = useUpdateAlertStatus();

  // Real-time notes via SSE
  const { isConnected: sseConnected } = useAlertNotesSSE(selectedAlertId, alertDrawerOpen);

  // Handle status change
  const handleStatusChange = async (newStatus: string) => {
    if (!selectedAlertId) return;
    
    try {
      await updateStatus(selectedAlertId, newStatus);
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  // Handle assignee change (placeholder for now)
  const handleAssigneeChange = (assigneeId: string) => {
    console.log('Assignee changed to:', assigneeId);
    toast({
      title: 'Feature Coming Soon',
      description: 'Assignee management will be available in a future update',
      variant: 'default',
    });
  };

  // Handle note submission
  const handleAddNote = async () => {
    if (!selectedAlertId || !newNote.trim()) return;

    try {
      await addNote(selectedAlertId, newNote.trim());
      setNewNote('');
    } catch (error) {
      console.error('Failed to add note:', error);
    }
  };

  // Generate timeline events from alert data and notes - Memoized to prevent infinite loops
  const timelineEvents = useMemo((): TimelineEvent[] => {
    const events: TimelineEvent[] = [];

    if (alertDetail) {
      // Alert creation event
      events.push({
        id: `created-${alertDetail.alert_id}`,
        type: 'created',
        timestamp: new Date(alertDetail.created_at * 1000).toISOString(),
        title: 'Alert Created',
        description: `${alertDetail.rule_name} rule triggered`,
        user: 'SIEM System',
      });

      // Add note events
      notes.forEach(note => {
        events.push({
          id: note.note_id,
          type: 'note_added',
          timestamp: new Date(note.created_at * 1000).toISOString(),
          title: 'Note Added',
          description: note.content.substring(0, 100) + (note.content.length > 100 ? '...' : ''),
          user: note.author,
        });
      });
    }

    // Sort by timestamp (newest first)
    return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [alertDetail, notes]);

  // Action handlers
  const handleEscalate = () => {
    console.log('Escalating alert:', selectedAlertId);
    toast({
      title: 'Alert Escalated',
      description: 'Alert has been escalated for further investigation',
      variant: 'success',
    });
  };

  const handleMarkFalsePositive = () => {
    if (selectedAlertId) {
      handleStatusChange('Closed');
    }
  };

  const handleCreateCase = () => {
    console.log('Creating case for alert:', selectedAlertId);
    toast({
      title: 'Feature Coming Soon',
      description: 'Case creation will be available in a future update',
      variant: 'default',
    });
  };

  const getSeverityVariant = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'critical';
      case 'high': return 'high';
      case 'medium': return 'medium';
      case 'low': return 'low';
      default: return 'info';
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  return (
    <Sheet open={alertDrawerOpen} onOpenChange={(open) => !open && closeAlertDrawer()}>
      <SheetContent side="right" className="w-[800px] max-w-[90vw]">
        {isLoadingAlert ? (
          <SkeletonDrawer />
        ) : alertError ? (
          <div className="flex flex-col items-center justify-center h-full">
            <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Failed to Load Alert
            </h3>
            <p className="text-gray-600 dark:text-gray-400 text-center">
              Unable to fetch alert details. Please try again later.
            </p>
          </div>
        ) : alertDetail ? (
          <div className="flex flex-col h-full">
            {/* Header */}
            <SheetHeader className="border-b border-border pb-4 mb-6">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-xl">
                  {alertDetail.rule_name}
                </SheetTitle>
                <Badge variant={getSeverityVariant(alertDetail.severity)}>
                  {alertDetail.severity}
                </Badge>
              </div>
              <SheetDescription>
                Alert ID: {alertDetail.alert_id} • Created {formatTimestamp(alertDetail.created_at)}
                {sseConnected && <span className="ml-2 text-green-400">• Real-time</span>}
              </SheetDescription>
            </SheetHeader>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="raw">Raw</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="notes">
                  Notes
                  {notes.length > 0 && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {notes.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="flex-1 overflow-auto">
                <div className="space-y-6">
                  {/* Status and Assignee */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-900 dark:text-gray-100">Status</label>
                      <Select 
                        value={alertDetail.status} 
                        onValueChange={handleStatusChange}
                        disabled={isUpdatingStatus}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="New">New</SelectItem>
                          <SelectItem value="In Progress">In Progress</SelectItem>
                          <SelectItem value="Resolved">Resolved</SelectItem>
                          <SelectItem value="Closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-900 dark:text-gray-100">Assignee</label>
                      <Select onValueChange={handleAssigneeChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Assign to..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="analyst1">Security Analyst 1</SelectItem>
                          <SelectItem value="analyst2">Security Analyst 2</SelectItem>
                          <SelectItem value="lead">SOC Lead</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* MITRE Tags */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center">
                      <Shield className="h-4 w-4 mr-2" />
                      MITRE ATT&CK Techniques
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {alertDetail.mitre_tags.length > 0 ? (
                        alertDetail.mitre_tags.map((tag, index) => (
                          <Badge key={index} variant="outline">
                            {tag}
                          </Badge>
                        ))
                      ) : (
                        <p className="text-gray-600 dark:text-gray-400 text-sm">No MITRE techniques identified</p>
                      )}
                    </div>
                  </div>

                  {/* Key-Value Details */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-900 dark:text-gray-100">Alert Details</label>
                    <div className="space-y-3 bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                      {[
                        { label: 'Source IP', value: alertDetail.src_ip, icon: <Hash className="h-4 w-4" /> },
                        { label: 'Destination IP', value: alertDetail.dest_ip, icon: <Hash className="h-4 w-4" /> },
                        { label: 'User', value: alertDetail.user, icon: <User className="h-4 w-4" /> },
                        { label: 'Command Line', value: alertDetail.cmdline, icon: <Terminal className="h-4 w-4" /> },
                        { label: 'File Hash', value: alertDetail.hash, icon: <Hash className="h-4 w-4" /> },
                        { label: 'Rule ID', value: alertDetail.rule_id, icon: <Flag className="h-4 w-4" /> },
                        { label: 'Event ID', value: alertDetail.event_id, icon: <Calendar className="h-4 w-4" /> },
                      ].map((item, index) => (
                        <div key={index} className="flex justify-between items-center">
                          <div className="flex items-center text-sm font-medium text-gray-600 dark:text-gray-400">
                            {item.icon}
                            <span className="ml-2">{item.label}</span>
                          </div>
                          <span className="text-sm text-gray-900 dark:text-gray-100 font-mono">
                            {item.value || 'N/A'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex space-x-3">
                    <Button variant="outline" onClick={handleEscalate}>
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Escalate
                    </Button>
                    <Button variant="outline" onClick={handleMarkFalsePositive}>
                      Mark False Positive
                    </Button>
                    <Button variant="outline" onClick={handleCreateCase}>
                      Create Case
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Raw Tab */}
              <TabsContent value="raw" className="flex-1">
                {alertDetail.raw ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-900 dark:text-gray-100">Raw Event Data</label>
                    <MonacoViewer 
                      value={alertDetail.raw} 
                      language="json" 
                      height="calc(100vh - 300px)"
                    />
                  </div>
                ) : (
                  <SkeletonRawTab />
                )}
              </TabsContent>

              {/* Timeline Tab */}
              <TabsContent value="timeline" className="flex-1 overflow-auto">
                {timelineEvents.length > 0 ? (
                  <Timeline events={timelineEvents} />
                ) : (
                  <SkeletonTimelineTab />
                )}
              </TabsContent>

              {/* Notes Tab */}
              <TabsContent value="notes" className="flex-1 flex flex-col">
                {isLoadingNotes ? (
                  <SkeletonNotesTab />
                ) : (
                  <div className="flex-1 flex flex-col space-y-4">
                    {/* Add Note Form */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center">
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Add Note
                      </label>
                      <textarea
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Add your investigation notes..."
                        className="w-full h-24 p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <Button 
                        onClick={handleAddNote}
                        disabled={!newNote.trim() || isAddingNote}
                        size="sm"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        {isAddingNote ? 'Adding...' : 'Add Note'}
                      </Button>
                    </div>

                    {/* Notes List */}
                    <div className="flex-1 overflow-auto border-t border-border pt-4">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">
                        Investigation Notes ({notes.length})
                      </h4>
                      
                      {notes.length > 0 ? (
                        <div className="space-y-4">
                          {notes.map((note) => (
                            <div key={note.note_id} className="border border-gray-200 dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {note.author}
                                </span>
                                <span className="text-xs text-gray-600 dark:text-gray-400">
                                  {formatTimestamp(note.created_at)}
                                </span>
                              </div>
                              <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                                {note.content}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <MessageSquare className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
                          <p className="text-gray-600 dark:text-gray-400">No notes yet. Add the first note above.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
} 