"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  FileText, 
  Plus, 
  Search, 
  Download, 
  Calendar,
  BarChart3,
  PieChart,
  TrendingUp,
  Clock,
  CheckCircle,
  PlayCircle,
  Settings,
  Eye,
  Share2,
  Filter
} from "lucide-react";

interface Report {
  id: string;
  name: string;
  description: string;
  type: "Security Overview" | "Threat Analysis" | "Compliance" | "Performance" | "Custom";
  status: "Generated" | "Generating" | "Scheduled" | "Failed";
  format: "PDF" | "CSV" | "JSON" | "HTML";
  schedule?: "Daily" | "Weekly" | "Monthly" | "On-Demand";
  lastGenerated?: string;
  nextScheduled?: string;
  size?: string;
  createdBy: string;
  createdAt: string;
}

// Mock data for reports
const mockReports: Report[] = [
  {
    id: "report-001",
    name: "Daily Security Summary",
    description: "Comprehensive overview of security events, alerts, and system health for the last 24 hours",
    type: "Security Overview",
    status: "Generated",
    format: "PDF",
    schedule: "Daily",
    lastGenerated: "2024-08-14T06:00:00Z",
    nextScheduled: "2024-08-15T06:00:00Z",
    size: "2.4 MB",
    createdBy: "security-team",
    createdAt: "2024-07-01T10:00:00Z"
  },
  {
    id: "report-002",
    name: "Threat Intelligence Report",
    description: "Weekly analysis of detected threats, attack patterns, and security trends",
    type: "Threat Analysis",
    status: "Generated",
    format: "PDF",
    schedule: "Weekly",
    lastGenerated: "2024-08-12T09:00:00Z",
    nextScheduled: "2024-08-19T09:00:00Z",
    size: "8.7 MB",
    createdBy: "threat-intel-team",
    createdAt: "2024-06-15T14:30:00Z"
  },
  {
    id: "report-003",
    name: "GDPR Compliance Audit",
    description: "Monthly compliance report for GDPR data protection requirements",
    type: "Compliance",
    status: "Generating",
    format: "HTML",
    schedule: "Monthly",
    nextScheduled: "2024-09-01T08:00:00Z",
    createdBy: "compliance-team",
    createdAt: "2024-08-01T11:20:00Z"
  },
  {
    id: "report-004",
    name: "System Performance Metrics",
    description: "Performance analysis of SIEM infrastructure and processing capabilities",
    type: "Performance",
    status: "Generated",
    format: "CSV",
    schedule: "Weekly",
    lastGenerated: "2024-08-13T12:00:00Z",
    nextScheduled: "2024-08-20T12:00:00Z",
    size: "1.2 MB",
    createdBy: "ops-team",
    createdAt: "2024-07-10T16:45:00Z"
  },
  {
    id: "report-005",
    name: "Custom Alert Analysis",
    description: "Ad-hoc report analyzing alert patterns for the last 30 days",
    type: "Custom",
    status: "Failed",
    format: "JSON",
    schedule: "On-Demand",
    createdBy: "analyst-user",
    createdAt: "2024-08-14T15:30:00Z"
  }
];

function ReportsSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-24" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-16" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  useEffect(() => {
    // Simulate loading real data
    const timer = setTimeout(() => {
      setReports(mockReports);
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const getTypeColor = (type: string) => {
    switch (type) {
      case "Security Overview": return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800";
      case "Threat Analysis": return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800";
      case "Compliance": return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800";
      case "Performance": return "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800";
      case "Custom": return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800";
      default: return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Generated": return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800";
      case "Generating": return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800";
      case "Scheduled": return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800";
      case "Failed": return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800";
      default: return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Generated": return <CheckCircle className="h-4 w-4" />;
      case "Generating": return <Clock className="h-4 w-4 animate-spin" />;
      case "Scheduled": return <Calendar className="h-4 w-4" />;
      case "Failed": return <Clock className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "Security Overview": return <BarChart3 className="h-4 w-4" />;
      case "Threat Analysis": return <TrendingUp className="h-4 w-4" />;
      case "Compliance": return <CheckCircle className="h-4 w-4" />;
      case "Performance": return <PieChart className="h-4 w-4" />;
      case "Custom": return <Settings className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const filteredReports = reports.filter(report => {
    const matchesSearch = report.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         report.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         report.createdBy.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = selectedType === "all" || report.type === selectedType;
    const matchesStatus = selectedStatus === "all" || report.status === selectedStatus;
    
    return matchesSearch && matchesType && matchesStatus;
  });

  const types = ["all", "Security Overview", "Threat Analysis", "Compliance", "Performance", "Custom"];
  const statuses = ["all", "Generated", "Generating", "Scheduled", "Failed"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Security Reports</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Generate and manage security and compliance reports
          </p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Create Report
        </Button>
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
                  {reports.filter(r => r.status === "Generated").length}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Generated</p>
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
                  {reports.filter(r => r.status === "Generating").length}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">In Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100 dark:bg-yellow-900/20">
                <Calendar className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {reports.filter(r => r.schedule && r.schedule !== "On-Demand").length}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Scheduled</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/20">
                <FileText className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {reports.length}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Total Reports</p>
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
                  placeholder="Search reports..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {types.map(type => (
                  <option key={type} value={type}>
                    {type === "all" ? "All Types" : type}
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

      {/* Reports List */}
      {loading ? (
        <ReportsSkeleton />
      ) : (
        <div className="space-y-4">
          {filteredReports.map((report) => (
            <Card key={report.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      {getTypeIcon(report.type)}
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
                        {report.name}
                      </h3>
                      <Badge className={getTypeColor(report.type)}>
                        {report.type}
                      </Badge>
                      <Badge className={`${getStatusColor(report.status)} flex items-center gap-1`}>
                        {getStatusIcon(report.status)}
                        {report.status}
                      </Badge>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 mb-3">
                      {report.description}
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-slate-500 dark:text-slate-400">
                      <div>
                        <span className="font-medium">Format:</span> {report.format}
                      </div>
                      {report.schedule && (
                        <div>
                          <span className="font-medium">Schedule:</span> {report.schedule}
                        </div>
                      )}
                      {report.lastGenerated && (
                        <div>
                          <span className="font-medium">Last Generated:</span> {new Date(report.lastGenerated).toLocaleDateString()}
                        </div>
                      )}
                      {report.size && (
                        <div>
                          <span className="font-medium">Size:</span> {report.size}
                        </div>
                      )}
                    </div>
                    {report.nextScheduled && (
                      <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        <span className="font-medium">Next Scheduled:</span> {new Date(report.nextScheduled).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {report.status === "Generated" && (
                      <>
                        <Button variant="outline" size="sm" className="gap-2">
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                        <Button variant="outline" size="sm" className="gap-2">
                          <Download className="h-4 w-4" />
                          Download
                        </Button>
                        <Button variant="outline" size="sm" className="gap-2">
                          <Share2 className="h-4 w-4" />
                          Share
                        </Button>
                      </>
                    )}
                    {report.status === "Failed" && (
                      <Button size="sm" className="gap-2">
                        <PlayCircle className="h-4 w-4" />
                        Retry
                      </Button>
                    )}
                    {report.status === "Scheduled" && (
                      <Button variant="outline" size="sm" className="gap-2">
                        <PlayCircle className="h-4 w-4" />
                        Run Now
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {filteredReports.length === 0 && !loading && (
            <Card>
              <CardContent className="p-12 text-center">
                <FileText className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  No reports found
                </h3>
                <p className="text-slate-600 dark:text-slate-400 mb-6">
                  {searchQuery || selectedType !== "all" || selectedStatus !== "all"
                    ? "Try adjusting your search criteria"
                    : "Create your first security report to get started"
                  }
                </p>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Report
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
