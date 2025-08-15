"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/ui/ActionButton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Shield, 
  Plus, 
  Search, 
  Filter, 
  Settings,
  PlayCircle,
  PauseCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Edit,
  Trash2
} from "lucide-react";

interface Rule {
  id: string;
  name: string;
  description: string;
  severity: "Critical" | "High" | "Medium" | "Low" | "Info";
  status: "Active" | "Inactive" | "Testing";
  category: string;
  lastTriggered?: string;
  triggerCount: number;
  createdAt: string;
  updatedAt: string;
}

// Mock data since backend rules endpoint might not be fully implemented
const mockRules: Rule[] = [
  {
    id: "rule-001",
    name: "Suspicious Login Activity",
    description: "Detects multiple failed login attempts from the same IP address",
    severity: "High",
    status: "Active",
    category: "Authentication",
    lastTriggered: "2024-08-14T15:30:00Z",
    triggerCount: 42,
    createdAt: "2024-08-01T10:00:00Z",
    updatedAt: "2024-08-14T12:00:00Z"
  },
  {
    id: "rule-002", 
    name: "Privilege Escalation Attempt",
    description: "Monitors for unauthorized privilege escalation activities",
    severity: "Critical",
    status: "Active",
    category: "Privilege Escalation",
    lastTriggered: "2024-08-14T14:15:00Z",
    triggerCount: 8,
    createdAt: "2024-07-15T09:30:00Z",
    updatedAt: "2024-08-10T16:45:00Z"
  },
  {
    id: "rule-003",
    name: "Data Exfiltration Monitor",
    description: "Detects unusual data transfer patterns and large file uploads",
    severity: "High",
    status: "Testing",
    category: "Data Loss Prevention",
    triggerCount: 0,
    createdAt: "2024-08-12T14:20:00Z",
    updatedAt: "2024-08-12T14:20:00Z"
  },
  {
    id: "rule-004",
    name: "Malware Communication",
    description: "Identifies communication patterns typical of malware C&C",
    severity: "Critical",
    status: "Active",
    category: "Malware",
    lastTriggered: "2024-08-13T08:45:00Z",
    triggerCount: 15,
    createdAt: "2024-07-20T11:15:00Z",
    updatedAt: "2024-08-05T09:30:00Z"
  },
  {
    id: "rule-005",
    name: "Network Reconnaissance",
    description: "Detects port scanning and network reconnaissance activities",
    severity: "Medium",
    status: "Inactive",
    category: "Network Security",
    lastTriggered: "2024-08-10T22:30:00Z",
    triggerCount: 125,
    createdAt: "2024-06-01T08:00:00Z",
    updatedAt: "2024-08-11T10:15:00Z"
  }
];

function RulesSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <Card key={i}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-2/3" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-20" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-9" />
                <Skeleton className="h-9 w-9" />
                <Skeleton className="h-9 w-9" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  useEffect(() => {
    // Simulate loading real data
    const timer = setTimeout(() => {
      setRules(mockRules);
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
      case "Active": return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800";
      case "Testing": return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800";
      case "Inactive": return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800";
      default: return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Active": return <CheckCircle className="h-4 w-4" />;
      case "Testing": return <Clock className="h-4 w-4" />;
      case "Inactive": return <PauseCircle className="h-4 w-4" />;
      default: return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const filteredRules = rules.filter(rule => {
    const matchesSearch = rule.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         rule.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         rule.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || rule.category === selectedCategory;
    const matchesStatus = selectedStatus === "all" || rule.status === selectedStatus;
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const categories = ["all", ...Array.from(new Set(rules.map(r => r.category)))];
  const statuses = ["all", "Active", "Testing", "Inactive"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Detection Rules</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Manage and monitor your security detection rules
          </p>
        </div>
        <ActionButton 
          className="gap-2"
          onClick={() => {/* TODO: open create rule modal */}}
          data-action="rules:create:new"
          data-intent="open-modal"
        >
          <Plus className="h-4 w-4" />
          Create Rule
        </ActionButton>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/20">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {rules.filter(r => r.status === "Active").length}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Active Rules</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/20">
                <Clock className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {rules.filter(r => r.status === "Testing").length}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Testing</p>
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
                  {rules.filter(r => r.severity === "Critical" || r.severity === "High").length}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">High Priority</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/20">
                <PlayCircle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {rules.reduce((sum, r) => sum + r.triggerCount, 0)}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Total Triggers</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search rules..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
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
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rules List */}
      {loading ? (
        <RulesSkeleton />
      ) : (
        <div className="space-y-4">
          {filteredRules.map((rule) => (
            <Card key={rule.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
                        {rule.name}
                      </h3>
                      <Badge className="severity" data-level={getSeverityLevel(rule.severity)}>
                        {rule.severity}
                      </Badge>
                      <Badge className={`${getStatusColor(rule.status)} flex items-center gap-1`}>
                        {getStatusIcon(rule.status)}
                        {rule.status}
                      </Badge>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 mb-3">
                      {rule.description}
                    </p>
                    <div className="flex items-center gap-6 text-sm text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <Shield className="h-4 w-4" />
                        {rule.category}
                      </span>
                      {rule.lastTriggered && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          Last: {new Date(rule.lastTriggered).toLocaleDateString()}
                        </span>
                      )}
                      <span>Triggers: {rule.triggerCount}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <ActionButton 
                      variant="ghost" 
                      size="sm" 
                      className="gap-2"
                      onClick={() => {/* TODO: edit rule */}}
                      data-action="rules:item:edit"
                      data-intent="open-modal"
                    >
                      <Edit className="h-4 w-4" />
                      Edit
                    </ActionButton>
                    <ActionButton 
                      variant="ghost" 
                      size="sm" 
                      className="gap-2"
                      onClick={() => {/* TODO: test rule */}}
                      data-action="rules:item:test"
                      data-intent="api"
                      data-endpoint="/api/v2/rules/test"
                    >
                      <PlayCircle className="h-4 w-4" />
                      Test
                    </ActionButton>
                    <ActionButton 
                      variant="ghost" 
                      size="sm" 
                      className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={() => {/* TODO: delete rule */}}
                      data-action="rules:item:delete"
                      data-intent="api"
                      data-endpoint="/api/v2/rules"
                      data-danger="true"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </ActionButton>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {filteredRules.length === 0 && !loading && (
            <Card>
              <CardContent className="p-12 text-center">
                <Shield className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  No rules found
                </h3>
                <p className="text-slate-600 dark:text-slate-400 mb-6">
                  {searchQuery || selectedCategory !== "all" || selectedStatus !== "all"
                    ? "Try adjusting your search criteria"
                    : "Create your first detection rule to get started"
                  }
                </p>
                <ActionButton 
                  className="gap-2"
                  onClick={() => {/* TODO: create first rule */}}
                  data-action="rules:create:first"
                  data-intent="open-modal"
                >
                  <Plus className="h-4 w-4" />
                  Create Rule
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
