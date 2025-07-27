import React, { useState, useEffect } from 'react';
import { X, Save, Server, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
// Using native input and label for now - components not available
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/Sheet';
import { useCreateLogSource, getLogSourceTypeBadgeVariant, getValidLogSourceTypes } from '@/hooks/api/useLogSources';
import { useToast } from '@/hooks/useToast';
import type { LogSource, CreateLogSourceRequest, LogSourceType } from '@/types/api';

interface LogSourceDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  logSource?: LogSource;
  mode?: 'create' | 'view';
}

/**
 * LogSourceDetailDrawer - Drawer for creating/viewing log source configurations
 * 
 * Features:
 * - Create new log sources with validation
 * - View existing log source details
 * - IP address validation
 * - Source type selection with visual indicators
 * - Real-time validation feedback
 * 
 * @example
 * <LogSourceDetailDrawer 
 *   isOpen={true} 
 *   onClose={() => {}} 
 *   onSuccess={() => {}}
 * />
 */
export function LogSourceDetailDrawer({ 
  isOpen, 
  onClose, 
  onSuccess,
  logSource,
  mode = 'create'
}: LogSourceDetailDrawerProps) {
  const { toast } = useToast();
  const { createLogSource, isCreating } = useCreateLogSource();

  // Form state
  const [formData, setFormData] = useState<CreateLogSourceRequest>({
    source_name: '',
    source_type: 'Syslog',
    source_ip: '',
  });

  // Validation state
  const [errors, setErrors] = useState<Partial<CreateLogSourceRequest>>({});
  const [isValidating, setIsValidating] = useState(false);

  // Initialize form data when viewing existing log source
  useEffect(() => {
    if (logSource && mode === 'view') {
      setFormData({
        source_name: logSource.source_name,
        source_type: logSource.source_type,
        source_ip: logSource.source_ip,
      });
    } else if (mode === 'create') {
      // Reset form for create mode
      setFormData({
        source_name: '',
        source_type: 'Syslog',
        source_ip: '',
      });
    }
    setErrors({});
  }, [logSource, mode, isOpen]);

  // Validate IP address format
  const validateIpAddress = (ip: string): boolean => {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
  };

  // Validate form fields
  const validateForm = (): boolean => {
    const newErrors: Partial<CreateLogSourceRequest> = {};

    // Source name validation
    if (!formData.source_name.trim()) {
      newErrors.source_name = 'Source name is required';
    } else if (formData.source_name.length < 3) {
      newErrors.source_name = 'Source name must be at least 3 characters';
    } else if (formData.source_name.length > 50) {
      newErrors.source_name = 'Source name must be less than 50 characters';
    }

    // Source IP validation
    if (!formData.source_ip.trim()) {
      newErrors.source_ip = 'IP address is required';
    } else if (!validateIpAddress(formData.source_ip)) {
      newErrors.source_ip = 'Please enter a valid IP address (e.g., 192.168.1.100)';
    }

    // Source type validation  
    if (!getValidLogSourceTypes().includes(formData.source_type)) {
      // Type error fix: use any for the error object since it's a string message
      (newErrors as any).source_type = 'Please select a valid source type';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form input changes
  const handleInputChange = (field: keyof CreateLogSourceRequest, value: string) => {
    setFormData((prev: CreateLogSourceRequest) => ({ ...prev, [field]: value }));
    
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors((prev: Partial<CreateLogSourceRequest>) => ({ ...prev, [field]: undefined }));
    }
  };

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (mode === 'view') {
      onClose();
      return;
    }

    setIsValidating(true);
    
    if (!validateForm()) {
      setIsValidating(false);
      toast({
        title: 'Validation Error',
        description: 'Please fix the errors in the form and try again.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createLogSource(formData);
      onSuccess?.();
      onClose();
      
      // Reset form
      setFormData({
        source_name: '',
        source_type: 'Syslog',
        source_ip: '',
      });
    } catch (error) {
      console.error('Failed to create log source:', error);
    } finally {
      setIsValidating(false);
    }
  };

  // Handle IP address paste and auto-format
  const handleIpPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const paste = event.clipboardData.getData('text');
    const cleaned = paste.replace(/[^0-9.]/g, ''); // Remove non-numeric and non-dot characters
    
    if (cleaned !== paste) {
      event.preventDefault();
      handleInputChange('source_ip', cleaned);
    }
  };

  const isViewMode = mode === 'view';
  const isFormValid = Object.keys(errors).length === 0 && 
                     formData.source_name.trim() && 
                     formData.source_ip.trim();

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            {isViewMode ? 'Log Source Details' : 'Add New Log Source'}
          </SheetTitle>
          <SheetDescription>
            {isViewMode 
              ? 'View log source configuration details'
              : 'Configure a new log source for SIEM ingestion'
            }
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {/* Source Name */}
                     <div className="space-y-2">
             <label htmlFor="source_name" className="text-sm font-medium text-gray-900 dark:text-gray-100">
               Source Name *
             </label>
             <input
               type="text"
               id="source_name"
               placeholder="e.g., Production Web Server, Main Firewall"
               value={formData.source_name}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('source_name', e.target.value)}
               disabled={isViewMode}
               className={`px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.source_name ? 'border-destructive' : 'border-border'}`}
               aria-describedby={errors.source_name ? 'source_name-error' : undefined}
             />
            {errors.source_name && (
              <div id="source_name-error" className="flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {errors.source_name}
              </div>
            )}
          </div>

          {/* Source Type */}
                     <div className="space-y-2">
             <label htmlFor="source_type" className="text-sm font-medium text-gray-900 dark:text-gray-100">
               Source Type *
             </label>
            <Select
              value={formData.source_type}
              onValueChange={(value) => handleInputChange('source_type', value as LogSourceType)}
              disabled={isViewMode}
            >
                             {getValidLogSourceTypes().map((type: LogSourceType) => (
                 <option key={type} value={type}>
                   {type}
                 </option>
               ))}
            </Select>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant={getLogSourceTypeBadgeVariant(formData.source_type)}>
                {formData.source_type}
              </Badge>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Parser type for this log source
              </span>
            </div>
          </div>

          {/* Source IP Address */}
                     <div className="space-y-2">
             <label htmlFor="source_ip" className="text-sm font-medium text-gray-900 dark:text-gray-100">
               IP Address *
             </label>
             <input
               id="source_ip"
               type="text"
               placeholder="192.168.1.100"
               value={formData.source_ip}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('source_ip', e.target.value)}
               onPaste={handleIpPaste}
               disabled={isViewMode}
               className={`font-mono px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.source_ip ? 'border-destructive' : 'border-border'}`}
               aria-describedby={errors.source_ip ? 'source_ip-error' : undefined}
             />
            {errors.source_ip && (
              <div id="source_ip-error" className="flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {errors.source_ip}
              </div>
            )}
            <p className="text-sm text-gray-600 dark:text-gray-400">
              The IP address where logs originate from
            </p>
          </div>

          {/* View Mode Additional Info */}
          {isViewMode && logSource && (
            <Card className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Configuration Active</span>
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                  <div>Source ID: <span className="font-mono text-gray-900 dark:text-gray-100">{logSource.source_id}</span></div>
                  <div>Created: <span className="text-gray-900 dark:text-gray-100">{new Date(logSource.created_at * 1000).toLocaleString()}</span></div>
                  <div>Tenant: <span className="font-mono text-gray-900 dark:text-gray-100">{logSource.tenant_id}</span></div>
                </div>
              </div>
            </Card>
          )}

          {/* Form Validation Summary */}
          {!isViewMode && Object.keys(errors).length > 0 && (
            <Card className="p-4 bg-destructive/5 border-destructive/20">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-destructive">Please fix the following errors:</h4>
                                     <ul className="text-sm text-destructive/80 mt-1 space-y-1">
                     {Object.values(errors).map((error: string | undefined, index: number) => (
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
                    Create Log Source
                  </>
                )}
              </Button>
            )}
          </div>
        </form>

        {/* Help Text */}
        {!isViewMode && (
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
              Configuration Guide
            </h4>
            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
              <li>• Choose the appropriate source type for proper log parsing</li>
              <li>• Ensure the IP address is reachable from your SIEM infrastructure</li>
              <li>• Use descriptive names for easy identification in dashboards</li>
              <li>• Each IP address can only be configured once per tenant</li>
            </ul>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
} 