import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, Save, Play, FileText, Code, AlertCircle, CheckCircle2, Info, Plus, Minus,
  Loader2, FlaskConical, Database, Settings, Target, Clock, BarChart3
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/Sheet';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { useCreateRule, useCreateSigmaRule } from '@/hooks/api/useRules';
import { useFieldValues } from '@/hooks/useFieldValues';
import { useToast } from '@/hooks/useToast';
import { rulesApi } from '@/services/api';
import type { CreateRuleRequest, QueryFilter, StatefulConfigData, TestRuleResponse } from '@/types/api';
import { v4 as uuidv4 } from 'uuid';

interface AdvancedRuleCreationProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// Comprehensive CIM field definitions based on backend schema
const CIM_FIELDS = [
  // Core Event Fields
  { value: 'event_category', label: 'Event Category', description: 'Type of event (authentication, network, endpoint, etc.)' },
  { value: 'event_action', label: 'Event Action', description: 'Specific action performed' },
  { value: 'event_outcome', label: 'Event Outcome', description: 'Success, failure, etc.' },
  { value: 'event_timestamp', label: 'Event Timestamp', description: 'When the event occurred' },
  
  // Authentication Data Model
  { value: 'user', label: 'User', description: 'Primary username/user identity' },
  { value: 'src_user', label: 'Source User', description: 'Source user for authentication events' },
  { value: 'dest_user', label: 'Destination User', description: 'Target user for authentication events' },
  { value: 'user_type', label: 'User Type', description: 'local, domain, service, etc.' },
  { value: 'auth_method', label: 'Authentication Method', description: 'LDAP, local, SSO, etc.' },
  { value: 'auth_app', label: 'Authentication Application', description: 'Application used for auth' },
  { value: 'failure_reason', label: 'Failure Reason', description: 'Reason for auth failure' },
  { value: 'session_id', label: 'Session ID', description: 'User session identifier' },

  // Network Traffic Data Model
  { value: 'source_ip', label: 'Source IP', description: 'Source IP address' },
  { value: 'dest_ip', label: 'Destination IP', description: 'Destination IP address' },
  { value: 'src_port', label: 'Source Port', description: 'Source port number' },
  { value: 'dest_port', label: 'Destination Port', description: 'Destination port number' },
  { value: 'protocol', label: 'Protocol', description: 'Network protocol (TCP, UDP, ICMP)' },
  { value: 'bytes_in', label: 'Bytes In', description: 'Bytes received/inbound' },
  { value: 'bytes_out', label: 'Bytes Out', description: 'Bytes sent/outbound' },
  { value: 'packets_in', label: 'Packets In', description: 'Packets received' },
  { value: 'packets_out', label: 'Packets Out', description: 'Packets sent' },
  { value: 'duration', label: 'Duration', description: 'Connection duration in seconds' },
  { value: 'direction', label: 'Direction', description: 'inbound, outbound, lateral' },

  // Endpoint Activity Data Model
  { value: 'process_name', label: 'Process Name', description: 'Process/executable name' },
  { value: 'parent_process', label: 'Parent Process', description: 'Parent process name' },
  { value: 'process_id', label: 'Process ID', description: 'Process ID (PID)' },
  { value: 'parent_process_id', label: 'Parent Process ID', description: 'Parent process ID (PPID)' },
  { value: 'file_hash', label: 'File Hash', description: 'File hash (MD5, SHA1, SHA256)' },
  { value: 'file_path', label: 'File Path', description: 'Full file path' },
  { value: 'file_name', label: 'File Name', description: 'File name only' },
  { value: 'file_size', label: 'File Size', description: 'File size in bytes' },
  { value: 'command_line', label: 'Command Line', description: 'Full command line with arguments' },
  { value: 'registry_key', label: 'Registry Key', description: 'Windows registry key' },
  { value: 'registry_value', label: 'Registry Value', description: 'Windows registry value' },

  // Web Traffic Data Model
  { value: 'url', label: 'URL', description: 'Full URL accessed' },
  { value: 'uri_path', label: 'URI Path', description: 'URI path component' },
  { value: 'uri_query', label: 'URI Query', description: 'URI query string' },
  { value: 'http_method', label: 'HTTP Method', description: 'GET, POST, PUT, etc.' },
  { value: 'http_status_code', label: 'HTTP Status Code', description: 'HTTP response code' },
  { value: 'http_user_agent', label: 'User Agent', description: 'Browser/client user agent' },
  { value: 'http_referrer', label: 'HTTP Referrer', description: 'HTTP referrer header' },
  { value: 'http_content_type', label: 'Content Type', description: 'HTTP content type' },
  { value: 'http_content_length', label: 'Content Length', description: 'HTTP content length' },

  // Device/Host Information
  { value: 'src_host', label: 'Source Host', description: 'Source hostname' },
  { value: 'dest_host', label: 'Destination Host', description: 'Destination hostname' },
  { value: 'device_type', label: 'Device Type', description: 'firewall, ids, endpoint, etc.' },
  { value: 'vendor', label: 'Vendor', description: 'Device/software vendor' },
  { value: 'product', label: 'Product', description: 'Product name' },
  { value: 'version', label: 'Version', description: 'Product version' },

  // Geographic and Network Context
  { value: 'src_country', label: 'Source Country', description: 'Source IP country' },
  { value: 'dest_country', label: 'Destination Country', description: 'Destination IP country' },
  { value: 'src_zone', label: 'Source Zone', description: 'Source network zone' },
  { value: 'dest_zone', label: 'Destination Zone', description: 'Destination network zone' },
  { value: 'interface_in', label: 'Interface In', description: 'Ingress interface' },
  { value: 'interface_out', label: 'Interface Out', description: 'Egress interface' },
  { value: 'vlan_id', label: 'VLAN ID', description: 'VLAN identifier' },

  // Security Context
  { value: 'rule_id', label: 'Rule ID', description: 'Security rule ID that triggered' },
  { value: 'rule_name', label: 'Rule Name', description: 'Security rule name' },
  { value: 'policy_id', label: 'Policy ID', description: 'Policy identifier' },
  { value: 'policy_name', label: 'Policy Name', description: 'Policy name' },
  { value: 'signature_id', label: 'Signature ID', description: 'Detection signature ID' },
  { value: 'signature_name', label: 'Signature Name', description: 'Detection signature name' },
  { value: 'threat_name', label: 'Threat Name', description: 'Identified threat name' },
  { value: 'threat_category', label: 'Threat Category', description: 'malware, intrusion, etc.' },
  { value: 'severity', label: 'Severity', description: 'Event severity level' },
  { value: 'priority', label: 'Priority', description: 'Event priority' },
  { value: 'is_threat', label: 'Is Threat', description: 'Threat intelligence flag (0/1)' },

  // Application Context
  { value: 'app_name', label: 'Application Name', description: 'Application name' },
  { value: 'app_category', label: 'Application Category', description: 'Application category' },
  { value: 'service_name', label: 'Service Name', description: 'Service name' },

  // Email Data Model
  { value: 'email_sender', label: 'Email Sender', description: 'Email sender address' },
  { value: 'email_recipient', label: 'Email Recipient', description: 'Email recipient address' },
  { value: 'email_subject', label: 'Email Subject', description: 'Email subject line' },

  // Additional Fields
  { value: 'tags', label: 'Tags', description: 'Event tags' },
  { value: 'message', label: 'Message', description: 'Event message' },
  { value: 'details', label: 'Details', description: 'Additional event details' },
  { value: 'raw_event', label: 'Raw Event', description: 'Original raw log data' }
];

const OPERATORS = [
  { value: '=', label: 'Equals' },
  { value: '!=', label: 'Not Equals' },
  { value: 'LIKE', label: 'Contains' },
  { value: 'NOT LIKE', label: 'Does Not Contain' },
  { value: 'ILIKE', label: 'Contains (Case Insensitive)' },
  { value: '>', label: 'Greater Than' },
  { value: '>=', label: 'Greater Than or Equal' },
  { value: '<', label: 'Less Than' },
  { value: '<=', label: 'Less Than or Equal' },
  { value: 'IN', label: 'In List' },
  { value: 'NOT IN', label: 'Not In List' },
  { value: 'IS NULL', label: 'Is Empty' },
  { value: 'IS NOT NULL', label: 'Is Not Empty' }
];

const SEVERITY_OPTIONS = [
  { value: 'Informational', label: 'Informational' },
  { value: 'Low', label: 'Low' },
  { value: 'Medium', label: 'Medium' },
  { value: 'High', label: 'High' },
  { value: 'Critical', label: 'Critical' }
];

// Pre-defined rule templates for the 10 use cases
const RULE_TEMPLATES = {
  'brute_force': {
    name: 'Brute Force Detection',
    description: 'Detects multiple failed authentication attempts from the same source IP',
    engine_type: 'real-time',
    is_stateful: true,
    stateful_config: {
      key_prefix: 'brute_force',
      aggregate_on: ['source_ip', 'dest_user'],
      threshold: 5,
      window_seconds: 600
    },
    query: `SELECT * FROM dev.events WHERE event_category = 'Authentication' AND event_outcome = 'failure'`
  },
  'impossible_travel': {
    name: 'Impossible Travel Detection',
    description: 'Detects user logins from geographically impossible locations within a short timeframe',
    engine_type: 'scheduled',
    is_stateful: true,
    stateful_config: {
      key_prefix: 'impossible_travel',
      aggregate_on: ['user', 'src_country'],
      threshold: 2,
      window_seconds: 3600
    },
    query: `SELECT * FROM dev.events WHERE event_category = 'Authentication' AND event_outcome = 'success' AND src_country IS NOT NULL`
  },
  'malware_signature': {
    name: 'Malware Signature Match',
    description: 'Detects files matching known malware signatures',
    engine_type: 'real-time',
    is_stateful: false,
    query: `SELECT * FROM dev.events WHERE file_hash IN (SELECT hash FROM threat_intelligence WHERE type = 'malware')`
  },
  'data_egress': {
    name: 'High Volume Data Egress',
    description: 'Detects unusually high data transfer volumes',
    engine_type: 'scheduled',
    is_stateful: true,
    stateful_config: {
      key_prefix: 'data_egress',
      aggregate_on: ['source_ip'],
      threshold: 1000000000, // 1GB
      window_seconds: 86400 // 24 hours
    },
    query: `SELECT * FROM dev.events WHERE bytes_out > 0 AND direction = 'outbound'`
  },
  'admin_creation': {
    name: 'New Admin Account Creation',
    description: 'Detects creation of new administrative accounts',
    engine_type: 'scheduled',
    is_stateful: false,
    query: `SELECT * FROM dev.events WHERE event_action = 'User.Create' AND (user_type LIKE '%admin%' OR message LIKE '%administrator%')`
  },
  'sensitive_file_access': {
    name: 'Sensitive File Access',
    description: 'Detects access to sensitive files',
    engine_type: 'real-time',
    is_stateful: false,
    query: `SELECT * FROM dev.events WHERE event_action = 'File.Read' AND (file_path LIKE '%password%' OR file_path LIKE '%secret%' OR file_path LIKE '%confidential%')`
  },
  'port_scan': {
    name: 'Network Port Scan Detection',
    description: 'Detects port scanning activities',
    engine_type: 'real-time',
    is_stateful: true,
    stateful_config: {
      key_prefix: 'port_scan',
      aggregate_on: ['source_ip'],
      threshold: 20,
      window_seconds: 300
    },
    query: `SELECT * FROM dev.events WHERE dest_port IS NOT NULL AND protocol IN ('TCP', 'UDP')`
  },
  'dns_tunneling': {
    name: 'DNS Tunneling Detection',
    description: 'Detects potential DNS tunneling based on query characteristics',
    engine_type: 'scheduled',
    is_stateful: true,
    stateful_config: {
      key_prefix: 'dns_tunnel',
      aggregate_on: ['source_ip'],
      threshold: 100,
      window_seconds: 3600
    },
    query: `SELECT * FROM dev.events WHERE protocol = 'DNS' AND LENGTH(message) > 100`
  },
  'malicious_ip_login': {
    name: 'Login from Known Malicious IP',
    description: 'Detects successful logins from known malicious IP addresses',
    engine_type: 'real-time',
    is_stateful: false,
    query: `SELECT * FROM dev.events WHERE event_category = 'Authentication' AND event_outcome = 'success' AND is_threat = 1`
  },
  'suspicious_powershell': {
    name: 'Suspicious PowerShell Command',
    description: 'Detects potentially malicious PowerShell commands',
    engine_type: 'real-time',
    is_stateful: false,
    query: `SELECT * FROM dev.events WHERE process_name = 'powershell.exe' AND (command_line LIKE '%-enc%' OR command_line LIKE '%Invoke-Expression%' OR command_line LIKE '%IEX%')`
  }
};

/**
 * AdvancedRuleCreation - Comprehensive rule creation interface
 * 
 * Features:
 * - Two-column layout (70% form, 30% testing)
 * - Query Builder with CIM fields
 * - Raw SQL editor
 * - Sigma rule import
 * - Real-time rule testing
 * - Engine type selection
 * - Stateful rule configuration
 * - Pre-defined rule templates
 * 
 * @example
 * <AdvancedRuleCreation isOpen={true} onClose={() => {}} />
 */
export function AdvancedRuleCreation({ isOpen, onClose, onSuccess }: AdvancedRuleCreationProps) {
  const { toast } = useToast();
  const { createRule, isLoading: isCreatingRule } = useCreateRule();
  const { isLoading: isCreatingSigma } = useCreateSigmaRule();
  const { fieldValues, loadFieldValues, loadCommonFieldValues, isLoading: isLoadingFieldValues } = useFieldValues();

  // Form State
  const [formData, setFormData] = useState<CreateRuleRequest>({
    rule_name: '',
    description: '',
    query: '',
    engine_type: 'scheduled',
    is_stateful: 0,
    stateful_config: ''
  });

  const [severity, setSeverity] = useState<string>('Medium');
  const [detectionLogicTab, setDetectionLogicTab] = useState<'query-builder' | 'raw-sql' | 'sigma'>('query-builder');
  
  // Query Builder State
  const [queryFilters, setQueryFilters] = useState<QueryFilter[]>([
    { id: uuidv4(), field: '', operator: '=', value: '', logicalOperator: 'AND' }
  ]);
  
  // Sigma Import State
  const [sigmaYaml, setSigmaYaml] = useState('');
  
  // Stateful Configuration State
  const [statefulConfig, setStatefulConfig] = useState<StatefulConfigData>({
    key_prefix: '',
    aggregate_on: [],
    threshold: 1,
    window_seconds: 3600
  });
  
  // Testing State
  const [testResults, setTestResults] = useState<TestRuleResponse | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testQuery, setTestQuery] = useState('');

  // Generate SQL from query builder filters
  const generateSQLFromFilters = useCallback(() => {
    if (queryFilters.length === 0 || queryFilters.every(f => !f.field || (!f.value || (Array.isArray(f.value) && f.value.length === 0)))) {
      return 'SELECT * FROM dev.events';
    }

    const conditions = queryFilters
      .filter(filter => filter.field && filter.value && (!Array.isArray(filter.value) || filter.value.length > 0))
      .map((filter, index) => {
        let condition = '';
        let value = filter.value;

        // Handle array values (multi-select)
        if (Array.isArray(value)) {
          if (value.length === 1) {
            value = value[0];
          } else {
            // Multiple values - use IN operator
            const quotedValues = value.map(v => `'${v}'`).join(',');
            condition = `${filter.field} IN (${quotedValues})`;
            
            if (index > 0) {
              condition = `${filter.logicalOperator} ${condition}`;
            }
            
            return condition;
          }
        }

        // Handle different operators for single values
        switch (filter.operator) {
          case 'LIKE':
          case 'NOT LIKE':
          case 'ILIKE':
            value = `'%${value}%'`;
            break;
          case 'IN':
          case 'NOT IN':
            if (typeof value === 'string') {
              value = `(${value.split(',').map(v => `'${v.trim()}'`).join(',')})`;
            }
            break;
          case 'IS NULL':
          case 'IS NOT NULL':
            value = '';
            break;
          default:
            // For string fields, quote the value
            if (isNaN(Number(value as string))) {
              value = `'${value}'`;
            }
        }

        condition = `${filter.field} ${filter.operator} ${value}`.trim();
        
        if (index > 0) {
          condition = `${filter.logicalOperator} ${condition}`;
        }
        
        return condition;
      })
      .join(' ');

    return `SELECT * FROM dev.events WHERE ${conditions}`;
  }, [queryFilters]);

  // Load common field values when component mounts
  useEffect(() => {
    if (isOpen) {
      loadCommonFieldValues();
    }
  }, [isOpen, loadCommonFieldValues]);

  // Update query when filters change
  useEffect(() => {
    if (detectionLogicTab === 'query-builder') {
      const newQuery = generateSQLFromFilters();
      setFormData(prev => ({ ...prev, query: newQuery }));
      setTestQuery(newQuery);
    }
  }, [queryFilters, detectionLogicTab, generateSQLFromFilters]);

  // Handle filter changes
  const updateFilter = (id: string, field: keyof QueryFilter, value: string | string[]) => {
    setQueryFilters(prev => prev.map(filter => 
      filter.id === id ? { ...filter, [field]: value } : filter
    ));
  };

  // Handle field selection change - load values for the selected field
  const handleFieldChange = (filterId: string, fieldName: string) => {
    updateFilter(filterId, 'field', fieldName);
    updateFilter(filterId, 'value', ''); // Reset value when field changes
    
    // Load field values if not already loaded
    if (fieldName && !fieldValues[fieldName]) {
      loadFieldValues(fieldName);
    }
  };

  const addFilter = () => {
    setQueryFilters(prev => [...prev, {
      id: uuidv4(),
      field: '',
      operator: '=',
      value: '',
      logicalOperator: 'AND'
    }]);
  };

  const removeFilter = (id: string) => {
    setQueryFilters(prev => prev.filter(filter => filter.id !== id));
  };

  // Handle template application
  const applyTemplate = (templateKey: string) => {
    const template = RULE_TEMPLATES[templateKey as keyof typeof RULE_TEMPLATES];
    if (template) {
      setFormData({
        rule_name: template.name,
        description: template.description,
        query: template.query,
        engine_type: template.engine_type as 'scheduled' | 'real-time',
        is_stateful: template.is_stateful ? 1 : 0,
        stateful_config: (template as any).stateful_config ? JSON.stringify((template as any).stateful_config) : ''
      });
      
      if ((template as any).stateful_config) {
        setStatefulConfig((template as any).stateful_config);
      }
      
      setTestQuery(template.query);
      setDetectionLogicTab('raw-sql');
      
      toast({
        title: 'Template Applied',
        description: `Applied ${template.name} template successfully`,
      });
    }
  };

  // Handle Sigma import
  const handleSigmaImport = async () => {
    if (!sigmaYaml.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide Sigma YAML content',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await rulesApi.createSigmaRule(sigmaYaml);
      
      // Populate form with Sigma rule data
      setFormData({
        rule_name: result.rule.rule_name,
        description: result.rule.rule_description,
        query: result.rule.rule_query,
        engine_type: result.complexity_analysis.engine_type as 'scheduled' | 'real-time',
        is_stateful: result.rule.is_stateful,
        stateful_config: (result.rule as any).stateful_config || ''
      });
      
      setTestQuery(result.rule.rule_query);
      setDetectionLogicTab('raw-sql');
      
      toast({
        title: 'Sigma Rule Imported',
        description: `Rule imported successfully. Engine: ${result.complexity_analysis.engine_type}`,
      });

      if (result.complexity_analysis.complexity_reasons.length > 0) {
        toast({
          title: 'Complexity Analysis',
          description: `Detected: ${result.complexity_analysis.complexity_reasons.join(', ')}`,
        });
      }
      
    } catch (error: any) {
      toast({
        title: 'Import Failed',
        description: error.response?.data?.details || 'Failed to import Sigma rule',
        variant: 'destructive',
      });
    }
  };

  // Handle rule testing
  const handleTestRule = async () => {
    if (!testQuery.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a query to test',
        variant: 'destructive',
      });
      return;
    }

    setIsTesting(true);
    try {
      const result = await rulesApi.testRule(testQuery);
      setTestResults(result);
      
      if (result.error) {
        toast({
          title: 'Test Error',
          description: result.error,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Test Complete',
          description: `Found ${result.total_matches} matches in ${result.query_time_ms}ms`,
        });
      }
    } catch (error: any) {
      toast({
        title: 'Test Failed',
        description: error.response?.data?.error || 'Failed to test rule',
        variant: 'destructive',
      });
      setTestResults(null);
    } finally {
      setIsTesting(false);
    }
  };

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.rule_name.trim() || !formData.description.trim() || !formData.query.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      const ruleData = {
        ...formData,
        stateful_config: formData.is_stateful ? JSON.stringify(statefulConfig) : ''
      };

      await createRule(ruleData);
      
      toast({
        title: 'Success',
        description: 'Detection rule created successfully',
      });
      
      onSuccess?.();
      onClose();
    } catch (error: any) {
      toast({
        title: 'Creation Failed',
        description: error.response?.data?.error || 'Failed to create rule',
        variant: 'destructive',
      });
    }
  };

  // Reset form
  useEffect(() => {
    if (isOpen) {
      setFormData({
        rule_name: '',
        description: '',
        query: '',
        engine_type: 'scheduled',
        is_stateful: 0,
        stateful_config: ''
      });
      setSeverity('Medium');
      setQueryFilters([{ id: uuidv4(), field: '', operator: '=', value: '', logicalOperator: 'AND' }]);
      setSigmaYaml('');
      setStatefulConfig({
        key_prefix: '',
        aggregate_on: [],
        threshold: 1,
        window_seconds: 3600
      });
      setTestResults(null);
      setTestQuery('');
      setDetectionLogicTab('query-builder');
    }
  }, [isOpen]);

  const isCreating = isCreatingRule || isCreatingSigma;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-[95vw] w-[95vw] max-h-screen overflow-hidden">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Advanced Detection Rule Creation
          </SheetTitle>
          <SheetDescription>
            Create sophisticated detection rules with query builder, testing, and advanced configurations
          </SheetDescription>
        </SheetHeader>

        <div className="flex gap-6 h-[calc(100vh-140px)] mt-6">
          {/* Left Column - Rule Configuration (70%) */}
          <div className="flex-[7] overflow-y-auto pr-4">
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Rule Templates Section */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="h-4 w-4" />
                  <h3 className="font-semibold">Quick Start Templates</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(RULE_TEMPLATES).map(([key, template]) => (
                    <Button
                      key={key}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applyTemplate(key)}
                      className="text-left justify-start h-auto p-2"
                    >
                      <div>
                        <div className="font-medium text-xs">{template.name}</div>
                        <div className="text-xs text-gray-500 truncate">{template.description}</div>
                      </div>
                    </Button>
                  ))}
                </div>
              </Card>

              {/* Section 1: Rule Metadata */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-4 w-4" />
                  <h3 className="font-semibold">Rule Metadata</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Rule Name *
                    </label>
                    <Input
                      value={formData.rule_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, rule_name: e.target.value }))}
                      placeholder="Enter descriptive rule name"
                      className="mt-1"
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Description *
                    </label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Detailed description of what this rule detects"
                      className="mt-1"
                      rows={3}
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Severity
                    </label>
                    <Select
                      value={severity}
                      onValueChange={setSeverity}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SEVERITY_OPTIONS.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Card>

              {/* Section 2: Detection Logic */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Code className="h-4 w-4" />
                  <h3 className="font-semibold">Detection Logic</h3>
                </div>
                
                <Tabs value={detectionLogicTab} onValueChange={(value: any) => setDetectionLogicTab(value)}>
                  <TabsList className="grid grid-cols-3 w-full">
                    <TabsTrigger value="query-builder">Query Builder</TabsTrigger>
                    <TabsTrigger value="raw-sql">Raw SQL</TabsTrigger>
                    <TabsTrigger value="sigma">Import Sigma</TabsTrigger>
                  </TabsList>
                  
                  {/* Query Builder Tab */}
                  <TabsContent value="query-builder" className="space-y-4">
                    <div className="space-y-3">
                      {queryFilters.map((filter, index) => (
                        <div key={filter.id} className="flex items-center gap-2 p-3 border rounded-lg">
                          {index > 0 && (
                            <Select
                            value={filter.logicalOperator}
                            onValueChange={(value) => updateFilter(filter.id, 'logicalOperator', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="AND">AND</SelectItem>
                              <SelectItem value="OR">OR</SelectItem>
                            </SelectContent>
                          </Select>
                          )}
                          
                          <Select
                            value={filter.field}
                            onValueChange={(value) => handleFieldChange(filter.id, value)}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Select Field" />
                            </SelectTrigger>
                            <SelectContent>
                              {CIM_FIELDS.map(field => (
                                <SelectItem key={field.value} value={field.value} title={field.description}>
                                  {field.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          
                          <Select
                            value={filter.operator}
                            onValueChange={(value) => updateFilter(filter.id, 'operator', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {OPERATORS.map(op => (
                                <SelectItem key={op.value} value={op.value}>
                                  {op.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          
                          {!['IS NULL', 'IS NOT NULL'].includes(filter.operator) && (
                            <div className="flex-1">
                              {filter.field && fieldValues[filter.field] && fieldValues[filter.field].length > 0 ? (
                                <MultiSelect
                                  options={fieldValues[filter.field].map(item => ({
                                    value: item,
                                    label: item
                                  }))}
                                  value={Array.isArray(filter.value) ? filter.value : (filter.value ? [filter.value] : [])}
                                  onChange={(values) => updateFilter(filter.id, 'value', values)}
                                  placeholder="Select values..."
                                  isLoading={isLoadingFieldValues}
                                />
                              ) : (
                                <Input
                                  value={Array.isArray(filter.value) ? filter.value.join(', ') : filter.value}
                                  onChange={(e) => updateFilter(filter.id, 'value', e.target.value)}
                                  placeholder={filter.field ? (isLoadingFieldValues ? 'Loading values...' : 'Enter value or load from database') : 'Select a field first'}
                                  className="flex-1"
                                  disabled={!filter.field}
                                />
                              )}
                            </div>
                          )}
                          
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeFilter(filter.id)}
                            disabled={queryFilters.length === 1}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addFilter}
                        className="w-full"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Filter
                      </Button>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Generated SQL Query
                      </label>
                      <Textarea
                        value={formData.query}
                        readOnly
                        className="mt-1 bg-gray-50 dark:bg-gray-800 font-mono text-sm"
                        rows={4}
                      />
                    </div>
                  </TabsContent>
                  
                  {/* Raw SQL Tab */}
                  <TabsContent value="raw-sql" className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        ClickHouse SQL Query *
                      </label>
                      <Textarea
                        value={formData.query}
                        onChange={(e) => {
                          setFormData(prev => ({ ...prev, query: e.target.value }));
                          setTestQuery(e.target.value);
                        }}
                        placeholder="SELECT * FROM dev.events WHERE ..."
                        className="mt-1 font-mono text-sm"
                        rows={8}
                      />
                    </div>
                    
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                      <div className="flex items-start gap-2">
                        <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                        <div className="text-sm text-blue-800 dark:text-blue-200">
                          <strong>Query Tips:</strong>
                          <ul className="mt-1 space-y-1 text-xs">
                            <li>• Use "SELECT * FROM dev.events WHERE ..." as base</li>
                            <li>• Tenant isolation is automatically added</li>
                            <li>• Available tables: dev.events, dev.alerts, dev.rules</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  
                  {/* Sigma Import Tab */}
                  <TabsContent value="sigma" className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Sigma Rule YAML
                      </label>
                      <Textarea
                        value={sigmaYaml}
                        onChange={(e) => setSigmaYaml(e.target.value)}
                        placeholder={`title: Example Sigma Rule
id: 12345678-1234-5678-9012-123456789012
description: Example detection rule
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|endswith: '\\powershell.exe'
    CommandLine|contains: '-enc'
  condition: selection
falsepositives:
  - None
level: high`}
                        className="mt-1 font-mono text-sm"
                        rows={12}
                      />
                    </div>
                    
                    <Button
                      type="button"
                      onClick={handleSigmaImport}
                      className="w-full"
                    >
                      <Database className="h-4 w-4 mr-2" />
                      Import Sigma Rule
                    </Button>
                  </TabsContent>
                </Tabs>
              </Card>

              {/* Section 3: Engine & State Configuration */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Settings className="h-4 w-4" />
                  <h3 className="font-semibold">Engine & State Configuration</h3>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Detection Engine
                    </label>
                    <Select
                      value={formData.engine_type}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, engine_type: value as 'scheduled' | 'real-time' }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="real-time">Real-time (Stream Processor)</SelectItem>
                        <SelectItem value="scheduled">Scheduled (Rule Engine)</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-gray-500 mt-1">
                      Real-time: Immediate detection on new events. Scheduled: Historical analysis with complex queries.
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Stateful Detection
                      </label>
                      <div className="text-xs text-gray-500">
                        Enable to track events over time (e.g., counting, correlation)
                      </div>
                    </div>
                    <Switch
                      checked={formData.is_stateful === 1}
                      onChange={(checked: boolean) => setFormData(prev => ({ ...prev, is_stateful: checked ? 1 : 0 }))}
                    />
                  </div>
                  
                  {formData.is_stateful === 1 && (
                    <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div>
                        <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          Key Prefix
                        </label>
                        <Input
                          value={statefulConfig.key_prefix}
                          onChange={(e) => setStatefulConfig(prev => ({ ...prev, key_prefix: e.target.value }))}
                          placeholder="e.g., brute_force"
                          className="mt-1"
                        />
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          Aggregate On (comma-separated)
                        </label>
                        <Input
                          value={statefulConfig.aggregate_on.join(', ')}
                          onChange={(e) => setStatefulConfig(prev => ({ 
                            ...prev, 
                            aggregate_on: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                          }))}
                          placeholder="e.g., source_ip, user"
                          className="mt-1"
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            Threshold
                          </label>
                          <Input
                            type="number"
                            value={statefulConfig.threshold}
                            onChange={(e) => setStatefulConfig(prev => ({ ...prev, threshold: parseInt(e.target.value) || 1 }))}
                            className="mt-1"
                          />
                        </div>
                        
                        <div>
                          <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            Window (seconds)
                          </label>
                          <Input
                            type="number"
                            value={statefulConfig.window_seconds}
                            onChange={(e) => setStatefulConfig(prev => ({ ...prev, window_seconds: parseInt(e.target.value) || 3600 }))}
                            className="mt-1"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Submit Button */}
              <div className="flex gap-3 pt-6 border-t">
                <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                
                <Button type="submit" disabled={isCreating} className="flex-1">
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Create Rule
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>

          {/* Right Column - Rule Testing & Preview (30%) */}
          <div className="flex-[3] border-l pl-6 space-y-4">
            <div className="sticky top-0">
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <FlaskConical className="h-4 w-4" />
                  <h3 className="font-semibold">Rule Testing</h3>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Test Query
                    </label>
                    <Textarea
                      value={testQuery}
                      onChange={(e) => setTestQuery(e.target.value)}
                      placeholder="Query will be populated automatically..."
                      className="mt-1 font-mono text-xs"
                      rows={4}
                    />
                  </div>
                  
                  <Button
                    type="button"
                    onClick={handleTestRule}
                    disabled={isTesting || !testQuery.trim()}
                    className="w-full"
                  >
                    {isTesting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Test Rule
                      </>
                    )}
                  </Button>
                  
                  {/* Test Results */}
                  {testResults && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex items-center gap-2">
                          {testResults.error ? (
                            <AlertCircle className="h-4 w-4 text-red-500" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                          <span className="font-medium text-sm">
                            {testResults.error ? 'Test Failed' : 'Test Results'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <Clock className="h-3 w-3" />
                          {testResults.query_time_ms}ms
                        </div>
                      </div>
                      
                      {testResults.error ? (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                          <div className="text-sm text-red-800 dark:text-red-200">
                            {testResults.error}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              {testResults.total_matches} matches found
                            </span>
                            <Badge variant={testResults.total_matches > 0 ? 'default' : 'secondary'}>
                              {testResults.total_matches > 0 ? 'Active' : 'No Matches'}
                            </Badge>
                          </div>
                          
                          {testResults.matches.length > 0 && (
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                              {testResults.matches.slice(0, 5).map((match, index) => (
                                <div key={index} className="p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs">
                                  <div className="font-mono">
                                    {Object.entries(match).slice(0, 3).map(([key, value]) => (
                                      <div key={key}>
                                        <span className="text-gray-500">{key}:</span> {String(value)}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                              {testResults.matches.length > 5 && (
                                <div className="text-xs text-gray-500 text-center">
                                  ... and {testResults.matches.length - 5} more matches
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </Card>
              
              {/* Help Section */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="h-4 w-4" />
                  <h4 className="font-semibold text-sm">Use Case Examples</h4>
                </div>
                <div className="space-y-2 text-xs">
                  <div>
                    <strong>Brute Force:</strong> Failed auth attempts
                  </div>
                  <div>
                    <strong>Data Exfiltration:</strong> High bytes_out
                  </div>
                  <div>
                    <strong>Malware:</strong> Known file hashes
                  </div>
                  <div>
                    <strong>Port Scanning:</strong> Multiple dest_port
                  </div>
                  <div>
                    <strong>Admin Creation:</strong> User.Create + admin role
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}