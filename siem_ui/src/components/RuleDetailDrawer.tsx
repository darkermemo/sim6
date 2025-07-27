import React, { useState, useEffect } from 'react';
import { X, Save, FileText, Code, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/Sheet';
import { useCreateRule, useCreateSigmaRule, useRule } from '@/hooks/api/useRules';
import { useToast } from '@/hooks/useToast';
import type { CreateRuleRequest } from '@/types/api';

interface RuleDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  ruleId?: string;
  mode?: 'create' | 'view' | 'edit';
}

type RuleType = 'regular' | 'sigma';

/**
 * RuleDetailDrawer - Comprehensive rule management component
 * 
 * Features:
 * - Create regular rules with validation
 * - Create Sigma rules with YAML support
 * - View existing rule details
 * - Engine type selection (scheduled/real-time)
 * - Stateful rule configuration
 * - Real-time validation and error handling
 * - Perfect backend integration
 * 
 * @example
 * <RuleDetailDrawer 
 *   isOpen={true} 
 *   onClose={() => {}} 
 *   ruleId="new"
 *   mode="create"
 * />
 */
export function RuleDetailDrawer({ 
  isOpen, 
  onClose, 
  onSuccess,
  ruleId,
  mode = 'create'
}: RuleDetailDrawerProps) {
  const { toast } = useToast();
  const { createRule, isLoading: isCreatingRule } = useCreateRule();
  const { createSigmaRule, isLoading: isCreatingSigma } = useCreateSigmaRule();
  const { rule, isLoading: isLoadingRule } = useRule(mode !== 'create' ? ruleId || null : null);

  // Form state
  const [ruleType, setRuleType] = useState<RuleType>('regular');
  const [formData, setFormData] = useState<CreateRuleRequest>({
    rule_name: '',
    description: '',
    query: '',
    engine_type: 'scheduled',
    is_stateful: 0,
    stateful_config: '',
  });
  const [sigmaYaml, setSigmaYaml] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);

  // Reset form when opening/closing
  useEffect(() => {
    if (isOpen && mode === 'create') {
      setFormData({
        rule_name: '',
        description: '',
        query: '',
        engine_type: 'scheduled',
        is_stateful: 0,
        stateful_config: '',
      });
      setSigmaYaml('');
      setErrors({});
      setRuleType('regular');
    }
  }, [isOpen, mode]);

  // Load rule data for view/edit mode
  useEffect(() => {
    if (rule && (mode === 'view' || mode === 'edit')) {
      setFormData({
        rule_name: rule.rule_name,
        description: rule.rule_description,
        query: rule.rule_query,
        engine_type: 'scheduled', // Default since we removed from backend
        is_stateful: rule.is_stateful,
        stateful_config: rule.stateful_config || '',
      });
    }
  }, [rule, mode]);

  // Validation function
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (ruleType === 'regular') {
      if (!formData.rule_name.trim()) {
        newErrors.rule_name = 'Rule name is required';
      }
      if (!formData.description.trim()) {
        newErrors.description = 'Description is required';
      }
      if (!formData.query.trim()) {
        newErrors.query = 'Query is required';
      }

      // Validate SQL query format (basic check)
      if (formData.query.trim() && !formData.query.toLowerCase().includes('select')) {
        newErrors.query = 'Query should be a valid SQL SELECT statement';
      }

      // Validate stateful config if stateful is enabled
      if (formData.is_stateful && formData.stateful_config && formData.stateful_config.trim()) {
        try {
          JSON.parse(formData.stateful_config);
        } catch {
          newErrors.stateful_config = 'Stateful config must be valid JSON';
        }
      }
    } else {
      if (!sigmaYaml.trim()) {
        newErrors.sigma_yaml = 'Sigma YAML is required';
      }

      // Basic YAML validation
      if (sigmaYaml.trim() && !sigmaYaml.includes('title:')) {
        newErrors.sigma_yaml = 'Sigma rule must include a title field';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle input changes
  const handleInputChange = <K extends keyof CreateRuleRequest>(
    field: K, 
    value: CreateRuleRequest[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsValidating(true);

    try {
      if (ruleType === 'regular') {
        const result = await createRule(formData);
        toast({
          title: 'Rule Created',
          description: `Rule "${result.rule_name}" created successfully`,
          variant: 'success',
        });
      } else {
        const result = await createSigmaRule(sigmaYaml);
        toast({
          title: 'Sigma Rule Created',
          description: `Sigma rule "${result.rule.rule_name}" created successfully`,
          variant: 'success',
        });

        // Show complexity analysis
        if (result.complexity_analysis.is_complex) {
          toast({
            title: 'Complex Rule Detected',
            description: `Rule routed to ${result.complexity_analysis.engine_type} engine. Reasons: ${result.complexity_analysis.complexity_reasons.join(', ')}`,
            variant: 'default',
          });
        }
      }

      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Failed to create rule:', error);
      toast({
        title: 'Creation Failed',
        description: 'Failed to create rule. Please check your input.',
        variant: 'destructive',
      });
    } finally {
      setIsValidating(false);
    }
  };

  const isViewMode = mode === 'view';
  const isCreating = isCreatingRule || isCreatingSigma;
  const isFormValid = ruleType === 'regular' 
    ? Object.keys(errors).length === 0 && formData.rule_name.trim() && formData.description.trim() && formData.query.trim()
    : Object.keys(errors).length === 0 && sigmaYaml.trim();

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {mode === 'create' ? 'Create Detection Rule' : mode === 'edit' ? 'Edit Rule' : 'Rule Details'}
          </SheetTitle>
          <SheetDescription>
            {mode === 'create' 
              ? 'Create a new detection rule for threat identification'
              : mode === 'edit'
              ? 'Modify the detection rule configuration'
              : 'View detection rule details and configuration'
            }
          </SheetDescription>
        </SheetHeader>

        {/* Loading state */}
        {isLoadingRule && mode !== 'create' && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            <p className="ml-3 text-secondary-text">Loading rule...</p>
          </div>
        )}

        {/* Form */}
        {(!isLoadingRule || mode === 'create') && (
          <form onSubmit={handleSubmit} className="space-y-6 mt-6">
            {/* Rule Type Selection (Create mode only) */}
            {mode === 'create' && (
              <Card className="p-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Rule Type</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant={ruleType === 'regular' ? 'default' : 'outline'}
                    onClick={() => setRuleType('regular')}
                    className="flex items-center justify-center gap-2 h-16"
                  >
                    <Code className="h-5 w-5" />
                    <div className="text-center">
                      <div className="font-medium">Regular Rule</div>
                      <div className="text-xs opacity-75">SQL Query</div>
                    </div>
                  </Button>
                  <Button
                    type="button"
                    variant={ruleType === 'sigma' ? 'default' : 'outline'}
                    onClick={() => setRuleType('sigma')}
                    className="flex items-center justify-center gap-2 h-16"
                  >
                    <FileText className="h-5 w-5" />
                    <div className="text-center">
                      <div className="font-medium">Sigma Rule</div>
                      <div className="text-xs opacity-75">YAML Format</div>
                    </div>
                  </Button>
                </div>
              </Card>
            )}

            {/* Regular Rule Form */}
            {ruleType === 'regular' && (
              <>
                {/* Rule Name */}
                <div className="space-y-2">
                  <label htmlFor="rule_name" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Rule Name *
                  </label>
                  <input
                    type="text"
                    id="rule_name"
                    placeholder="e.g., Suspicious Login Activity"
                    value={formData.rule_name}
                    onChange={(e) => handleInputChange('rule_name', e.target.value)}
                    disabled={isViewMode}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.rule_name ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.rule_name && (
                    <div className="flex items-center gap-1 text-sm text-red-600">
                      <AlertCircle className="h-4 w-4" />
                      {errors.rule_name}
                    </div>
                  )}
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <label htmlFor="description" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Description *
                  </label>
                  <textarea
                    id="description"
                    placeholder="Describe what this rule detects..."
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    disabled={isViewMode}
                    rows={3}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.description ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.description && (
                    <div className="flex items-center gap-1 text-sm text-red-600">
                      <AlertCircle className="h-4 w-4" />
                      {errors.description}
                    </div>
                  )}
                </div>

                {/* Engine Type */}
                <div className="space-y-2">
                  <label htmlFor="engine_type" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Engine Type *
                  </label>
                  <select
                    id="engine_type"
                    value={formData.engine_type}
                    onChange={(e) => handleInputChange('engine_type', e.target.value as 'scheduled' | 'real-time')}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="scheduled">Scheduled - Historical analysis</option>
                    <option value="real-time">Real-time - Stream processing</option>
                  </select>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Scheduled rules run on historical data, real-time rules process live streams
                  </p>
                </div>

                {/* SQL Query */}
                <div className="space-y-2">
                  <label htmlFor="query" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    SQL Query *
                  </label>
                  <textarea
                    id="query"
                    placeholder="SELECT * FROM events WHERE..."
                    value={formData.query}
                    onChange={(e) => handleInputChange('query', e.target.value)}
                    disabled={isViewMode}
                    rows={6}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm ${
                      errors.query ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.query && (
                    <div className="flex items-center gap-1 text-sm text-red-600">
                      <AlertCircle className="h-4 w-4" />
                      {errors.query}
                    </div>
                  )}
                </div>

                {/* Stateful Configuration */}
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="is_stateful"
                      checked={formData.is_stateful === 1}
                      onChange={(e) => handleInputChange('is_stateful', e.target.checked ? 1 : 0)}
                      disabled={isViewMode}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="is_stateful" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Stateful Rule (Track events over time)
                    </label>
                  </div>

                  {formData.is_stateful === 1 && (
                    <div className="space-y-2">
                      <label htmlFor="stateful_config" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Stateful Configuration (JSON)
                      </label>
                      <textarea
                        id="stateful_config"
                        placeholder='{"key_prefix":"login_attempts","aggregate_on":["source_ip"],"threshold":5,"window_seconds":3600}'
                        value={formData.stateful_config}
                        onChange={(e) => handleInputChange('stateful_config', e.target.value)}
                        disabled={isViewMode}
                        rows={3}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm ${
                          errors.stateful_config ? 'border-red-500' : 'border-gray-300'
                        }`}
                      />
                      {errors.stateful_config && (
                        <div className="flex items-center gap-1 text-sm text-red-600">
                          <AlertCircle className="h-4 w-4" />
                          {errors.stateful_config}
                        </div>
                      )}
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        JSON configuration for Redis-based state tracking
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Sigma Rule Form */}
            {ruleType === 'sigma' && mode === 'create' && (
              <>
                <div className="space-y-2">
                  <label htmlFor="sigma_yaml" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Sigma Rule YAML *
                  </label>
                  <textarea
                    id="sigma_yaml"
                    placeholder={`title: Suspicious Process Execution
description: Detects suspicious process execution
status: experimental
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|endswith:
      - '\\\\powershell.exe'
      - '\\\\cmd.exe'
  condition: selection
falsepositives:
  - Administrative activity
level: medium`}
                    value={sigmaYaml}
                    onChange={(e) => setSigmaYaml(e.target.value)}
                    rows={15}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm ${
                      errors.sigma_yaml ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.sigma_yaml && (
                    <div className="flex items-center gap-1 text-sm text-red-600">
                      <AlertCircle className="h-4 w-4" />
                      {errors.sigma_yaml}
                    </div>
                  )}
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Sigma rules are automatically analyzed for complexity and routed to the appropriate engine
                  </p>
                </div>
              </>
            )}

            {/* View Mode Rule Details */}
            {isViewMode && rule && (
              <Card className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Rule Active</span>
                    <Badge variant={rule.is_active ? 'success' : 'warning'}>
                      {rule.is_active ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                    <div>Rule ID: <span className="font-mono text-gray-900 dark:text-gray-100">{rule.rule_id}</span></div>
                    <div>Created: <span className="text-gray-900 dark:text-gray-100">{new Date(rule.created_at * 1000).toLocaleString()}</span></div>
                    <div>Tenant: <span className="font-mono text-gray-900 dark:text-gray-100">{rule.tenant_id}</span></div>
                    <div>Stateful: <Badge variant={rule.is_stateful ? 'warning' : 'default'}>{rule.is_stateful ? 'Yes' : 'No'}</Badge></div>
                  </div>
                </div>
              </Card>
            )}

            {/* Error Summary */}
            {!isViewMode && Object.keys(errors).length > 0 && (
              <Card className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-red-900 dark:text-red-100">Please fix the following errors:</h4>
                    <ul className="text-sm text-red-800 dark:text-red-200 mt-1 space-y-1">
                      {Object.values(errors).map((error, index) => (
                        <li key={index}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-6 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                <X className="h-4 w-4 mr-2" />
                {isViewMode ? 'Close' : 'Cancel'}
              </Button>
              
              {!isViewMode && (
                <Button
                  type="submit"
                  disabled={!isFormValid || isCreating || isValidating}
                  className="flex-1"
                >
                  {isCreating || isValidating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Create Rule
                    </>
                  )}
                </Button>
              )}
            </div>
          </form>
        )}

        {/* Help Section */}
        {mode === 'create' && (
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
              <Info className="h-4 w-4" />
              Rule Creation Guide
            </h4>
            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
              <li>• Regular rules use SQL queries for custom detection logic</li>
              <li>• Sigma rules use YAML format and are automatically transpiled</li>
              <li>• Stateful rules can track events across time windows using Redis</li>
              <li>• Real-time rules process live streams, scheduled rules analyze historical data</li>
              <li>• Complex Sigma rules are automatically routed to the scheduled engine</li>
            </ul>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}