import React from 'react';
import { Menu, X, Home, Activity, Shield, FileText, Users, Settings, AlertTriangle, Briefcase, Server, Database, BarChart3, Code2, Table } from 'lucide-react';
import { cn } from '../lib/utils';
import { useUiStore } from '../stores/uiStore';

interface AppLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

interface NavigationItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

const navigationItems: NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: Home,
    description: 'Overview and analytics'
  },
  {
    id: 'log-activity',
    label: 'Log Activity',
    icon: Activity,
    description: 'Enhanced real-time log investigation with advanced features'
  },
  {
    id: 'alerts',
    label: 'Alerts',
    icon: AlertTriangle,
    description: 'Security alerts and incidents'
  },
  {
    id: 'cases',
    label: 'Cases',
    icon: Briefcase,
    description: 'Investigation cases'
  },
  {
    id: 'rules',
    label: 'Rules',
    icon: Shield,
    description: 'Detection rules and policies'
  },
  {
    id: 'log-sources',
    label: 'Log Sources',
    icon: FileText,
    description: 'Data source management'
  },
  {
    id: 'enhanced-log-sources',
    label: 'Enhanced Log Sources',
    icon: Database,
    description: 'Advanced log source management with groups and statistics'
  },
  {
    id: 'tenant-metrics',
    label: 'Tenant Metrics',
    icon: BarChart3,
    description: 'Monitor tenant performance, EPS, and parsing statistics'
  },
  {
    id: 'users',
    label: 'Users',
    icon: Users,
    description: 'User management'
  },
  {
    id: 'agent-fleet',
    label: 'Agent Fleet',
    icon: Server,
    description: 'Agent management and monitoring'
  },
  {
    id: 'typed-api-example',
    label: 'Typed API Demo',
    icon: Code2,
    description: 'Demonstration of type-safe API client with OpenAPI'
  },
  {
    id: 'dev-events',
    label: 'Dev Events',
    icon: Table,
    description: 'Query and analyze dev.events table data'
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: Settings,
    description: 'System administration'
  }
];

export const AppLayout: React.FC<AppLayoutProps> = ({ children, currentPage, onNavigate }) => {
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUiStore();

  const handleNavigate = (pageId: string) => {
    onNavigate(pageId);
    // Close sidebar on mobile after navigation
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border px-4 py-3 lg:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Hamburger Menu Button */}
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-md text-secondary-text hover:text-primary-text hover:bg-muted transition-colors"
              aria-label="Toggle navigation menu"
            >
              {sidebarOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
            
            {/* Logo/Title */}
            <div className="flex items-center space-x-2">
              <Shield className="h-6 w-6 text-blue-500" />
              <h1 className="text-xl font-bold text-primary-text">
                SIEM Analytics
              </h1>
            </div>
          </div>

          {/* Header Actions */}
          <div className="flex items-center space-x-2">
            <div className="hidden sm:flex items-center space-x-2 text-sm text-secondary-text">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span>System Online</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar Overlay (Mobile) */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSidebarOpen(false);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Close sidebar"
          />
        )}

        {/* Sidebar */}
        <aside className={cn(
          "fixed left-0 top-[73px] h-[calc(100vh-73px)] w-64 bg-card border-r border-border transform transition-transform duration-200 ease-in-out z-50 overflow-y-auto",
          "lg:relative lg:top-0 lg:h-[calc(100vh-73px)] lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <nav className="p-4 space-y-2 min-h-full">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleNavigate(item.id);
                    }
                  }}
                  className={cn(
                    "w-full flex items-center space-x-3 px-3 py-2 rounded-md text-left transition-colors",
                    isActive
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                      : "text-secondary-text hover:text-primary-text hover:bg-muted"
                  )}
                  aria-label={`Navigate to ${item.label}`}
                >
                  <Icon className={cn(
                    "h-5 w-5 flex-shrink-0",
                    isActive ? "text-blue-600 dark:text-blue-400" : "text-secondary-text"
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className={cn(
                      "text-sm font-medium",
                      isActive ? "text-blue-700 dark:text-blue-300" : "text-primary-text"
                    )}>
                      {item.label}
                    </div>
                    {item.description && (
                      <div className="text-xs text-secondary-text truncate">
                        {item.description}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className={cn(
          "flex-1 transition-all duration-200 ease-in-out",
          "lg:ml-0" // Remove margin on large screens since sidebar is relative
        )}>
          <div className="min-h-[calc(100vh-73px)]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};