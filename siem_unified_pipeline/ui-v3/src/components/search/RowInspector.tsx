'use client';

import React, { useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { normalizeSeverity } from '@/lib/severity';
import {
  X,
  Copy,
  Download,
  Eye,
  Code,
  FileText,
  Clock,
  User,
  Globe,
  Shield,
  Database,
  Network,
  Tag,
  Activity
} from 'lucide-react';
import { EventSummary } from '@/types/api';

export interface RowInspectorProps {
  event: EventSummary | null;
  isOpen: boolean;
  onClose: () => void;
}

export function RowInspector({ event, isOpen, onClose }: RowInspectorProps) {
  const [activeTab, setActiveTab] = useState('overview');

  if (!isOpen || !event) return null;

  const getSeverityBadgeClass = (severity: string) => {
    switch (normalizeSeverity(severity)) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'info': return 'bg-sky-100 text-sky-800 border-sky-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSourceIcon = (source: string) => {
    const lowerSource = source?.toLowerCase() || '';
    if (lowerSource.includes('auth')) return User;
    if (lowerSource.includes('web') || lowerSource.includes('http')) return Globe;
    if (lowerSource.includes('firewall') || lowerSource.includes('security')) return Shield;
    return Database;
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    // TODO: Add toast notification
    console.log(`Copied ${label} to clipboard`);
  };

  const handleDownload = () => {
    const dataStr = JSON.stringify(event, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `event-${event.id}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const SourceIcon = getSourceIcon(event.source);

  // Organize event data into categories
  const eventFields = [
    { label: 'Event ID', value: event.id, icon: Tag },
    { label: 'Event Type', value: event.event_type, icon: Activity },
    { label: 'Timestamp', value: new Date(event.timestamp).toLocaleString(), icon: Clock },
    { label: 'Severity', value: event.severity, icon: Shield, badge: true },
    { label: 'Source', value: event.source, icon: SourceIcon },
    { label: 'Message', value: event.message, icon: FileText },
  ];

  const networkFields = [
    { label: 'Source IP', value: event.source_ip, icon: Network },
    { label: 'Destination IP', value: event.destination_ip, icon: Network },
    { label: 'Source Port', value: event.source_port, icon: Network },
    { label: 'Destination Port', value: event.destination_port, icon: Network },
    { label: 'Protocol', value: event.protocol, icon: Network },
  ].filter(field => field.value);

  const identityFields = [
    { label: 'User', value: event.user, icon: User },
    { label: 'Host', value: event.host, icon: Database },
  ].filter(field => field.value);

  const metadataFields = [
    { label: 'Vendor', value: event.vendor, icon: Database },
    { label: 'Product', value: event.product, icon: Database },
    { label: 'Event Category', value: event.event_category, icon: Tag },
    { label: 'Event Action', value: event.event_action, icon: Activity },
    { label: 'Event Outcome', value: event.event_outcome, icon: Activity },
    { label: 'Tenant ID', value: event.tenant_id, icon: Database },
  ].filter(field => field.value);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <SourceIcon className="h-6 w-6 text-primary" />
                <h2 className="text-xl font-semibold">Event Inspector</h2>
              </div>
              <Badge className={getSeverityBadgeClass(event.severity)}>
                {normalizeSeverity(event.severity)}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <ActionButton 
                variant="outline" 
                size="sm" 
                onClick={() => handleCopy(JSON.stringify(event, null, 2), 'event data')}
                data-action="search:inspector:copy-json"
                data-intent="api"
                data-endpoint="/api/v2/search/copy"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy JSON
              </ActionButton>
              <ActionButton 
                variant="outline" 
                size="sm" 
                onClick={handleDownload}
                data-action="search:inspector:download"
                data-intent="api"
                data-endpoint="/api/v2/search/download"
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </ActionButton>
              <ActionButton 
                variant="ghost" 
                size="icon" 
                onClick={onClose}
                data-action="search:inspector:close"
                data-intent="open-modal"
              >
                <X className="h-4 w-4" />
              </ActionButton>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {event.event_type} • {new Date(event.timestamp).toLocaleString()}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 overflow-auto max-h-[calc(90vh-140px)]">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="network">Network</TabsTrigger>
              <TabsTrigger value="raw">Raw Data</TabsTrigger>
              <TabsTrigger value="metadata">Metadata</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6 mt-6">
              {/* Event Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Event Details
                  </CardTitle>
                  <CardDescription>Core event information and classification</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {eventFields.map((field, index) => (
                    <div key={index} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2">
                        <field.icon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{field.label}</span>
                      </div>
                      <div className="text-right">
                        {field.badge ? (
                          <Badge className={getSeverityBadgeClass(field.value)}>
                            {normalizeSeverity(field.value)}
                          </Badge>
                        ) : (
                          <span className="text-sm font-mono break-all">{field.value}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Identity Information */}
              {identityFields.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Identity & Host
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {identityFields.map((field, index) => (
                      <div key={index} className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-2">
                          <field.icon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{field.label}</span>
                        </div>
                        <span className="text-sm font-mono">{field.value}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="network" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Network className="h-5 w-5" />
                    Network Information
                  </CardTitle>
                  <CardDescription>IP addresses, ports, and protocol details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {networkFields.length > 0 ? (
                    networkFields.map((field, index) => (
                      <div key={index} className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-2">
                          <field.icon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{field.label}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="font-mono text-sm"
                          onClick={() => handleCopy(field.value?.toString() || '', field.label)}
                        >
                          {field.value}
                          <Copy className="h-3 w-3 ml-2" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      No network information available for this event
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="raw" className="space-y-6 mt-6">
              {/* Formatted JSON */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Code className="h-5 w-5" />
                    Parsed Event Data
                  </CardTitle>
                  <CardDescription>Structured event data as JSON</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <Button
                      variant="outline"
                      size="sm"
                      className="absolute top-2 right-2 z-10"
                      onClick={() => handleCopy(JSON.stringify(event, null, 2), 'parsed data')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto max-h-96 font-mono">
                      {JSON.stringify(event, null, 2)}
                    </pre>
                  </div>
                </CardContent>
              </Card>

              {/* Raw Log */}
              {event.raw_message && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Raw Log Message
                    </CardTitle>
                    <CardDescription>Original log line before parsing</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="relative">
                      <Button
                        variant="outline"
                        size="sm"
                        className="absolute top-2 right-2 z-10"
                        onClick={() => handleCopy(event.raw_message || '', 'raw message')}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto max-h-32 font-mono whitespace-pre-wrap">
                        {event.raw_message}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="metadata" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Tag className="h-5 w-5" />
                    Event Metadata
                  </CardTitle>
                  <CardDescription>Additional classification and vendor information</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {metadataFields.length > 0 ? (
                    metadataFields.map((field, index) => (
                      <div key={index} className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-2">
                          <field.icon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{field.label}</span>
                        </div>
                        <span className="text-sm font-mono">{field.value}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      No additional metadata available for this event
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
