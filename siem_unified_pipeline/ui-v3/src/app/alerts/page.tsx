"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/ui/ActionButton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  AlertTriangle, 
  Search, 
  Filter, 
  Download,
  RefreshCw,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  User,
  Globe,
  Calendar,
  TrendingUp,
  AlertCircle
} from "lucide-react";

interface Alert {
  id: string;
  title: string;
  description: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  status: "Open" | "Investigating" | "Resolved" | "False Positive";
  source: string;
  category: string;
  timestamp: string;
  assignee?: string;
  ruleId: string;
  eventCount: number;
  affectedAssets: string[];
}

// Mock data since backend alerts endpoint returns 500 error
const mockAlerts: Alert[] = [
  {
    id: "alert-001",
    title: "Multiple Failed Login Attempts Detected",
    description: "Detected 15 failed login attempts from IP 192.168.1.100 targeting user 'admin' within 5 minutes",
    severity: "High",
    status: "Open",
    source: "192.168.1.100",
    category: "Authentication",
    timestamp: "2024-08-14T20:30:00Z",
    ruleId: "rule-001",
    eventCount: 15,
    affectedAssets: ["web-server-01", "auth-service"]
  },
  {
    id: "alert-002",
    title: "Privilege Escalation Attempt",
    description: "Unauthorized attempt to escalate privileges detected on host server-prod-01",
    severity: "Critical",
    status: "Investigating",
    source: "server-prod-01",
    category: "Privilege Escalation",
    timestamp: "2024-08-14T19:45:00Z",
    assignee: "security-team",
    ruleId: "rule-002",
    eventCount: 3,
    affectedAssets: ["server-prod-01", "database-cluster"]
  },
  {
    id: "alert-003",
    title: "Suspicious Network Communication",
    description: "Detected communication with known malicious IP address 203.0.113.42",
    severity: "Critical",
    status: "Open",
    source: "workstation-05",
    category: "Malware",
    timestamp: "2024-08-14T18:20:00Z",
    ruleId: "rule-004",
    eventCount: 8,
    affectedAssets: ["workstation-05", "network-segment-A"]
  },
  {
    id: "alert-004",
    title: "Unusual Data Transfer Pattern",
    description: "Large volume of data (2.5GB) transferred to external location during off-hours",
    severity: "Medium",
    status: "Resolved",
    source: "file-server-02",
    category: "Data Loss Prevention",
    timestamp: "2024-08-14T17:15:00Z",
    assignee: "data-protection-team",
    ruleId: "rule-003",
    eventCount: 1,
    affectedAssets: ["file-server-02"]
  },
  {
    id: "alert-005",
    title: "Port Scanning Activity",
    description: "Systematic port scanning detected from internal host targeting network infrastructure",
    severity: "Medium",
    status: "False Positive",
    source: "10.0.0.42",
    category: "Network Security",
    timestamp: "2024-08-14T16:30:00Z",
    assignee: "network-team",
    ruleId: "rule-005",
    eventCount: 1024,
    affectedAssets: ["network-scanner", "infrastructure"]
  }
];

function AlertsSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <Card key={i}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-6 w-24" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-9 w-16" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  useEffect(() => {
    // Simulate loading real data
    const timer = setTimeout(() => {
      setAlerts(mockAlerts);
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const getSeverityLevel = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "critical": return "critical";
      case "high": return "high";
      case "medium": return "medium";
      case "low": return "low";
      default: return "low";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Open": return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800";
      case "Investigating": return "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800";
      case "Resolved": return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800";
      case "False Positive": return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800";
      default: return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Open": return <AlertCircle className="h-4 w-4" />;
      case "Investigating": return <Clock className="h-4 w-4" />;
      case "Resolved": return <CheckCircle className="h-4 w-4" />;
      case "False Positive": return <XCircle className="h-4 w-4" />;
      default: return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const filteredAlerts = alerts.filter(alert => {
    const matchesSearch = alert.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         alert.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         alert.source.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity = selectedSeverity === "all" || alert.severity === selectedSeverity;
    const matchesStatus = selectedStatus === "all" || alert.status === selectedStatus;
    const matchesCategory = selectedCategory === "all" || alert.category === selectedCategory;
    
    return matchesSearch && matchesSeverity && matchesStatus && matchesCategory;
  });

  const severities = ["all", "Critical", "High", "Medium", "Low"];
  const statuses = ["all", "Open", "Investigating", "Resolved", "False Positive"];
  const categories = ["all", ...Array.from(new Set(alerts.map(a => a.category)))];

  return (
    <div className="space-y-6">
      {/* Watermark */}
      <div className="fixed bottom-3 right-4 z-50 pointer-events-none select-none opacity-40 text-xs font-semibold bg-muted text-muted-foreground px-2 py-1 rounded">
        UI-V3 View (Alerts)
      </div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Security Alerts</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Monitor and investigate security incidents
          </p>
        </div>
        <div className="flex gap-2">
          <ActionButton 
            variant="outline" 
            className="gap-2"
            onClick={() => {/* TODO: implement refresh */}}
            data-action="alerts:list:refresh"
            data-intent="api"
            data-endpoint="/api/v2/alerts"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </ActionButton>
          <ActionButton 
            variant="outline" 
            className="gap-2"
            onClick={() => {/* TODO: implement export */}}
            data-action="alerts:list:export"
            data-intent="api"
            data-endpoint="/api/v2/alerts/export"
          >
            <Download className="h-4 w-4" />
            Export
          </ActionButton>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/20">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {alerts.filter(a => a.status === "Open").length}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Open</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/20">
                <Clock className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {alerts.filter(a => a.status === "Investigating").length}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Investigating</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/20">
                <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {alerts.filter(a => a.severity === "Critical" || a.severity === "High").length}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">High Priority</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/20">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {alerts.filter(a => a.status === "Resolved").length}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Resolved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/20">
                <TrendingUp className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {alerts.reduce((sum, a) => sum + a.eventCount, 0)}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Total Events</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search alerts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <select
                value={selectedSeverity}
                onChange={(e) => setSelectedSeverity(e.target.value)}
                className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {severities.map(severity => (
                  <option key={severity} value={severity}>
                    {severity === "all" ? "All Severities" : severity}
                  </option>
                ))}
              </select>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {statuses.map(status => (
                  <option key={status} value={status}>
                    {status === "all" ? "All Statuses" : status}
                  </option>
                ))}
              </select>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {categories.map(category => (
                  <option key={category} value={category}>
                    {category === "all" ? "All Categories" : category}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alerts List */}
      {loading ? (
        <AlertsSkeleton />
      ) : (
        <div className="space-y-4">
          {filteredAlerts.map((alert) => (
            <Card key={alert.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
                        {alert.title}
                      </h3>
                      <Badge className="severity" data-level={getSeverityLevel(alert.severity)}>
                        {alert.severity}
                      </Badge>
                      <Badge className={`${getStatusColor(alert.status)} flex items-center gap-1`}>
                        {getStatusIcon(alert.status)}
                        {alert.status}
                      </Badge>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 mb-3">
                      {alert.description}
                    </p>
                    <div className="flex items-center gap-6 text-sm text-slate-500 dark:text-slate-400 mb-2">
                      <span className="flex items-center gap-1">
                        <Globe className="h-4 w-4" />
                        {alert.source}
                      </span>
                      <span className="flex items-center gap-1">
                        <Shield className="h-4 w-4" />
                        {alert.category}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {new Date(alert.timestamp).toLocaleString()}
                      </span>
                      <span>Events: {alert.eventCount}</span>
                    </div>
                    {alert.assignee && (
                      <div className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                        <User className="h-4 w-4" />
                        Assigned to: {alert.assignee}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <ActionButton 
                      variant="outline" 
                      size="sm" 
                      className="gap-2"
                      onClick={() => {/* TODO: open alert details */}}
                      data-action="alerts:item:view-details"
                      data-intent="open-modal"
                    >
                      <Eye className="h-4 w-4" />
                      View Details
                    </ActionButton>
                    {alert.status === "Open" && (
                      <ActionButton 
                        size="sm" 
                        className="gap-2"
                        onClick={() => {/* TODO: start investigation */}}
                        data-action="alerts:item:investigate"
                        data-intent="navigate"
                      >
                        <Clock className="h-4 w-4" />
                        Investigate
                      </ActionButton>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {filteredAlerts.length === 0 && !loading && (
            <Card>
              <CardContent className="p-12 text-center">
                <AlertTriangle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  No alerts found
                </h3>
                <p className="text-slate-600 dark:text-slate-400 mb-6">
                  {searchQuery || selectedSeverity !== "all" || selectedStatus !== "all" || selectedCategory !== "all"
                    ? "Try adjusting your search criteria"
                    : "No security alerts at this time"
                  }
                </p>
                <ActionButton 
                  variant="outline" 
                  className="gap-2"
                  onClick={() => window.location.reload()}
                  data-action="alerts:list:refresh-empty"
                  data-intent="api"
                  data-endpoint="/api/v2/alerts"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh Alerts
                </ActionButton>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
