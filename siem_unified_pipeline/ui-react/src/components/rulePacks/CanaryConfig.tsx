import { AlertTriangle, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { CanaryConfig } from '@/lib/rulePacks';

interface CanaryConfigProps {
  config: CanaryConfig;
  onConfigChange: (config: CanaryConfig) => void;
}

export function CanaryConfigPanel({ config, onConfigChange }: CanaryConfigProps) {
  const updateConfig = (updates: Partial<CanaryConfig>) => {
    onConfigChange({ ...config, ...updates });
  };

  const addStage = () => {
    const newStages = [...config.stages];
    if (newStages.length < 10) {
      newStages.push(Math.min(100, (newStages[newStages.length - 1] || 0) + 25));
      updateConfig({ stages: newStages });
    }
  };

  const removeStage = (index: number) => {
    const newStages = config.stages.filter((_, i) => i !== index);
    updateConfig({ stages: newStages });
  };

  const updateStage = (index: number, value: number) => {
    const newStages = [...config.stages];
    newStages[index] = Math.max(1, Math.min(100, value));
    updateConfig({ stages: newStages });
  };

  const presetStages = [
    [10, 25, 50, 100],
    [20, 50, 100],
    [25, 75, 100],
    [50, 100],
  ];

  const applyPreset = (stages: number[]) => {
    updateConfig({ stages: [...stages] });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="h-5 w-5" />
          Canary Deployment
        </CardTitle>
        <CardDescription>
          Progressive rollout to a subset of tenants to minimize risk
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable/Disable */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="canary-enabled"
            checked={config.enabled}
            onCheckedChange={(checked) => updateConfig({ enabled: checked as boolean })}
          />
          <Label htmlFor="canary-enabled" className="text-sm font-medium">
            Enable canary deployment
          </Label>
        </div>

        {config.enabled && (
          <>
            {/* Stage Configuration */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Deployment Stages (%)</Label>
                <div className="flex gap-2">
                  {presetStages.map((stages, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      onClick={() => applyPreset(stages)}
                    >
                      {stages.join(', ')}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {config.stages.map((stage, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      value={stage}
                      onChange={(e) => updateStage(index, parseInt(e.target.value) || 1)}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">% of tenants</span>
                    {config.stages.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeStage(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
                
                {config.stages.length < 10 && (
                  <Button variant="outline" size="sm" onClick={addStage}>
                    + Add Stage
                  </Button>
                )}
              </div>

              <div className="text-xs text-muted-foreground">
                Stages represent the percentage of tenants that will have rules enabled at each phase.
                For example: 10% → 25% → 50% → 100%
              </div>
            </div>

            {/* Interval Configuration */}
            <div className="space-y-2">
              <Label htmlFor="canary-interval" className="text-sm font-medium">
                Stage Interval (seconds)
              </Label>
              <Input
                id="canary-interval"
                type="number"
                min="30"
                max="3600"
                value={config.interval_sec}
                onChange={(e) => updateConfig({ interval_sec: parseInt(e.target.value) || 30 })}
                className="w-32"
              />
              <div className="text-xs text-muted-foreground">
                Minimum 30 seconds. Time between stages for monitoring and health checks.
              </div>
            </div>

            {/* Warning */}
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Canary Behavior:</strong>
                <ul className="mt-2 list-disc list-inside text-sm">
                  <li>Rules are initially deployed as <code>enabled=false</code></li>
                  <li>Tenants are deterministically bucketed based on rule_id hash</li>
                  <li>Health checks run between stages (dry-run + alert rate delta)</li>
                  <li>Auto-pause on failure, manual advance/pause/cancel controls</li>
                </ul>
              </AlertDescription>
            </Alert>

            {/* Stage Preview */}
            <div className="border rounded-lg p-3 bg-muted/50">
              <div className="text-sm font-medium mb-2">Deployment Timeline Preview:</div>
              <div className="space-y-1">
                {config.stages.map((stage, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="w-16">
                      Stage {index + 1}
                    </Badge>
                    <span>{stage}% of tenants</span>
                    {index < config.stages.length - 1 && (
                      <>
                        <span>→</span>
                        <span className="text-muted-foreground">
                          Wait {config.interval_sec}s
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
