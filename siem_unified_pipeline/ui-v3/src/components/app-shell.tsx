"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActionButton } from "@/components/ui/ActionButton";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
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
  Target,
  Palette
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
    name: "Attack Simulations", 
    href: "/attack-simulations", 
    icon: Target,
    description: "Generate attack scenarios for testing",
    badge: "Dev"
  },
  { 
    name: "Health", 
    href: "/health", 
    icon: Activity,
    description: "System health and monitoring"
  },
  { 
    name: "Theme", 
    href: "/theme", 
    icon: Palette,
    description: "Live theme customization",
    badge: "Live"
  },
  { 
    name: "Settings", 
    href: "/settings", 
    icon: Settings,
    description: "System configuration"
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Note: Search page now uses full AppShell like other pages

  return (
    <div className="flex h-screen bg-background">
      {/* Icon Rail Sidebar - Kibana style */}
      <div className="w-16 bg-[hsl(var(--k-rail-bg))] flex flex-col items-center py-4 space-y-6">
        <div className="w-8 h-8 bg-[hsl(var(--primary))] rounded flex items-center justify-center">
          <span className="text-white font-bold text-sm">k</span>
        </div>
        <nav className="flex flex-col space-y-4">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.name} href={item.href} title={item.name} className={cn(
                "w-10 h-10 p-0 rounded flex items-center justify-center",
                "text-[hsl(var(--k-rail-icon))] hover:text-white",
                "hover:bg-[hsl(var(--k-rail-hover))]",
                isActive && "bg-[hsl(var(--k-rail-hover))] text-white"
              )}>
                <item.icon className="w-5 h-5" />
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <div className="flex flex-col space-y-4">
          <button className="w-10 h-10 p-0 rounded text-[hsl(var(--k-rail-icon))] hover:text-white hover:bg-[hsl(var(--k-rail-hover))] flex items-center justify-center">
            <Bell className="w-5 h-5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-10 h-10 p-0 rounded text-[hsl(var(--k-rail-icon))] hover:text-white hover:bg-[hsl(var(--k-rail-hover))] flex items-center justify-center">
                <Users className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <div className="flex items-center justify-start gap-2 p-2">
                <div className="flex flex-col space-y-1 leading-none">
                  <p className="font-medium">Admin User</p>
                  <p className="w-[200px] truncate text-sm text-muted-foreground">admin@security.local</p>
                </div>
              </div>
              <DropdownMenuSeparator />
              <ActionMenuItem data-action="app:profile:view" data-intent="navigate" onSelect={() => window.location.href = '/profile'}>
                <Users className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </ActionMenuItem>
              <ActionMenuItem data-action="app:settings:view" data-intent="navigate" onSelect={() => window.location.href = '/settings'}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </ActionMenuItem>
              <DropdownMenuSeparator />
              <ActionMenuItem data-action="app:theme:light" data-intent="api" data-endpoint="/api/v2/user/theme" onSelect={() => document.documentElement.classList.remove('dark')}>
                <Sun className="mr-2 h-4 w-4" />
                <span>Light Theme</span>
              </ActionMenuItem>
              <ActionMenuItem data-action="app:theme:dark" data-intent="api" data-endpoint="/api/v2/user/theme" onSelect={() => document.documentElement.classList.add('dark')}>
                <Moon className="mr-2 h-4 w-4" />
                <span>Dark Theme</span>
              </ActionMenuItem>
              <DropdownMenuSeparator />
              <ActionMenuItem className="text-red-600" data-action="app:auth:logout" data-intent="api" data-endpoint="/api/v2/auth/logout" data-danger="true" onSelect={() => { window.location.href = '/login'; }}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign out</span>
              </ActionMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header - hide on /search to match Kibana Discover focus */}
        {!(pathname.startsWith('/search')) && (
          <header className="h-12 bg-[hsl(var(--k-topbar-bg))] border-b border-[hsl(var(--k-border-light))] flex items-center px-4">
            <div>
              <h1 className="text-sm text-gray-600">
                {navigation.find(item => item.href === pathname)?.name || "Overview"}
              </h1>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-[hsl(var(--k-border-light))]">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm font-medium text-green-700">Live</span>
              </div>
            </div>
          </header>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-white">
          {children}
        </main>
      </div>
    </div>
  );
}
