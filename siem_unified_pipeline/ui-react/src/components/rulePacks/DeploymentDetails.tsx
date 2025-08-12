import { useState } from 'react';
import { Clock, Download, RotateCcw, Play, Pause, X, Info, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Deployment, DeploymentArtifact, CanaryStatus } from '@/lib/rulePacks';

interface DeploymentDetailsProps {
  deployment: Deployment;
  artifacts: DeploymentArtifact[];
  canaryStatus?: CanaryStatus;
  onRollback: () => void;
  onCanaryControl: (action: 'advance' | 'pause' | 'cancel') => void;
  onClose: () => void;
}

export function DeploymentDetails({
  deployment,
  artifacts,
  canaryStatus,
  onRollback,
  onCanaryControl,
  onClose,
}: DeploymentDetailsProps) {
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);
  const [rollbackReason, setRollbackReason] = useState('');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPLIED':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'FAILED':
      case 'FAILED_CANARY':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case 'CANCELED':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
      case 'ROLLED_BACK':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400';
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'APPLIED':
        return '✅';
      case 'FAILED':
      case 'FAILED_CANARY':
        return '❌';
      case 'CANCELED':
        return '⏹️';
      case 'ROLLED_BACK':
        return '🔄';
      default:
        return '⏳';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const canRollback = deployment.status === 'APPLIED' || deployment.status === 'FAILED_CANary';
  const canaryRunning = canaryStatus?.state === 'running';
  const canaryPaused = canaryStatus?.state === 'paused';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold">Deployment Details</h2>
            <p className="text-muted-foreground">
              {deployment.deploy_id} • {formatTimestamp(deployment.started_at)}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
              <TabsTrigger value="actions">Actions</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge className={`${getStatusColor(deployment.status)} text-sm`}>
                      {getStatusIcon(deployment.status)} {deployment.status}
                    </Badge>
                    {deployment.errors && (
                      <p className="text-sm text-red-600 mt-2">{deployment.errors}</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span>Created:</span>
                      <Badge variant="outline">{deployment.created}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Updated:</span>
                      <Badge variant="outline">{deployment.updated}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Disabled:</span>
                      <Badge variant="outline">{deployment.disabled}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Skipped:</span>
                      <Badge variant="outline">{deployment.skipped}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {deployment.guardrails && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Guardrails</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {deployment.guardrails.split(',').map((guardrail, index) => (
                        <Badge key={index} variant="secondary">
                          {guardrail.trim()}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {deployment.force_reason && (
                <Alert variant="warning">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Force Deployed:</strong> {deployment.force_reason}
                  </AlertDescription>
                </Alert>
              )}

              {deployment.rolled_back_from && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    This deployment was rolled back from: {deployment.rolled_back_from}
                  </AlertDescription>
                </Alert>
              )}

              {deployment.rolled_back_to && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    This deployment was rolled back to: {deployment.rolled_back_to}
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>

            {/* Timeline Tab */}
            <TabsContent value="timeline" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Deployment Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <div>
                        <div className="font-medium">Started</div>
                        <div className="text-sm text-muted-foreground">
                          {formatTimestamp(deployment.started_at)}
                        </div>
                      </div>
                    </div>

                    {deployment.finished_at && (
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <div>
                          <div className="font-medium">Completed</div>
                          <div className="text-sm text-muted-foreground">
                            {formatTimestamp(deployment.finished_at)}
                          </div>
                        </div>
                      </div>
                    )}

                    {canaryStatus && canaryStatus.enabled && (
                      <>
                        {canaryStatus.stages.map((stage, index) => (
                          <div key={index} className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${
                              index <= canaryStatus.current_stage ? 'bg-green-500' : 'bg-gray-300'
                            }`}></div>
                            <div>
                              <div className="font-medium">Stage {index + 1}: {stage}%</div>
                              <div className="text-sm text-muted-foreground">
                                {index <= canaryStatus.current_stage ? 'Completed' : 'Pending'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Artifacts Tab */}
            <TabsContent value="artifacts" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Deployment Artifacts</CardTitle>
                  <CardDescription>
                    Stored data for audit and rollback purposes
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {artifacts.length === 0 ? (
                    <p className="text-muted-foreground">No artifacts found</p>
                  ) : (
                    <div className="space-y-3">
                      {artifacts.map((artifact, index) => (
                        <div key={index} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant="outline">{artifact.kind}</Badge>
                            <span className="text-sm text-muted-foreground">
                              {formatTimestamp(artifact.created_at)}
                            </span>
                          </div>
                          <div className="bg-muted p-2 rounded text-sm font-mono overflow-x-auto">
                            {artifact.content}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => {
                              const blob = new Blob([artifact.content], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `${deployment.deploy_id}_${artifact.kind}.json`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Actions Tab */}
            <TabsContent value="actions" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Deployment Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Canary Controls */}
                  {canaryStatus && canaryStatus.enabled && (
                    <div className="space-y-3">
                      <h4 className="font-medium">Canary Controls</h4>
                      <div className="flex gap-2">
                        {canaryRunning && (
                          <>
                            <Button
                              onClick={() => onCanaryControl('advance')}
                              disabled={canaryStatus.current_stage >= Math.max(...canaryStatus.stages)}
                            >
                              <Play className="h-4 w-4 mr-2" />
                              Advance Stage
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => onCanaryControl('pause')}
                            >
                              <Pause className="h-4 w-4 mr-2" />
                              Pause
                            </Button>
                          </>
                        )}
                        
                        {canaryPaused && (
                          <Button
                            onClick={() => onCanaryControl('advance')}
                            disabled={canaryStatus.current_stage >= Math.max(...canaryStatus.stages)}
                          >
                            <Play className="h-4 w-4 mr-2" />
                            Resume
                          </Button>
                        )}
                        
                        <Button
                          variant="destructive"
                          onClick={() => onCanaryControl('cancel')}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel Canary
                        </Button>
                      </div>
                      
                      <div className="text-sm text-muted-foreground">
                        Current Stage: {canaryStatus.current_stage} / {canaryStatus.stages.length}
                      </div>
                    </div>
                  )}

                  {/* Rollback */}
                  {canRollback && (
                    <div className="space-y-3">
                      <h4 className="font-medium">Rollback</h4>
                      <p className="text-sm text-muted-foreground">
                        Rollback this deployment to restore previous rule states
                      </p>
                      <Button
                        variant="destructive"
                        onClick={() => setShowRollbackConfirm(true)}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Rollback Deployment
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Rollback Confirmation Dialog */}
      <Dialog open={showRollbackConfirm} onOpenChange={setShowRollbackConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Rollback</DialogTitle>
            <DialogDescription>
              This will rollback the deployment and restore the previous rule states. 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3">
            <label htmlFor="rollback-reason" className="text-sm font-medium">
              Reason for rollback (optional)
            </label>
            <textarea
              id="rollback-reason"
              className="w-full p-2 border rounded-md"
              rows={3}
              placeholder="Why are you rolling back this deployment?"
              value={rollbackReason}
              onChange={(e) => setRollbackReason(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRollbackConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onRollback();
                setShowRollbackConfirm(false);
              }}
            >
              Confirm Rollback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
