import React from 'react';
import { Save, Play, Trash2, AlertCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  validateRuleName, 
  validateWatermarkSec, 
  validateThrottleSeconds, 
  validateAlertKey,
  type Rule, 
  type RuleKind,
  type CompileRes,
  type DryRunRes,
} from '@/lib/rules';
import { cn } from '@/lib/utils';

interface RuleEditorProps {
  rule: Rule | null;
  isNew: boolean;
  compileResult?: CompileRes | null;
  dryRunResult?: DryRunRes | null;
  saving: boolean;
  compiling: boolean;
  dryRunning: boolean;
  onSave: (rule: Partial<Rule>) => void;
  onDelete?: () => void;
  onCompile: (kind: RuleKind, content: string) => void;
  onDryRun: (timeRange: number, limit: number) => void;
  onRunNow?: () => void;
  onEnableToggle?: (enabled: boolean) => void;
}

const TIME_RANGES = [
  { value: 300, label: '5 minutes' },
  { value: 900, label: '15 minutes' },
  { value: 3600, label: '1 hour' },
  { value: 21600, label: '6 hours' },
];

export function RuleEditor({
  rule,
  isNew,
  compileResult,
  dryRunResult,
  saving,
  compiling,
  dryRunning,
  onSave,
  onDelete,
  onCompile,
  onDryRun,
  onRunNow,
  onEnableToggle,
}: RuleEditorProps) {
  // Form state
  const [name, setName] = React.useState(rule?.name || '');
  const [description, setDescription] = React.useState(rule?.description || '');
  const [severity, setSeverity] = React.useState(rule?.severity || 'MEDIUM');
  const [enabled, setEnabled] = React.useState(rule?.enabled ?? true);
  const [kind, setKind] = React.useState<RuleKind>(rule?.kind || 'NATIVE');
  const [dsl, setDsl] = React.useState(rule?.dsl || '');
  const [sigmaYaml, setSigmaYaml] = React.useState(rule?.sigma_yaml || '');
  const [watermarkSec, setWatermarkSec] = React.useState(rule?.watermark_sec || 120);
  const [throttleSeconds, setThrottleSeconds] = React.useState(rule?.throttle_seconds || 0);
  const [alertKey, setAlertKey] = React.useState(rule?.alert_key || 'coalesce(user, src_ip, host)');
  const [tags, setTags] = React.useState<string[]>(rule?.tags || []);
  const [tagInput, setTagInput] = React.useState('');
  
  // UI state
  const [activeTab, setActiveTab] = React.useState('definition');
  const [dryRunTimeRange, setDryRunTimeRange] = React.useState(900);
  const [dryRunLimit, setDryRunLimit] = React.useState(100);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [compileDebounceTimer, setCompileDebounceTimer] = React.useState<NodeJS.Timeout | null>(null);

  // Update form when rule changes
  React.useEffect(() => {
    if (rule) {
      setName(rule.name);
      setDescription(rule.description || '');
      setSeverity(rule.severity);
      setEnabled(rule.enabled);
      setKind(rule.kind);
      setDsl(rule.dsl || '');
      setSigmaYaml(rule.sigma_yaml || '');
      setWatermarkSec(rule.watermark_sec || 120);
      setThrottleSeconds(rule.throttle_seconds || 0);
      setAlertKey(rule.alert_key || 'coalesce(user, src_ip, host)');
      setTags(rule.tags || []);
    }
  }, [rule]);

  // Debounced compile
  const handleContentChange = (content: string, isNative: boolean) => {
    if (isNative) {
      setDsl(content);
    } else {
      setSigmaYaml(content);
    }

    // Clear existing timer
    if (compileDebounceTimer) {
      clearTimeout(compileDebounceTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      if (content.trim()) {
        onCompile(kind, content);
      }
    }, 500);

    setCompileDebounceTimer(timer);
  };

  // Validation
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    const nameError = validateRuleName(name);
    if (nameError) newErrors.name = nameError;

    if (kind === 'NATIVE' && !dsl.trim()) {
      newErrors.dsl = 'DSL query is required';
    }

    if (kind === 'SIGMA' && !sigmaYaml.trim()) {
      newErrors.sigma = 'SIGMA YAML is required';
    }

    const watermarkError = validateWatermarkSec(watermarkSec);
    if (watermarkError) newErrors.watermark = watermarkError;

    const throttleError = validateThrottleSeconds(throttleSeconds);
    if (throttleError) newErrors.throttle = throttleError;

    const alertKeyError = validateAlertKey(alertKey);
    if (alertKeyError) newErrors.alertKey = alertKeyError;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    if (compileResult && !compileResult.ok) return;

    const ruleData: Partial<Rule> = {
      name,
      description: description || undefined,
      severity: severity as Rule['severity'],
      enabled,
      kind,
      dsl: kind === 'NATIVE' ? dsl : undefined,
      sigma_yaml: kind === 'SIGMA' ? sigmaYaml : undefined,
      watermark_sec: watermarkSec,
      throttle_seconds: throttleSeconds,
      alert_key: alertKey,
      tags: tags.length > 0 ? tags : undefined,
    };

    onSave(ruleData);
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const canSave = !saving && 
    (!compileResult || compileResult.ok) && 
    (kind === 'NATIVE' ? dsl.trim() : sigmaYaml.trim());

  return (
    <div className="flex-1 bg-white dark:bg-gray-800 flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              {isNew ? 'Create Rule' : 'Edit Rule'}
            </h1>
            {rule?.rule_id && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                ID: {rule.rule_id}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSave}
              disabled={!canSave}
              className="gap-2"
            >
              {saving ? (
                <>Saving...</>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save
                </>
              )}
            </Button>
            
            {!isNew && (
              <>
                <div className="flex items-center gap-2 mx-4">
                  <Label htmlFor="enabled" className="text-sm">
                    Enabled
                  </Label>
                  <Switch
                    id="enabled"
                    checked={enabled}
                    onCheckedChange={(checked) => {
                      setEnabled(checked);
                      onEnableToggle?.(checked);
                    }}
                  />
                </div>
                
                {onRunNow && (
                  <Button
                    variant="outline"
                    onClick={onRunNow}
                    className="gap-2"
                  >
                    <Play className="w-4 h-4" />
                    Run Now
                  </Button>
                )}
                
                {onDelete && (
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={onDelete}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="mx-6 mt-4">
            <TabsTrigger value="definition">Definition</TabsTrigger>
            <TabsTrigger value="compile">
              Compile
              {compileResult && !compileResult.ok && (
                <Badge variant="destructive" className="ml-2 text-xs">
                  Error
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="dry-run">Dry Run</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            {!isNew && <TabsTrigger value="history">History</TabsTrigger>}
          </TabsList>

          <div className="flex-1 overflow-y-auto p-6">
            <TabsContent value="definition" className="space-y-4 mt-0">
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Failed Login Detection"
                    className={errors.name ? 'border-red-500' : ''}
                  />
                  {errors.name && (
                    <p className="text-sm text-red-500 mt-1">{errors.name}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe what this rule detects..."
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="kind">Type</Label>
                  <Select value={kind} onValueChange={(v) => setKind(v as RuleKind)}>
                    <SelectTrigger id="kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NATIVE">Native DSL</SelectItem>
                      <SelectItem value="SIGMA">SIGMA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {kind === 'NATIVE' ? (
                  <div>
                    <Label htmlFor="dsl">Query DSL *</Label>
                    <Textarea
                      id="dsl"
                      value={dsl}
                      onChange={(e) => handleContentChange(e.target.value, true)}
                      placeholder="event_type:login AND result:failure | stats count() by user where count > 5"
                      rows={10}
                      className={cn(
                        "font-mono text-sm",
                        errors.dsl ? 'border-red-500' : ''
                      )}
                    />
                    {errors.dsl && (
                      <p className="text-sm text-red-500 mt-1">{errors.dsl}</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="sigma">SIGMA YAML *</Label>
                    <Textarea
                      id="sigma"
                      value={sigmaYaml}
                      onChange={(e) => handleContentChange(e.target.value, false)}
                      placeholder={`title: Failed Login Detection\nlogsource:\n  product: windows\n  service: security\ndetection:\n  selection:\n    EventID: 4625\n  condition: selection`}
                      rows={15}
                      className={cn(
                        "font-mono text-sm",
                        errors.sigma ? 'border-red-500' : ''
                      )}
                    />
                    {errors.sigma && (
                      <p className="text-sm text-red-500 mt-1">{errors.sigma}</p>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="compile" className="space-y-4 mt-0">
              {compiling ? (
                <div className="text-center py-8">
                  <div className="animate-pulse">Compiling...</div>
                </div>
              ) : compileResult ? (
                <div className="space-y-4">
                  {compileResult.ok ? (
                    <Alert className="border-green-200 bg-green-50 dark:bg-green-900/20">
                      <Check className="w-4 h-4 text-green-600" />
                      <AlertDescription className="text-green-600">
                        Compilation successful
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert variant="destructive">
                      <AlertCircle className="w-4 h-4" />
                      <AlertDescription>
                        Compilation failed
                      </AlertDescription>
                    </Alert>
                  )}

                  {compileResult.errors && compileResult.errors.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-medium text-red-600">Errors:</h3>
                      {compileResult.errors.map((error, i) => (
                        <div key={i} className="text-sm text-red-600">
                          {error.line && `Line ${error.line}: `}{error.message}
                        </div>
                      ))}
                    </div>
                  )}

                  {compileResult.warnings && compileResult.warnings.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-medium text-amber-600">Warnings:</h3>
                      {compileResult.warnings.map((warning, i) => (
                        <div key={i} className="text-sm text-amber-600">
                          {warning}
                        </div>
                      ))}
                    </div>
                  )}

                  {compileResult.sql && (
                    <div>
                      <h3 className="font-medium mb-2">Generated SQL:</h3>
                      <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto text-xs">
                        {compileResult.sql}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  Enter a query to see the compiled SQL
                </div>
              )}
            </TabsContent>

            <TabsContent value="dry-run" className="space-y-4 mt-0">
              <div className="flex items-end gap-4 mb-4">
                <div>
                  <Label htmlFor="timeRange">Time Range</Label>
                  <Select 
                    value={String(dryRunTimeRange)} 
                    onValueChange={(v) => setDryRunTimeRange(Number(v))}
                  >
                    <SelectTrigger id="timeRange" className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_RANGES.map(range => (
                        <SelectItem key={range.value} value={String(range.value)}>
                          {range.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="limit">Limit</Label>
                  <Input
                    id="limit"
                    type="number"
                    value={dryRunLimit}
                    onChange={(e) => setDryRunLimit(Number(e.target.value))}
                    min={1}
                    max={100}
                    className="w-20"
                  />
                </div>

                <Button
                  onClick={() => onDryRun(dryRunTimeRange, dryRunLimit)}
                  disabled={dryRunning || !rule || !compileResult?.ok}
                  className="gap-2"
                >
                  {dryRunning ? (
                    <>Running...</>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Run Test
                    </>
                  )}
                </Button>
              </div>

              {dryRunResult && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Badge variant="outline">
                      {dryRunResult.rows} matches
                    </Badge>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      in {dryRunResult.took_ms}ms
                    </span>
                  </div>

                  {dryRunResult.sample && dryRunResult.sample.length > 0 && (
                    <div>
                      <h3 className="font-medium mb-2">Sample Results:</h3>
                      <div className="bg-gray-100 dark:bg-gray-900 rounded-lg overflow-x-auto">
                        <pre className="p-4 text-xs">
                          {JSON.stringify(dryRunResult.sample, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="settings" className="space-y-4 mt-0">
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="severity">Severity</Label>
                  <Select value={severity} onValueChange={setSeverity}>
                    <SelectTrigger id="severity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="INFO">Info</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="watermark">Watermark (seconds)</Label>
                  <Input
                    id="watermark"
                    type="number"
                    value={watermarkSec}
                    onChange={(e) => setWatermarkSec(Number(e.target.value))}
                    min={60}
                    max={900}
                    className={errors.watermark ? 'border-red-500' : ''}
                  />
                  {errors.watermark && (
                    <p className="text-sm text-red-500 mt-1">{errors.watermark}</p>
                  )}
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Processing lag to ensure event completeness (60-900s)
                  </p>
                </div>

                <div>
                  <Label htmlFor="throttle">Throttle (seconds)</Label>
                  <Input
                    id="throttle"
                    type="number"
                    value={throttleSeconds}
                    onChange={(e) => setThrottleSeconds(Number(e.target.value))}
                    min={0}
                    max={3600}
                    className={errors.throttle ? 'border-red-500' : ''}
                  />
                  {errors.throttle && (
                    <p className="text-sm text-red-500 mt-1">{errors.throttle}</p>
                  )}
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Suppress duplicate alerts for this duration (0-3600s)
                  </p>
                </div>

                <div>
                  <Label htmlFor="alertKey">Alert Key Expression</Label>
                  <Input
                    id="alertKey"
                    value={alertKey}
                    onChange={(e) => setAlertKey(e.target.value)}
                    placeholder="coalesce(user, src_ip, host)"
                    className={errors.alertKey ? 'border-red-500' : ''}
                  />
                  {errors.alertKey && (
                    <p className="text-sm text-red-500 mt-1">{errors.alertKey}</p>
                  )}
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Fields used to group alerts (e.g., by user or IP)
                  </p>
                </div>

                <div>
                  <Label>Tags</Label>
                  <div className="flex gap-2 mb-2">
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                      placeholder="Add tag..."
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAddTag}
                      disabled={!tagInput.trim()}
                    >
                      Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tags.map(tag => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => handleRemoveTag(tag)}
                      >
                        {tag}
                        <X className="w-3 h-3 ml-1" />
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="history" className="space-y-4 mt-0">
              <div className="space-y-2">
                {rule?.created_at && (
                  <div className="text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Created:</span>{' '}
                    {new Date(rule.created_at).toLocaleString()}
                  </div>
                )}
                {rule?.updated_at && (
                  <div className="text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Last updated:</span>{' '}
                    {new Date(rule.updated_at).toLocaleString()}
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
                Revision history coming soon...
              </p>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

// Need to import the X icon
import { X } from 'lucide-react';
