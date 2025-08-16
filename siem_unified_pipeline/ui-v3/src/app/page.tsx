"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Activity, 
  Search, 
  BarChart3, 
  Shield, 
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Database,
  Clock
} from "lucide-react";
import Link from "next/link";

export default function Home() {
  const quickActions = [
    {
      title: "Search Events",
      description: "Query and analyze security events",
      icon: Search,
      href: "/ui/v3/search",
      color: "bg-blue-500"
    },
    {
      title: "Dashboard",
      description: "View security metrics and insights",
      icon: BarChart3,
      href: "/ui/v3/dashboard",
      color: "bg-green-500"
    },
    {
      title: "Health Check",
      description: "Monitor system health and status",
      icon: Activity,
      href: "/ui/v3/health",
      color: "bg-orange-500"
    }
  ];

  const systemStats = [
    { label: "Events Today", value: "245,832", icon: Database, trend: "+12%" },
    { label: "Active Alerts", value: "23", icon: AlertTriangle, trend: "-8%" },
    { label: "System Uptime", value: "99.9%", icon: Clock, trend: "stable" },
    { label: "Connected Sources", value: "12", icon: Shield, trend: "+1" }
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Watermark */}
      <div className="fixed bottom-3 right-4 z-50 pointer-events-none select-none  text-xs font-semibold bg-muted text-muted-foreground px-2 py-1 rounded">
        UI-V3 View (Home)
      </div>
      {/* Welcome Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Welcome to SIEM v3</h1>
        <p className="text-muted-foreground">
          Monitor, analyze, and respond to security events in real-time
        </p>
      </div>

      {/* System Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {systemStats.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <TrendingUp className="h-3 w-3 text-green-500" />
                    <span className="text-xs text-green-500">{stat.trend}</span>
                  </div>
                </div>
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <stat.icon className="h-4 w-4 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {quickActions.map((action, index) => (
            <Card key={index} className="group hover:shadow-md transition-shadow cursor-pointer">
              <Link href={action.href}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className={`h-10 w-10 rounded-lg ${action.color} flex items-center justify-center`}>
                      <action.icon className="h-5 w-5 text-white" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                  <CardTitle className="text-lg">{action.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{action.description}</p>
                </CardContent>
              </Link>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { time: "2 minutes ago", event: "High severity alert triggered", type: "alert" },
              { time: "15 minutes ago", event: "New log source connected", type: "info" },
              { time: "1 hour ago", event: "Search query executed", type: "search" },
              { time: "2 hours ago", event: "System health check completed", type: "health" }
            ].map((activity, index) => (
              <div key={index} className="flex items-center justify-between py-2 border-b last:border-b-0">
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${
                    activity.type === 'alert' ? 'bg-red-500' :
                    activity.type === 'info' ? 'bg-blue-500' :
                    activity.type === 'search' ? 'bg-green-500' : 'bg-orange-500'
                  }`} />
                  <span className="text-sm">{activity.event}</span>
                </div>
                <span className="text-xs text-muted-foreground">{activity.time}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
