import { useState, useMemo } from 'react';
import { Search, Database, Code, Eye, Copy } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/Sheet';
import { useToast } from '@/hooks/useToast';
import type { MultiSelectOption } from '@/components/ui/MultiSelect';

// Vendor Log Source Mapping Data
export interface VendorLogSource {
  vendor: string;
  source: string;
  sampleLog: string;
  keyFields: string[];
  clickhouseColumns: string[];
  uiFilterChips: string[];
  grokPattern: string;
  notes: string;
  category: 'Network' | 'Security' | 'System' | 'Web' | 'Database';
  complexity: 'Simple' | 'Medium' | 'Complex';
}

const VENDOR_LOG_SOURCES: VendorLogSource[] = [
  {
    vendor: 'Palo Alto',
    source: 'Firewall',
    sampleLog: '<180>May 6 16:43:53 paloalto LEEF:1.0|Palo Alto|...|src=10.2.75.41|dst=192.168.178.180|srcPort=63508|dstPort=80|proto=tcp|action=alert|severity=medium',
    keyFields: ['src_ip', 'dest_ip', 'src_port', 'dest_port', 'protocol', 'action', 'severity'],
    clickhouseColumns: ['src_ip', 'dest_ip', 'src_port', 'dest_port', 'protocol', 'action', 'severity'],
    uiFilterChips: ['IP', 'Port', 'Protocol', 'Action', 'Severity'],
    grokPattern: '%{SYSLOGTIMESTAMP} %{HOST} LEEF:%{DATA}|%{DATA:vendor}|%{DATA:product}|%{DATA:version}|%{DATA:event_name}|%{GREEDYDATA:fields}',
    notes: 'Use kv filter after fields for KV pairs',
    category: 'Network',
    complexity: 'Medium'
  },
  {
    vendor: 'Cisco',
    source: 'ASA',
    sampleLog: '<166>Jun 16 2024 12:34:56 firewall %ASA-6-302013: Built outbound TCP connection 12345 for outside:192.168.1.1/80 to inside:10.0.0.1/12345',
    keyFields: ['event_id', 'src_ip', 'dest_ip', 'src_port', 'dest_port', 'protocol', 'action'],
    clickhouseColumns: ['event_id', 'src_ip', 'dest_ip', 'src_port', 'dest_port', 'protocol', 'action'],
    uiFilterChips: ['Event ID', 'IP', 'Port', 'Action'],
    grokPattern: '%{SYSLOGTIMESTAMP} %{HOST} %{CISCOFW}: %{WORD:event_id}: %{WORD:action} %{WORD:protocol} connection %{NUMBER:conn_id} for %{WORD:src_zone}:%{IP:src_ip}/%{NUMBER:src_port} to %{WORD:dest_zone}:%{IP:dest_ip}/%{NUMBER:dest_port}',
    notes: 'Cisco format varies by message type',
    category: 'Network',
    complexity: 'Complex'
  },
  {
    vendor: 'Microsoft',
    source: 'Windows Security',
    sampleLog: '2024-06-16T12:34:56.789Z 4624 Microsoft-Windows-Security-Auditing 12345 S-1-5-21-... user1 WORKSTATION1 0x1234 10 S-1-5-18 NT AUTHORITY\\SYSTEM 0x5678 3 3 0x1234 0x5678 192.168.1.100 12345',
    keyFields: ['event_id', 'user', 'src_ip', 'src_port', 'workstation'],
    clickhouseColumns: ['event_id', 'user', 'src_ip', 'src_port', 'workstation'],
    uiFilterChips: ['Event ID', 'User', 'IP', 'Workstation'],
    grokPattern: '%{TIMESTAMP_ISO8601} %{NUMBER:event_id} %{DATA:source} %{NUMBER:record_number} %{DATA:user_sid} %{DATA:user} %{DATA:workstation} %{DATA:logon_type} %{DATA:auth_package} %{DATA:logon_process} %{DATA:src_ip} %{NUMBER:src_port}',
    notes: 'Requires Windows Event XML parser for full fidelity',
    category: 'Security',
    complexity: 'Complex'
  },
  {
    vendor: 'Apache',
    source: 'Access Logs',
    sampleLog: '192.168.1.100 - - [16/Jun/2024:12:34:56 +0000] "GET /index.html HTTP/1.1" 200 1234 "http://example.com" "Mozilla/5.0"',
    keyFields: ['src_ip', 'user', 'timestamp', 'method', 'url', 'status_code', 'bytes', 'referrer', 'user_agent'],
    clickhouseColumns: ['src_ip', 'user', 'timestamp', 'method', 'url', 'status_code', 'bytes', 'referrer', 'user_agent'],
    uiFilterChips: ['IP', 'Method', 'Status', 'URL'],
    grokPattern: '%{IP:src_ip} %{USER:user} %{USER:auth} \\[%{HTTPDATE:timestamp}\\] "%{WORD:method} %{URIPATHPARAM:url} HTTP/%{NUMBER:http_version}" %{NUMBER:status_code} %{NUMBER:bytes} "%{DATA:referrer}" "%{DATA:user_agent}"',
    notes: 'Use parse_apache_log in Vector',
    category: 'Web',
    complexity: 'Simple'
  },
  {
    vendor: 'Nginx',
    source: 'Access Logs',
    sampleLog: '192.168.1.100 - - [16/Jun/2024:12:34:56 +0000] "POST /api/data HTTP/1.1" 201 5678 "http://example.com" "curl/7.68.0"',
    keyFields: ['src_ip', 'user', 'timestamp', 'method', 'url', 'status_code', 'bytes', 'referrer', 'user_agent'],
    clickhouseColumns: ['src_ip', 'user', 'timestamp', 'method', 'url', 'status_code', 'bytes', 'referrer', 'user_agent'],
    uiFilterChips: ['IP', 'Method', 'Status', 'URL'],
    grokPattern: '%{IP:src_ip} %{USER:user} %{USER:auth} \\[%{HTTPDATE:timestamp}\\] "%{WORD:method} %{URIPATHPARAM:url} HTTP/%{NUMBER:http_version}" %{NUMBER:status_code} %{NUMBER:bytes} "%{DATA:referrer}" "%{DATA:user_agent}"',
    notes: 'Nginx uses same format as Apache',
    category: 'Web',
    complexity: 'Simple'
  },
  {
    vendor: 'Linux',
    source: 'Syslog',
    sampleLog: 'Jun 16 12:34:56 server sshd[12345]: Failed password for user1 from 192.168.1.100 port 12345 ssh2',
    keyFields: ['timestamp', 'host', 'process', 'pid', 'message', 'src_ip', 'src_port', 'user'],
    clickhouseColumns: ['timestamp', 'host', 'process', 'pid', 'message', 'src_ip', 'src_port', 'user'],
    uiFilterChips: ['Host', 'Process', 'IP', 'User'],
    grokPattern: '%{SYSLOGTIMESTAMP:timestamp} %{HOST:host} %{WORD:process}(?:\\[%{NUMBER:pid}\\])?: %{GREEDYDATA:message}',
    notes: 'Extract additional KV pairs from message',
    category: 'System',
    complexity: 'Medium'
  },
  {
    vendor: 'OCSF',
    source: 'JSON',
    sampleLog: '{"timestamp":"2024-06-16T12:34:56Z","severity":"high","category":"network","src_ip":"10.0.0.1","dest_ip":"192.168.1.1","event":"port_scan"}',
    keyFields: ['timestamp', 'severity', 'category', 'src_ip', 'dest_ip', 'event'],
    clickhouseColumns: ['timestamp', 'severity', 'category', 'src_ip', 'dest_ip', 'event'],
    uiFilterChips: ['Severity', 'Category', 'IP'],
    grokPattern: 'Direct JSON mapping',
    notes: 'Use JSONEachRow engine',
    category: 'Security',
    complexity: 'Simple'
  }
];

const CATEGORY_OPTIONS: MultiSelectOption[] = [
  { value: 'Network', label: 'Network' },
  { value: 'Security', label: 'Security' },
  { value: 'System', label: 'System' },
  { value: 'Web', label: 'Web' },
  { value: 'Database', label: 'Database' }
];

const COMPLEXITY_OPTIONS: MultiSelectOption[] = [
  { value: 'Simple', label: 'Simple' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Complex', label: 'Complex' }
];

interface VendorLogSourceMappingProps {
  className?: string;
}

export function VendorLogSourceMapping({ className }: VendorLogSourceMappingProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedComplexities, setSelectedComplexities] = useState<string[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<VendorLogSource | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Filter vendors based on search and filters
  const filteredVendors = useMemo(() => {
    return VENDOR_LOG_SOURCES.filter(vendor => {
      const matchesSearch = !searchTerm || 
        vendor.vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vendor.source.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vendor.keyFields.some(field => field.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesCategory = selectedCategories.length === 0 || 
        selectedCategories.includes(vendor.category);
      
      const matchesComplexity = selectedComplexities.length === 0 || 
        selectedComplexities.includes(vendor.complexity);
      
      return matchesSearch && matchesCategory && matchesComplexity;
    });
  }, [searchTerm, selectedCategories, selectedComplexities]);

  const handleCopyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Copied to clipboard',
        description: `${type} copied successfully`,
        variant: 'default'
      });
    } catch (error) {
      toast({
        title: 'Copy failed',
        description: 'Failed to copy to clipboard',
        variant: 'destructive'
      });
    }
  };

  const handleViewDetails = (vendor: VendorLogSource) => {
    setSelectedVendor(vendor);
    setIsDetailOpen(true);
  };

  const getCategoryBadgeVariant = (category: string) => {
    switch (category) {
      case 'Network': return 'default' as const;
      case 'Security': return 'critical' as const;
      case 'System': return 'secondary' as const;
      case 'Web': return 'outline' as const;
      case 'Database': return 'default' as const;
      default: return 'default' as const;
    }
  };

  const getComplexityBadgeVariant = (complexity: string) => {
    switch (complexity) {
      case 'Simple': return 'default' as const;
      case 'Medium': return 'secondary' as const;
      case 'Complex': return 'critical' as const;
      default: return 'default' as const;
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendor Log Source Mapping</h1>
          <p className="text-muted-foreground">
            Ready-to-use parsers, samples, and UI filters for 22+ vendors
          </p>
        </div>
        
        <Button 
          onClick={() => handleCopyToClipboard(
            `CREATE TABLE IF NOT EXISTS dev.events (
    event_id        String,
    tenant_id       String,
    ingest_ts       DateTime64(6),
    source_type     LowCardinality(String),
    severity        LowCardinality(String),
    src_ip          IPv6,
    dest_ip         IPv6,
    src_port        Nullable(UInt16),
    dest_port       Nullable(UInt16),
    protocol        LowCardinality(String),
    action          LowCardinality(String),
    user            Nullable(String),
    event_category  LowCardinality(String),
    raw_message     String CODEC(ZSTD(3))
)
ENGINE = MergeTree()
PARTITION BY (toYYYYMMDD(ingest_ts), source_type)
ORDER BY (tenant_id, ingest_ts, severity)
TTL ingest_ts + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;`,
            'ClickHouse Table DDL'
          )}
          variant="outline"
          className="flex items-center gap-2"
        >
          <Database className="h-4 w-4" />
          Copy Table DDL
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search vendors, sources, or fields..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
            />
          </div>

          {/* Category Filter */}
          <div className="min-w-48">
            <MultiSelect
              options={CATEGORY_OPTIONS}
              value={selectedCategories}
              onChange={setSelectedCategories}
              placeholder="All Categories"
              searchPlaceholder="Search categories..."
              maxDisplayed={2}
            />
          </div>

          {/* Complexity Filter */}
          <div className="min-w-48">
            <MultiSelect
              options={COMPLEXITY_OPTIONS}
              value={selectedComplexities}
              onChange={setSelectedComplexities}
              placeholder="All Complexities"
              searchPlaceholder="Search complexities..."
              maxDisplayed={2}
            />
          </div>

          {/* Results count */}
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            {filteredVendors.length} of {VENDOR_LOG_SOURCES.length} vendors
          </div>
        </div>
      </Card>

      {/* Vendor Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredVendors.map((vendor, index) => (
          <Card key={index} className="p-4 hover:shadow-md transition-shadow cursor-pointer">
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{vendor.vendor}</h3>
                  <p className="text-sm text-muted-foreground">{vendor.source}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <Badge variant={getCategoryBadgeVariant(vendor.category)} className="text-xs">
                    {vendor.category}
                  </Badge>
                  <Badge variant={getComplexityBadgeVariant(vendor.complexity)} className="text-xs">
                    {vendor.complexity}
                  </Badge>
                </div>
              </div>

              {/* Sample Log Preview */}
              <div className="bg-muted p-2 rounded text-xs font-mono">
                <div className="text-muted-foreground mb-1">Sample Log:</div>
                <div className="truncate">
                  {vendor.sampleLog.length > 80 ? `${vendor.sampleLog.substring(0, 80)}...` : vendor.sampleLog}
                </div>
              </div>

              {/* Key Fields */}
              <div>
                <div className="text-sm font-medium mb-2">Key Fields ({vendor.keyFields.length})</div>
                <div className="flex flex-wrap gap-1">
                  {vendor.keyFields.slice(0, 4).map((field, fieldIndex) => (
                    <Badge key={fieldIndex} variant="outline" className="text-xs">
                      {field}
                    </Badge>
                  ))}
                  {vendor.keyFields.length > 4 && (
                    <Badge variant="outline" className="text-xs">
                      +{vendor.keyFields.length - 4} more
                    </Badge>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewDetails(vendor);
                  }}
                  className="flex items-center gap-1"
                >
                  <Eye className="h-3 w-3" />
                  View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyToClipboard(vendor.grokPattern, 'Grok Pattern');
                  }}
                  className="flex items-center gap-1"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {filteredVendors.length === 0 && (
        <Card className="p-12 text-center">
          <div className="text-muted-foreground">
            {searchTerm || selectedCategories.length > 0 || selectedComplexities.length > 0 ? (
              <>No vendors match your current filters</>
            ) : (
              <>No vendor log sources available</>
            )}
          </div>
        </Card>
      )}

      {/* Detail Sheet */}
      <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <SheetContent className="sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              {selectedVendor?.vendor} - {selectedVendor?.source}
            </SheetTitle>
            <SheetDescription>
              Complete parser configuration and field mapping details
            </SheetDescription>
          </SheetHeader>

          {selectedVendor && (
            <div className="space-y-6 mt-6">
              {/* Metadata */}
              <div className="flex items-center gap-4">
                <Badge variant={getCategoryBadgeVariant(selectedVendor.category)}>
                  {selectedVendor.category}
                </Badge>
                <Badge variant={getComplexityBadgeVariant(selectedVendor.complexity)}>
                  {selectedVendor.complexity}
                </Badge>
              </div>

              {/* Sample Log */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">Sample Raw Log</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyToClipboard(selectedVendor.sampleLog, 'Sample Log')}
                    className="flex items-center gap-1"
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </Button>
                </div>
                <div className="bg-muted p-3 rounded font-mono text-sm break-all">
                  {selectedVendor.sampleLog}
                </div>
              </div>

              {/* Key Fields */}
              <div>
                <h3 className="font-semibold mb-2">Key Fields Extracted</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedVendor.keyFields.map((field, index) => (
                    <Badge key={index} variant="outline">
                      {field}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* ClickHouse Columns */}
              <div>
                <h3 className="font-semibold mb-2">ClickHouse Columns</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedVendor.clickhouseColumns.map((column, index) => (
                    <Badge key={index} variant="secondary">
                      {column}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* UI Filter Chips */}
              <div>
                <h3 className="font-semibold mb-2">UI Filter Chips</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedVendor.uiFilterChips.map((chip, index) => (
                    <Badge key={index} variant="critical">
                      {chip}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Grok Pattern */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">Grok / Regex Pattern</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyToClipboard(selectedVendor.grokPattern, 'Grok Pattern')}
                    className="flex items-center gap-1"
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </Button>
                </div>
                <div className="bg-muted p-3 rounded font-mono text-sm break-all">
                  {selectedVendor.grokPattern}
                </div>
              </div>

              {/* Notes */}
              {selectedVendor.notes && (
                <div>
                  <h3 className="font-semibold mb-2">Implementation Notes</h3>
                  <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded text-sm">
                    {selectedVendor.notes}
                  </div>
                </div>
              )}

              {/* Parser Registry Entry */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">Parser Registry Entry (YAML)</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const yamlConfig = `vendor: ${selectedVendor.vendor}
fields:
${selectedVendor.keyFields.map(field => `  - {name: ${field}, grok: "${field}=%{WORD:${field}}"}`).join('\n')}`;
                      handleCopyToClipboard(yamlConfig, 'YAML Config');
                    }}
                    className="flex items-center gap-1"
                  >
                    <Copy className="h-3 w-3" />
                    Copy YAML
                  </Button>
                </div>
                <div className="bg-muted p-3 rounded font-mono text-sm">
                  <div>vendor: {selectedVendor.vendor}</div>
                  <div>fields:</div>
                  {selectedVendor.keyFields.map((field, index) => (
                    <div key={index} className="ml-2">
                      - {`{name: ${field}, grok: "${field}=%{WORD:${field}}"}`}
                    </div>
                  ))}
                </div>
              </div>

              {/* Test Command */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">Test Command</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const testCommand = `curl -X POST http://localhost:8080/v1/logs/search \\
     -H "Content-Type: application/json" \\
     -d '{"source_type":"${selectedVendor.vendor.toLowerCase().replace(' ', '_')}","severity":"Critical"}'`;
                      handleCopyToClipboard(testCommand, 'Test Command');
                    }}
                    className="flex items-center gap-1"
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </Button>
                </div>
                <div className="bg-muted p-3 rounded font-mono text-sm">
                  curl -X POST http://localhost:8080/v1/logs/search \<br />
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;-H &quot;Content-Type: application/json&quot; \<br />
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;-d &apos;{`{"source_type":"${selectedVendor.vendor.toLowerCase().replace(" ", "_")}","severity":"Critical"}`}&apos;
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default VendorLogSourceMapping;