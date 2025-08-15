"use client";
import React, { useState, useMemo } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
// Note: Textarea component needs to be added to ui components
import { Badge } from '@/components/ui/badge'
import { X, Plus, Copy, Play } from 'lucide-react'
import { useSchema } from '@/hooks/useSchema'

interface TimeCtrl {
  last_seconds?: number;
}

interface FilterBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (query: string, time: TimeCtrl) => void;
  tenantId: string;
}

// Time range options per specification
const TIME_RANGES = [
  { label: '15 seconds', value: 15 },
  { label: '1 minute', value: 60 },
  { label: '5 minutes', value: 300 },
  { label: '10 minutes', value: 600 },
  { label: '15 minutes', value: 900 },
  { label: '30 minutes', value: 1800 },
  { label: '1 hour', value: 3600 },
  { label: '4 hours', value: 14400 },
  { label: '1 day', value: 86400 },
  { label: '7 days', value: 604800 },
  { label: '30 days', value: 2592000 },
];

// Field operators per specification
const FIELD_OPERATORS = [
  { value: '=', label: 'equals (=)' },
  { value: '!=', label: 'not equals (!=)' },
  { value: '>', label: 'greater than (>)' },
  { value: '>=', label: 'greater than or equal (>=)' },
  { value: '<', label: 'less than (<)' },
  { value: '<=', label: 'less than or equal (<=)' },
  { value: 'contains', label: 'contains' },
  { value: 'startswith', label: 'starts with' },
  { value: 'endswith', label: 'ends with' },
  { value: 'regex', label: 'regex match' },
  { value: 'in', label: 'in list' },
  { value: 'not in', label: 'not in list' },
  { value: 'between', label: 'between' },
  { value: 'exists', label: 'exists' },
  { value: 'missing', label: 'missing' },
];

// Example field names (will be loaded from /api/v2/schema/fields)
const EXAMPLE_FIELDS = [
  'tenant_id', 'user', 'src_ip', 'dest_ip', 'host', 'event_type', 
  'severity', 'source_type', 'outcome', 'country', 'device_id',
  'session_id', 'token_id', 'app_id', 'service_name'
];

// Aggregate functions for rolling/spike expressions
const AGG_FUNCTIONS = [
  'count', 'sum', 'avg', 'min', 'max', 'uniq', 'uniqExact'
];

// Saved searches from the specification (first 10 as examples)
const SAVED_SEARCHES = [
  {
    id: "id_bruteforce_success",
    name: "Bruteforce → Success",
    severity: "high",
    tags: ["identity", "sequence"],
    query: "seq(fail[x50] -> success, within=3m, by={user,src_ip}, strict=strict_once)",
    description: "≥50 failed logins followed by a success from same user+IP in 3m"
  },
  {
    id: "id_password_spray", 
    name: "Password Spray",
    severity: "high",
    tags: ["identity", "ratio"],
    query: "ratio(fail:success > 20, within=10m, by={src_ip}) AND spread(uniq(user) ≥ 10, within=10m, by={src_ip})",
    description: "High fail:success and many users per source IP"
  },
  {
    id: "id_mfa_fatigue",
    name: "MFA Fatigue → Approval", 
    severity: "high",
    tags: ["identity", "sequence"],
    query: "seq(mfa_denied[x5] -> mfa_approved, within=30m, by={user})",
    description: "Repeated MFA denials then approval"
  },
  {
    id: "auth_fail_spike",
    name: "Auth Failure Spike (z≥3)",
    severity: "medium", 
    tags: ["identity", "spike"],
    query: "spike(auth_fail,z≥3,within=5m,history=30d,by={user})",
    description: "Failures exceed baseline"
  },
  {
    id: "c2_beacon_low_jitter",
    name: "Low-Jitter Beacon",
    severity: "high",
    tags: ["c2", "beacon"], 
    query: "beacon(count≥20, jitter<0.2, within=1h, by={src_ip,dest_ip})",
    description: "Periodic connections with low jitter"
  }
];

export function FilterBuilderDialog({ open, onOpenChange, onApply, tenantId }: FilterBuilderDialogProps) {
  const [timeRange, setTimeRange] = useState<number>(900); // 15 minutes default
  const [activeTab, setActiveTab] = useState("field");
  const [query, setQuery] = useState("");

  // Dynamic schema fields for selects
  const schema = useSchema(tenantId)
  const fieldOptions = useMemo(() => (schema.fields || []).map((f: any) => f.name), [schema.fields])

  // Field condition state
  const [fieldName, setFieldName] = useState("");
  const [fieldOp, setFieldOp] = useState("=");
  const [fieldValue, setFieldValue] = useState("");
  const [groupByFields, setGroupByFields] = useState<string[]>([]);

  // Sequence state
  const [seqStages, setSeqStages] = useState<string[]>(["", ""]);
  const [seqWithin, setSeqWithin] = useState("5m");
  const [seqBy, setSeqBy] = useState("");
  const [seqStrict, setSeqStrict] = useState("strict_once");

  // Rolling state  
  const [rollExpr, setRollExpr] = useState("count() > 100");
  const [rollWithin, setRollWithin] = useState("5m");
  const [rollBy, setRollBy] = useState("");

  // Ratio state
  const [ratioNum, setRatioNum] = useState("fail");
  const [ratioDen, setRatioDen] = useState("success");
  const [ratioOp, setRatioOp] = useState(">");
  const [ratioK, setRatioK] = useState("20");
  const [ratioWithin, setRatioWithin] = useState("10m");
  const [ratioBy, setRatioBy] = useState("");

  // Spike state
  const [spikeMetric, setSpikeMetric] = useState("auth_fail");
  const [spikeZ, setSpikeZ] = useState("3");
  const [spikeWithin, setSpikeWithin] = useState("5m");
  const [spikeHistory, setSpikeHistory] = useState("30d");
  const [spikeBy, setSpikeBy] = useState("");

  const generateQuery = () => {
    switch (activeTab) {
      case "field":
        if (!fieldName || !fieldValue) return "";
        let fieldQuery = `field(${fieldName}) ${fieldOp} "${fieldValue}"`;
        if (groupByFields.length > 0) {
          fieldQuery += ` by={${groupByFields.join(',')}}`;
        }
        return fieldQuery;

      case "sequence": 
        if (seqStages.filter(s => s.trim()).length < 2) return "";
        const stages = seqStages.filter(s => s.trim()).join(' -> ');
        let seqQuery = `seq(${stages}, within=${seqWithin}`;
        if (seqBy) seqQuery += `, by={${seqBy}}`;
        if (seqStrict !== "none") seqQuery += `, strict=${seqStrict}`;
        seqQuery += ")";
        return seqQuery;

      case "rolling":
        if (!rollExpr) return "";
        let rollQuery = `roll(${rollExpr}, within=${rollWithin}`;
        if (rollBy) rollQuery += `, by={${rollBy}}`;
        rollQuery += ")";
        return rollQuery;

      case "ratio":
        if (!ratioNum || !ratioDen || !ratioK) return "";
        let ratioQuery = `ratio(${ratioNum}:${ratioDen} ${ratioOp} ${ratioK}, within=${ratioWithin}`;
        if (ratioBy) ratioQuery += `, by={${ratioBy}}`;
        ratioQuery += ")";
        return ratioQuery;

      case "spike":
        if (!spikeMetric || !spikeZ) return "";
        let spikeQuery = `spike(${spikeMetric}, z≥${spikeZ}, within=${spikeWithin}, history=${spikeHistory}`;
        if (spikeBy) spikeQuery += `, by={${spikeBy}}`;
        spikeQuery += ")";
        return spikeQuery;

      case "advanced":
        return query;

      default:
        return "";
    }
  };

  const currentQuery = useMemo(() => generateQuery(), [
    activeTab, fieldName, fieldOp, fieldValue, groupByFields,
    seqStages, seqWithin, seqBy, seqStrict,
    rollExpr, rollWithin, rollBy,
    ratioNum, ratioDen, ratioOp, ratioK, ratioWithin, ratioBy,
    spikeMetric, spikeZ, spikeWithin, spikeHistory, spikeBy,
    query
  ]);

  const handleApply = () => {
    const finalQuery = currentQuery;
    if (finalQuery) {
      onApply(finalQuery, { last_seconds: timeRange });
      onOpenChange(false);
    }
  };

  const loadSavedSearch = (search: typeof SAVED_SEARCHES[0]) => {
    setQuery(search.query);
    setActiveTab("advanced");
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-6xl max-h-[95vh] translate-x-[-50%] translate-y-[-50%] border bg-background p-0 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 rounded-lg overflow-hidden">
          
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b bg-muted/50">
            <div>
              <h2 className="text-xl font-semibold">Advanced Filter Builder</h2>
              <p className="text-sm text-muted-foreground">Create complex search filters using the v1.0 DSL specification</p>
            </div>
            <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Time Range:</Label>
                <Select value={timeRange.toString()} onValueChange={(value) => setTimeRange(parseInt(value))}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_RANGES.map(range => (
                      <SelectItem key={range.value} value={range.value.toString()}>
                        {range.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon">
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Main Content */}
            <div className="flex-1 p-6 overflow-y-auto">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-7">
                  <TabsTrigger value="field">Field</TabsTrigger>
                  <TabsTrigger value="sequence">Sequence</TabsTrigger>
                  <TabsTrigger value="rolling">Rolling</TabsTrigger>
                  <TabsTrigger value="ratio">Ratio</TabsTrigger>
                  <TabsTrigger value="spike">Spike</TabsTrigger>
                  <TabsTrigger value="advanced">Advanced</TabsTrigger>
                  <TabsTrigger value="saved">Saved</TabsTrigger>
                </TabsList>

                {/* Field Tab */}
                <TabsContent value="field" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Field Condition</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label>Field Name</Label>
                          <Select value={fieldName} onValueChange={setFieldName}>
                            <SelectTrigger>
                              <SelectValue placeholder={schema.loading ? "Loading fields..." : "Select field"} />
                            </SelectTrigger>
                            <SelectContent>
                              {fieldOptions.length === 0 && !schema.loading ? (
                                <SelectItem value="__no_fields__" disabled>No fields</SelectItem>
                              ) : (
                                fieldOptions.map((field: string) => (
                                  <SelectItem key={field} value={field}>{field}</SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Operator</Label>
                          <Select value={fieldOp} onValueChange={setFieldOp}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FIELD_OPERATORS.map(op => (
                                <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Value</Label>
                          <Input 
                            value={fieldValue} 
                            onChange={(e) => setFieldValue(e.target.value)}
                            placeholder="Enter value"
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Group By (optional)</Label>
                        <Input 
                          value={groupByFields.join(',')} 
                          onChange={(e) => setGroupByFields(e.target.value.split(',').filter(f => f.trim()))}
                          placeholder="user,src_ip,host"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Sequence Tab */}
                <TabsContent value="sequence" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Sequence Detection</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label>Stages (A → B → C)</Label>
                        {seqStages.map((stage, idx) => (
                          <div key={idx} className="flex gap-2 mt-2">
                            <Input 
                              value={stage}
                              onChange={(e) => {
                                const newStages = [...seqStages];
                                newStages[idx] = e.target.value;
                                setSeqStages(newStages);
                              }}
                              placeholder={`Stage ${idx + 1} (e.g., fail[x50], success)`}
                            />
                            {idx === seqStages.length - 1 && (
                              <Button 
                                type="button" 
                                variant="outline" 
                                size="icon"
                                onClick={() => setSeqStages([...seqStages, ""])}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label>Within</Label>
                          <Input 
                            value={seqWithin} 
                            onChange={(e) => setSeqWithin(e.target.value)}
                            placeholder="3m, 5m, 1h"
                          />
                        </div>
                        <div>
                          <Label>Group By</Label>
                          <Input 
                            value={seqBy} 
                            onChange={(e) => setSeqBy(e.target.value)}
                            placeholder="user,src_ip"
                          />
                        </div>
                        <div>
                          <Label>Strict Mode</Label>
                          <Select value={seqStrict} onValueChange={setSeqStrict}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="strict_once">strict_once</SelectItem>
                              <SelectItem value="strict_order">strict_order</SelectItem>
                              <SelectItem value="none">none</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Rolling Tab */}
                <TabsContent value="rolling" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Rolling Aggregation</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label>Expression</Label>
                        <Input 
                          value={rollExpr} 
                          onChange={(e) => setRollExpr(e.target.value)}
                          placeholder="count() > 100, sum(fails) > 50"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Within</Label>
                          <Input 
                            value={rollWithin} 
                            onChange={(e) => setRollWithin(e.target.value)}
                            placeholder="5m, 1h"
                          />
                        </div>
                        <div>
                          <Label>Group By</Label>
                          <Input 
                            value={rollBy} 
                            onChange={(e) => setRollBy(e.target.value)}
                            placeholder="src_ip,user"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Ratio Tab */}
                <TabsContent value="ratio" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Ratio Detection</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-5 gap-4">
                        <div>
                          <Label>Numerator</Label>
                          <Input 
                            value={ratioNum} 
                            onChange={(e) => setRatioNum(e.target.value)}
                            placeholder="fail"
                          />
                        </div>
                        <div>
                          <Label>Denominator</Label>
                          <Input 
                            value={ratioDen} 
                            onChange={(e) => setRatioDen(e.target.value)}
                            placeholder="success"
                          />
                        </div>
                        <div>
                          <Label>Operator</Label>
                          <Select value={ratioOp} onValueChange={setRatioOp}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value=">">&gt;</SelectItem>
                              <SelectItem value=">=">&gt;=</SelectItem>
                              <SelectItem value="<">&lt;</SelectItem>
                              <SelectItem value="<=">&lt;=</SelectItem>
                              <SelectItem value="=">=</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Threshold</Label>
                          <Input 
                            value={ratioK} 
                            onChange={(e) => setRatioK(e.target.value)}
                            placeholder="20"
                          />
                        </div>
                        <div>
                          <Label>Within</Label>
                          <Input 
                            value={ratioWithin} 
                            onChange={(e) => setRatioWithin(e.target.value)}
                            placeholder="10m"
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Group By</Label>
                        <Input 
                          value={ratioBy} 
                          onChange={(e) => setRatioBy(e.target.value)}
                          placeholder="src_ip"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Spike Tab */}
                <TabsContent value="spike" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Spike Detection (Z-Score)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Metric</Label>
                          <Input 
                            value={spikeMetric} 
                            onChange={(e) => setSpikeMetric(e.target.value)}
                            placeholder="auth_fail, downloads"
                          />
                        </div>
                        <div>
                          <Label>Z-Score Threshold</Label>
                          <Input 
                            value={spikeZ} 
                            onChange={(e) => setSpikeZ(e.target.value)}
                            placeholder="3"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label>Within</Label>
                          <Input 
                            value={spikeWithin} 
                            onChange={(e) => setSpikeWithin(e.target.value)}
                            placeholder="5m"
                          />
                        </div>
                        <div>
                          <Label>History</Label>
                          <Input 
                            value={spikeHistory} 
                            onChange={(e) => setSpikeHistory(e.target.value)}
                            placeholder="30d"
                          />
                        </div>
                        <div>
                          <Label>Group By</Label>
                          <Input 
                            value={spikeBy} 
                            onChange={(e) => setSpikeBy(e.target.value)}
                            placeholder="user"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Advanced Tab */}
                <TabsContent value="advanced" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Advanced DSL Query</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div>
                        <Label>Raw DSL Query</Label>
                        <textarea 
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Enter advanced DSL query (seq, roll, ratio, spike, beacon, join, overlay, etc.)"
                          className="min-h-[100px] font-mono w-full p-3 border border-input bg-background rounded-md resize-none"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Saved Searches Tab */}
                <TabsContent value="saved" className="space-y-4">
                  <div className="space-y-4">
                    {SAVED_SEARCHES.map(search => (
                      <Card key={search.id} className="cursor-pointer hover:bg-muted/50" onClick={() => loadSavedSearch(search)}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold">{search.name}</h3>
                                <Badge variant={search.severity === 'critical' ? 'destructive' : search.severity === 'high' ? 'secondary' : 'outline'}>
                                  {search.severity}
                                </Badge>
                                {search.tags.map(tag => (
                                  <Badge key={tag} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                              <p className="text-sm text-muted-foreground">{search.description}</p>
                              <code className="text-xs bg-muted p-1 rounded">{search.query}</code>
                            </div>
                            <Button variant="ghost" size="icon" onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(search.query);
                            }}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* Query Preview Sidebar */}
            <div className="w-80 border-l bg-muted/30 p-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Generated Query</Label>
                  <div className="mt-2 p-3 bg-background rounded border min-h-[100px]">
                    <code className="text-sm font-mono whitespace-pre-wrap">
                      {currentQuery || "Build a query using the tabs"}
                    </code>
                  </div>
                </div>
                
              <div className="space-y-2">
                  <Button 
                    onClick={handleApply} 
                    disabled={!currentQuery}
                    className="w-full"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Apply Filter
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    onClick={() => navigator.clipboard.writeText(currentQuery)}
                    disabled={!currentQuery}
                    className="w-full"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Query
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Time Range:</strong> {TIME_RANGES.find(r => r.value === timeRange)?.label}</p>
                  <p><strong>Active Tab:</strong> {activeTab}</p>
                </div>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}