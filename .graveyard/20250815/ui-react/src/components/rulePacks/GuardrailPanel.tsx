import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { GuardrailStatus } from '@/lib/rulePacks';

interface GuardrailPanelProps {
  guardrails: GuardrailStatus;
  onForceChange: (force: boolean, reason: string) => void;
  force: boolean;
  forceReason: string;
  canApply: boolean;
  onApply: () => void;
}

export function GuardrailPanel({
  guardrails,
  onForceChange,
  force,
  forceReason,
  canApply,
  onApply,
}: GuardrailPanelProps) {
  const allPassed = guardrails.compilation_clean &&
    guardrails.hot_disable_safe &&
    guardrails.quota_ok &&
    guardrails.blast_radius_ok &&
    guardrails.health_ok &&
    guardrails.lock_ok &&
    guardrails.idempotency_ok;

  const getStatusIcon = (passed: boolean) => {
    return passed ? (
      <CheckCircle className="h-5 w-5 text-green-600" />
    ) : (
      <XCircle className="h-5 w-5 text-red-600" />
    );
  };

  const getStatusColor = (passed: boolean) => {
    return passed ? 'text-green-600' : 'text-red-600';
  };

  const getStatusText = (passed: boolean) => {
    return passed ? 'Passed' : 'Failed';
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="h-5 w-5" />
          Deployment Guardrails
        </CardTitle>
        <CardDescription>
          Safety checks that must pass before deployment can proceed
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Guardrail Checklist */}
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              {getStatusIcon(guardrails.compilation_clean)}
              <div>
                <div className="font-medium">Compilation Clean</div>
                <div className="text-sm text-muted-foreground">
                  All rules compile without errors
                </div>
              </div>
            </div>
            <Badge variant={guardrails.compilation_clean ? 'default' : 'destructive'}>
              {getStatusText(guardrails.compilation_clean)}
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              {getStatusIcon(guardrails.hot_disable_safe)}
              <div>
                <div className="font-medium">Hot Rule Protection</div>
                <div className="text-sm text-muted-foreground">
                  No rules with recent alerts will be disabled
                </div>
              </div>
            </div>
            <Badge variant={guardrails.hot_disable_safe ? 'default' : 'destructive'}>
              {getStatusText(guardrails.hot_disable_safe)}
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              {getStatusIcon(guardrails.quota_ok)}
              <div>
                <div className="font-medium">Quota Check</div>
                <div className="text-sm text-muted-foreground">
                  Changes within allowed percentage limits
                </div>
              </div>
            </div>
            <Badge variant={guardrails.quota_ok ? 'default' : 'destructive'}>
              {getStatusText(guardrails.quota_ok)}
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              {getStatusIcon(guardrails.blast_radius_ok)}
              <div>
                <div className="font-medium">Blast Radius</div>
                <div className="text-sm text-muted-foreground">
                  Number of affected rules is acceptable
                </div>
              </div>
            </div>
            <Badge variant={guardrails.blast_radius_ok ? 'default' : 'destructive'}>
              {getStatusText(guardrails.blast_radius_ok)}
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              {getStatusIcon(guardrails.health_ok)}
              <div>
                <div className="font-medium">System Health</div>
                <div className="text-sm text-muted-foreground">
                  ClickHouse and Redis are healthy
                </div>
              </div>
            </div>
            <Badge variant={guardrails.health_ok ? 'default' : 'destructive'}>
              {getStatusText(guardrails.health_ok)}
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              {getStatusIcon(guardrails.lock_ok)}
              <div>
                <div className="font-medium">Lock Available</div>
                <div className="text-sm text-muted-foreground">
                  No other deployment in progress
                </div>
              </div>
            </div>
            <Badge variant={guardrails.lock_ok ? 'default' : 'destructive'}>
              {getStatusText(guardrails.lock_ok)}
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              {getStatusIcon(guardrails.idempotency_ok)}
              <div>
                <div className="font-medium">Idempotency</div>
                <div className="text-sm text-muted-foreground">
                  Request can be safely retried
                </div>
              </div>
            </div>
            <Badge variant={guardrails.idempotency_ok ? 'default' : 'destructive'}>
              {getStatusText(guardrails.idempotency_ok)}
            </Badge>
          </div>
        </div>

        {/* Blocked Reasons */}
        {guardrails.blocked_reasons.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Blocked Reasons:</strong>
              <ul className="mt-2 list-disc list-inside">
                {guardrails.blocked_reasons.map((reason, index) => (
                  <li key={index} className="capitalize">
                    {reason.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Force Override */}
        {!allPassed && (
          <div className="border rounded-lg p-4 bg-amber-50 dark:bg-amber-950/20">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium text-amber-800 dark:text-amber-200">
                    Force Deployment
                  </h4>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Some guardrails failed, but you can force the deployment if you understand the risks.
                  </p>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="force-deploy"
                    checked={force}
                    onCheckedChange={(checked) => onForceChange(checked as boolean, forceReason)}
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
                    <Input
                      id="force-reason"
                      placeholder="Explain why you need to force this deployment..."
                      value={forceReason}
                      onChange={(e) => onForceChange(force, e.target.value)}
                      className="border-amber-300 focus:border-amber-500"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Apply Button */}
        <div className="flex justify-end">
          <Button
            onClick={onApply}
            disabled={!canApply}
            variant={allPassed ? 'default' : 'destructive'}
            size="lg"
          >
            {allPassed ? 'Deploy' : 'Force Deploy'}
          </Button>
        </div>

        {/* Status Summary */}
        <div className="text-center">
          <Badge variant={allPassed ? 'default' : 'destructive'} className="text-sm">
            {allPassed ? '✅ All Guardrails Passed' : '❌ Guardrails Failed'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
