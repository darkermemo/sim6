"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { 
  Home, 
  Search, 
  BarChart3, 
  Shield, 
  Settings, 
  Menu, 
  Database,
  Activity,
  Users,
  Bell,
  LogOut,
  Moon,
  Sun,
  AlertTriangle,
  FileText,
  Zap,
  ChevronRight,
  ChevronLeft,
  PanelLeftOpen,
  PanelLeftClose
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { 
    name: "Overview", 
    href: "/", 
    icon: Home,
    description: "System overview and quick actions"
  },
  { 
    name: "Dashboard", 
    href: "/dashboard", 
    icon: BarChart3,
    description: "Security metrics and analytics",
    badge: "Live"
  },
  { 
    name: "Search", 
    href: "/search", 
    icon: Search,
    description: "Query and analyze security events"
  },
  { 
    name: "Rules", 
    href: "/rules", 
    icon: Shield,
    description: "Security detection rules",
    badge: "12 Active"
  },
  { 
    name: "Alerts", 
    href: "/alerts", 
    icon: AlertTriangle,
    description: "Security alerts and incidents",
    badge: "3"
  },
  { 
    name: "Reports", 
    href: "/reports", 
    icon: FileText,
    description: "Security reports and analysis"
  },
  { 
    name: "Health", 
    href: "/health", 
    icon: Activity,
    description: "System health and monitoring"
  },
  { 
    name: "Settings", 
    href: "/settings", 
    icon: Settings,
    description: "System configuration"
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();

  const SidebarContent = ({ collapsed = false }: { collapsed?: boolean }) => (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-slate-900">
      {/* Logo */}
      <div className={cn(
        "flex h-16 items-center border-b border-slate-200 dark:border-slate-700",
        collapsed ? "px-4 justify-center" : "px-6"
      )}>
        <div className={cn("flex items-center gap-3", collapsed && "gap-0")}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 shadow-lg">
            <Shield className="h-6 w-6 text-white" />
          </div>
          {!collapsed && (
            <div>
              <span className="text-xl font-bold text-slate-900 dark:text-white">SIEM</span>
              <div className="text-xs text-slate-500 dark:text-slate-400">Security Platform</div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className={cn("flex-1 space-y-2", collapsed ? "p-2" : "p-4")}>
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "group flex items-center rounded-xl text-sm font-medium transition-all duration-200 hover:shadow-sm",
                collapsed ? "gap-0 px-3 py-3 justify-center" : "gap-3 px-3 py-3",
                isActive
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25"
                  : "text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              )}
              onClick={() => setSidebarOpen(false)}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className={cn(
                "h-5 w-5 transition-colors",
                collapsed ? "shrink-0" : "",
                isActive ? "text-white" : "text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300"
              )} />
              {!collapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="truncate">{item.name}</span>
                      {item.badge && (
                        <Badge 
                          variant={isActive ? "secondary" : "outline"} 
                          className={cn(
                            "ml-2 text-xs px-2 py-0.5",
                            isActive 
                              ? "bg-white/20 text-white border-white/30" 
                              : "border-slate-300 dark:border-slate-600"
                          )}
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </div>
                    <div className={cn(
                      "text-xs truncate mt-0.5",
                      isActive 
                        ? "text-blue-100" 
                        : "text-slate-500 dark:text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                    )}>
                      {item.description}
                    </div>
                  </div>
                  {!isActive && (
                    <ChevronRight className="h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* System Status */}
      <div className={cn(
        "border-t border-slate-200 dark:border-slate-700 space-y-3",
        collapsed ? "p-2" : "p-4"
      )}>
        <div className={cn(
          "flex items-center text-sm",
          collapsed ? "justify-center" : "gap-3"
        )}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          </div>
          {!collapsed && (
            <div>
              <div className="font-medium text-slate-900 dark:text-white">System Online</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">ClickHouse connected</div>
            </div>
          )}
        </div>
        <div className={cn(
          "flex items-center text-sm",
          collapsed ? "justify-center" : "gap-3"
        )}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          {!collapsed && (
            <div>
              <div className="font-medium text-slate-900 dark:text-white">245.8k EPS</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Events per second</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900">
      {/* Desktop Sidebar */}
      <div className={cn(
        "hidden flex-col border-r border-slate-200 dark:border-slate-700 lg:flex transition-all duration-300",
        sidebarCollapsed ? "w-20" : "w-72"
      )}>
        <SidebarContent collapsed={sidebarCollapsed} />
        {/* Collapse Toggle */}
        <div className={cn(
          "border-t border-slate-200 dark:border-slate-700",
          sidebarCollapsed ? "p-2" : "p-4"
        )}>
          <Button
            variant="ghost"
            size={sidebarCollapsed ? "icon" : "sm"}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={cn(
              "w-full transition-all duration-200",
              sidebarCollapsed ? "justify-center" : "justify-start gap-2"
            )}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="lg:hidden fixed top-4 left-4 z-40 bg-white dark:bg-slate-800 shadow-lg">
            <Menu className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SidebarContent collapsed={false} />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 shadow-sm">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="hidden lg:flex"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                {navigation.find(item => item.href === pathname)?.name || "Overview"}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {navigation.find(item => item.href === pathname)?.description || "SIEM Security Platform"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Real-time Status */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium text-green-700 dark:text-green-300">Live</span>
            </div>

            {/* Notifications */}
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-4 w-4" />
              <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 text-xs bg-red-500 hover:bg-red-500">
                3
              </Badge>
            </Button>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-gradient-to-br from-blue-600 to-blue-700 text-white font-medium">
                      AD
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <div className="flex items-center justify-start gap-2 p-2">
                  <div className="flex flex-col space-y-1 leading-none">
                    <p className="font-medium">Admin User</p>
                    <p className="w-[200px] truncate text-sm text-muted-foreground">
                      admin@security.local
                    </p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Users className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Sun className="mr-2 h-4 w-4" />
                  <span>Light Theme</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Moon className="mr-2 h-4 w-4" />
                  <span>Dark Theme</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-900">
          {children}
        </main>
      </div>
    </div>
  );
}
