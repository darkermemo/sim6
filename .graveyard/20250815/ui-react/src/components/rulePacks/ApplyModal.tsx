import { useState } from 'react';
import { X, AlertTriangle, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CanaryConfig, PlanResponse } from '@/lib/rulePacks';
import { CanaryConfigPanel } from './CanaryConfig';

interface ApplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: PlanResponse;
  onApply: (request: {
    plan_id: string;
    actor: string;
    canary?: CanaryConfig;
    force: boolean;
    force_reason: string;
  }) => void;
}

export function ApplyModal({ isOpen, onClose, plan, onApply }: ApplyModalProps) {
  const [actor, setActor] = useState('');
  const [canaryConfig, setCanaryConfig] = useState<CanaryConfig>({
    enabled: false,
    stages: [10, 25, 50, 100],
    interval_sec: 300,
  });
  const [force, setForce] = useState(false);
  const [forceReason, setForceReason] = useState('');

  const handleApply = () => {
    if (!actor.trim()) {
      alert('Please enter your name');
      return;
    }

    if (force && !forceReason.trim()) {
      alert('Please provide a reason for force deployment');
      return;
    }

    onApply({
      plan_id: plan.plan_id,
      actor: actor.trim(),
      canary: canaryConfig.enabled ? canaryConfig : undefined,
      force,
      force_reason: forceReason,
    });
  };

  const canApply = actor.trim() && (!force || forceReason.trim());

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold">Apply Deployment</h2>
            <p className="text-muted-foreground">
              Review plan and configure deployment options
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)] space-y-6">
          {/* Plan Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Deployment Plan Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{plan.totals.create}</div>
                  <div className="text-sm text-muted-foreground">Create</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{plan.totals.update}</div>
                  <div className="text-sm text-muted-foreground">Update</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{plan.totals.disable}</div>
                  <div className="text-sm text-muted-foreground">Disable</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-600">{plan.totals.skip}</div>
                  <div className="text-sm text-muted-foreground">Skip</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Guardrails Status */}
          {plan.guardrails && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  Guardrails Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${
                        plan.guardrails.compilation_clean ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                      <span className="text-sm">Compilation Clean</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${
                        plan.guardrails.hot_disable_safe ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                      <span className="text-sm">Hot Rule Protection</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${
                        plan.guardrails.quota_ok ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                      <span className="text-sm">Quota Check</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${
                        plan.guardrails.blast_radius_ok ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                      <span className="text-sm">Blast Radius</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${
                        plan.guardrails.health_ok ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                      <span className="text-sm">System Health</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${
                        plan.guardrails.lock_ok ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                      <span className="text-sm">Lock Available</span>
                    </div>
                  </div>
                </div>

                {plan.guardrails.blocked_reasons.length > 0 && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Blocked Reasons:</strong>
                      <ul className="mt-2 list-disc list-inside">
                        {plan.guardrails.blocked_reasons.map((reason, index) => (
                          <li key={index} className="capitalize">
                            {reason.replace(/_/g, ' ')}
                          </li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {/* Actor Input */}
          <Card>
            <CardHeader>
              <CardTitle>Deployment Actor</CardTitle>
              <CardDescription>
                Who is responsible for this deployment?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Enter your name or identifier"
                value={actor}
                onChange={(e) => setActor(e.target.value)}
              />
            </CardContent>
          </Card>

          {/* Canary Configuration */}
          <CanaryConfigPanel
            config={canaryConfig}
            onConfigChange={setCanaryConfig}
          />

          {/* Force Deployment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Force Deployment
              </CardTitle>
              <CardDescription>
                Override guardrail failures (use with caution)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="force-deploy"
                  checked={force}
                  onChange={(e) => setForce(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="force-deploy" className="text-sm font-medium">
                  I understand the risks and want to force deployment
                </Label>
              </div>

              {force && (
                <div className="space-y-2">
                  <Label htmlFor="force-reason" className="text-sm font-medium">
                    Reason for force deployment *
                  </Label>
                  <Textarea
                    id="force-reason"
                    placeholder="Explain why you need to force this deployment..."
                    value={forceReason}
                    onChange={(e) => setForceReason(e.target.value)}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    This reason will be recorded in the deployment history for audit purposes.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Idempotency Key */}
          <Card>
            <CardHeader>
              <CardTitle>Idempotency</CardTitle>
              <CardDescription>
                This deployment can be safely retried if needed
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-muted p-3 rounded text-sm font-mono">
                {`rulepack:apply:${plan.plan_id}`}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Use this key to retry the deployment if it fails or is interrupted.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t">
          <div className="text-sm text-muted-foreground">
            {force && (
              <span className="text-amber-600 font-medium">
                ⚠️ Force deployment enabled
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              disabled={!canApply}
              variant={force ? 'destructive' : 'default'}
            >
              {force ? 'Force Deploy' : 'Deploy'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
