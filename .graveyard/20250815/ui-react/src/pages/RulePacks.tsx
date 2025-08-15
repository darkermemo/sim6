import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Upload, Package, History, Eye, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/search/EmptyState';
import { UploadCard } from '@/components/rulePacks/UploadCard';
import { PacksTable } from '@/components/rulePacks/PacksTable';
import { PlanDrawer } from '@/components/rulePacks/PlanDrawer';
import { ApplyModal } from '@/components/rulePacks/ApplyModal';
import { DeploymentHistory } from '@/components/rulePacks/DeploymentHistory';
import { GuardrailPanel } from '@/components/rulePacks/GuardrailPanel';
import { DeploymentDetails } from '@/components/rulePacks/DeploymentDetails';
import { rulePacksApi, RulePack, PlanResponse, Deployment, CanaryConfig } from '@/lib/rulePacks';
import { toast } from '@/lib/toast';

export function RulePacksPage() {
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [showPlanDrawer, setShowPlanDrawer] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null);
  const [showDeploymentDetails, setShowDeploymentDetails] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<PlanResponse | null>(null);
  const [canaryConfig, setCanaryConfig] = useState<CanaryConfig>({
    enabled: false,
    stages: [10, 25, 50, 100],
    interval_sec: 300,
  });
  const [forceDeploy, setForceDeploy] = useState(false);
  const [forceReason, setForceReason] = useState('');

  const queryClient = useQueryClient();

  // Fetch rule packs
  const { data: packs, isLoading: packsLoading, error: packsError } = useQuery({
    queryKey: ['rule-packs'],
    queryFn: rulePacksApi.list,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Fetch selected pack details
  const { data: selectedPack } = useQuery({
    queryKey: ['rule-pack', selectedPackId],
    queryFn: () => selectedPackId ? rulePacksApi.get(selectedPackId) : null,
    enabled: !!selectedPackId,
  });

  // Fetch deployment artifacts for selected deployment
  const { data: deploymentArtifacts } = useQuery({
    queryKey: ['deployment-artifacts', selectedDeployment?.deploy_id],
    queryFn: () => selectedDeployment ? rulePacksApi.getArtifacts(selectedDeployment.deploy_id) : null,
    enabled: !!selectedDeployment,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: rulePacksApi.upload,
    onSuccess: (data) => {
      toast.show(`Pack uploaded successfully: ${data.pack_id}`, 'success');
      queryClient.invalidateQueries({ queryKey: ['rule-packs'] });
      setSelectedPackId(data.pack_id);
    },
    onError: (error) => {
      toast.show(`Upload failed: ${error.message}`, 'error');
    },
  });

  // Plan mutation
  const planMutation = useMutation({
    mutationFn: ({ packId, strategy, matchBy, tagPrefix }: {
      packId: string;
      strategy: 'safe' | 'force';
      matchBy: 'rule_id' | 'name';
      tagPrefix?: string;
    }) => rulePacksApi.plan(packId, { strategy, match_by: matchBy, tag_prefix: tagPrefix }),
    onSuccess: (data) => {
      setCurrentPlan(data);
      setShowPlanDrawer(true);
      toast.show('Deployment plan created successfully', 'success');
    },
    onError: (error) => {
      toast.show(`Plan creation failed: ${error.message}`, 'error');
    },
  });

  // Apply mutation
  const applyMutation = useMutation({
    mutationFn: ({ packId, request }: { packId: string; request: any }) => 
      rulePacksApi.apply(packId, request),
    onSuccess: (data) => {
      setShowApplyModal(false);
      setShowPlanDrawer(false);
      toast.show(`Deployment applied successfully: ${data.deploy_id}`, 'success');
      queryClient.invalidateQueries({ queryKey: ['rule-packs'] });
      
      // Show deployment details
      if (data.deploy_id) {
        // Fetch deployment details and show details drawer
        setSelectedDeployment({
          deploy_id: data.deploy_id,
          pack_id: packId,
          started_at: new Date().toISOString(),
          status: 'APPLIED',
          summary: 'Deployment completed successfully',
          created: data.totals.create,
          updated: data.totals.update,
          disabled: data.totals.disable,
          skipped: data.totals.skip,
          errors: 0,
          guardrails: data.guardrails.join(','),
          canary: data.canary?.enabled ? 1 : 0,
          canary_stages: data.canary?.stages.length || 0,
          canary_current_stage: data.canary?.current_stage || 0,
          canary_state: data.canary?.state || 'disabled',
          rolled_back_from: '',
          rolled_back_to: '',
          force_reason: forceReason,
          blast_radius: data.totals.create + data.totals.update + data.totals.disable,
        } as Deployment);
        setShowDeploymentDetails(true);
      }
    },
    onError: (error) => {
      toast.show(`Deployment failed: ${error.message}`, 'error');
    },
  });

  // Rollback mutation
  const rollbackMutation = useMutation({
    mutationFn: ({ deployId, reason }: { deployId: string; reason?: string }) =>
      rulePacksApi.rollback(deployId, { reason }),
    onSuccess: (data) => {
      toast.show(`Rollback completed: ${data.rollback_deploy_id}`, 'success');
      queryClient.invalidateQueries({ queryKey: ['rule-packs'] });
      setShowDeploymentDetails(false);
    },
    onError: (error) => {
      toast.show(`Rollback failed: ${error.message}`, 'error');
    },
  });

  // Canary control mutation
  const canaryControlMutation = useMutation({
    mutationFn: ({ deployId, action }: { deployId: string; action: 'advance' | 'pause' | 'cancel' }) =>
      rulePacksApi.canaryControl(deployId, action),
    onSuccess: (data) => {
      toast.show(`Canary ${action} successful: ${data.message}`, 'success');
      queryClient.invalidateQueries({ queryKey: ['rule-packs'] });
      
      // Update selected deployment state
      if (selectedDeployment) {
        setSelectedDeployment({
          ...selectedDeployment,
          canary_state: data.canary_state,
          canary_current_stage: data.current_stage,
        });
      }
    },
    onError: (error) => {
      toast.show(`Canary control failed: ${error.message}`, 'error');
    },
  });

  const handleUpload = (file: File, metadata: any) => {
    uploadMutation.mutate({ file, metadata });
  };

  const handlePlan = (packId: string, strategy: 'safe' | 'force', matchBy: 'rule_id' | 'name', tagPrefix?: string) => {
    planMutation.mutate({ packId, strategy, matchBy, tagPrefix });
  };

  const handleApply = (request: any) => {
    if (selectedPackId) {
      applyMutation.mutate({ packId: selectedPackId, request });
    }
  };

  const handleRollback = () => {
    if (selectedDeployment) {
      rollbackMutation.mutate({ deployId: selectedDeployment.deploy_id });
    }
  };

  const handleCanaryControl = (action: 'advance' | 'pause' | 'cancel') => {
    if (selectedDeployment) {
      canaryControlMutation.mutate({ deployId: selectedDeployment.deploy_id, action });
    }
  };

  const handleDeploymentClick = (deployment: Deployment) => {
    setSelectedDeployment(deployment);
    setShowDeploymentDetails(true);
  };

  const canApply = currentPlan && (
    currentPlan.guardrails.compilation_clean &&
    currentPlan.guardrails.hot_disable_safe &&
    currentPlan.guardrails.quota_ok &&
    currentPlan.guardrails.blast_radius_ok &&
    currentPlan.guardrails.health_ok &&
    currentPlan.guardrails.lock_ok &&
    currentPlan.guardrails.idempotency_ok
  ) || forceDeploy;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Rule Packs</h1>
          <p className="text-muted-foreground">
            Upload, plan, and deploy rule packs with safety guardrails
          </p>
        </div>
        <Button onClick={() => setShowPlanDrawer(true)} disabled={!selectedPackId}>
          <Plus className="h-4 w-4 mr-2" />
          Plan Deployment
        </Button>
      </div>

      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="packs">Packs</TabsTrigger>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Upload Tab */}
        <TabsContent value="upload" className="space-y-6">
          <UploadCard onUpload={handleUpload} />
          
          {uploadMutation.isPending && (
            <Alert>
              <Upload className="h-4 w-4" />
              <AlertDescription>
                Uploading pack... Please wait.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        {/* Packs Tab */}
        <TabsContent value="packs" className="space-y-6">
          {packsLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-2 text-muted-foreground">Loading rule packs...</p>
            </div>
          ) : packsError ? (
            <Alert variant="destructive">
              <AlertDescription>
                Failed to load rule packs: {packsError.message}
              </AlertDescription>
            </Alert>
          ) : packs && packs.length > 0 ? (
            <PacksTable
              packs={packs}
              onPackSelect={setSelectedPackId}
              selectedPackId={selectedPackId}
            />
          ) : (
            <EmptyState
              type="custom"
              icon={<Package className="h-12 w-12 text-muted-foreground" />}
              title="No Rule Packs"
              description="Upload your first rule pack to get started"
            />
          )}
        </TabsContent>

        {/* Plan Tab */}
        <TabsContent value="plan" className="space-y-6">
          {selectedPack ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Selected Pack: {selectedPack.name}</CardTitle>
                  <CardDescription>
                    Version {selectedPack.version} • {selectedPack.items} rules • {selectedPack.source}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handlePlan(selectedPack.pack_id, 'safe', 'rule_id')}
                      disabled={planMutation.isPending}
                    >
                      Plan Safe Deployment
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handlePlan(selectedPack.pack_id, 'force', 'rule_id')}
                      disabled={planMutation.isPending}
                    >
                      Plan Force Deployment
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {currentPlan && (
                <GuardrailPanel
                  guardrails={currentPlan.guardrails}
                  onForceChange={(force, reason) => {
                    setForceDeploy(force);
                    setForceReason(reason);
                  }}
                  force={forceDeploy}
                  forceReason={forceReason}
                  canApply={canApply}
                  onApply={() => setShowApplyModal(true)}
                />
              )}
            </div>
          ) : (
            <EmptyState
              type="custom"
              icon={<Package className="h-12 w-12 text-muted-foreground" />}
              title="No Pack Selected"
              description="Select a rule pack from the Packs tab to plan deployment"
            />
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-6">
          <DeploymentHistory
            packId={selectedPackId}
            onDeploymentClick={handleDeploymentClick}
          />
        </TabsContent>
      </Tabs>

      {/* Plan Drawer */}
      {showPlanDrawer && currentPlan && (
        <PlanDrawer
          plan={currentPlan}
          onClose={() => setShowPlanDrawer(false)}
          onApply={() => setShowApplyModal(true)}
        />
      )}

      {/* Apply Modal */}
      {showApplyModal && currentPlan && (
        <ApplyModal
          isOpen={showApplyModal}
          onClose={() => setShowApplyModal(false)}
          plan={currentPlan}
          onApply={handleApply}
        />
      )}

      {/* Deployment Details */}
      {showDeploymentDetails && selectedDeployment && (
        <DeploymentDetails
          deployment={selectedDeployment}
          artifacts={deploymentArtifacts || []}
          onRollback={handleRollback}
          onCanaryControl={handleCanaryControl}
          onClose={() => setShowDeploymentDetails(false)}
        />
      )}
    </div>
  );
}
