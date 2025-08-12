import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { 
  Search, 
  AlertTriangle, 
  BookOpen, 
  Settings, 
  Users, 
  Radio, 
  Heart, 
  Clock,
  ChevronDown,
  Moon,
  Sun,
  User,
  ChevronLeft,
  Package
} from 'lucide-react';
import { useHealth, getHealthColor } from '@/lib/health';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useUrlState } from '@/hooks/useUrlState';
import { cn } from '@/lib/utils';
import { ToastContainer } from '@/components/ui/toast';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  disabled?: boolean;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  { label: 'Search', path: '/search', icon: <Search className="w-4 h-4" /> },
  { label: 'Alerts', path: '/alerts', icon: <AlertTriangle className="w-4 h-4" /> },
  { label: 'Rules', path: '/rules', icon: <BookOpen className="w-4 h-4" /> },
  { label: 'Rule Packs', path: '/rule-packs', icon: <Package className="w-4 h-4" /> },
  { 
    label: 'Admin', 
    path: '/admin', 
    icon: <Settings className="w-4 h-4" />,
    children: [
      { label: 'Log Sources', path: '/admin/log-sources', icon: null },
      { label: 'Parsers', path: '/admin/parsers', icon: null },
      { label: 'Tenants', path: '/admin/tenants', icon: null },
    ]
  },
  { label: 'Agents', path: '/agents', icon: <Users className="w-4 h-4" />, disabled: true },
  { label: 'Streaming', path: '/streaming', icon: <Radio className="w-4 h-4" />, disabled: true },
  { label: 'Health', path: '/health', icon: <Heart className="w-4 h-4" /> },
];

const timeRanges = [
  { label: 'Last 15 minutes', value: '15m' },
  { label: 'Last 1 hour', value: '1h' },
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Custom', value: 'custom' },
];

export function AppShell() {
  const location = useLocation();
  const { data: health } = useHealth();
  const [darkMode, setDarkMode] = React.useState(() => {
    return localStorage.getItem('ui.theme') === 'dark';
  });
  const [navCollapsed, setNavCollapsed] = React.useState(() => {
    return localStorage.getItem('ui.navCollapsed') === '1';
  });
  
  // URL state for tenant and time range
  const [urlState, setUrlState] = useUrlState({
    tenant: '101',
    range: '15m'
  });

  // Toggle dark mode
  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('ui.theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Save nav collapse state
  const toggleNavCollapse = () => {
    const newState = !navCollapsed;
    setNavCollapsed(newState);
    localStorage.setItem('ui.navCollapsed', newState ? '1' : '0');
  };

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        {/* Skip to content link for accessibility */}
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-blue-600 text-white px-4 py-2 rounded-md z-50">
          Skip to content
        </a>
        
        {/* Left Navigation */}
        <nav className={cn(
          "bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300",
          navCollapsed ? "w-16" : "w-64"
        )}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          {!navCollapsed && <h1 className="text-xl font-bold text-gray-900 dark:text-white">SIEM</h1>}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleNavCollapse}
            className="ml-auto"
            aria-label={navCollapsed ? "Expand navigation" : "Collapse navigation"}
          >
            <ChevronLeft className={cn("w-4 h-4 transition-transform", navCollapsed && "rotate-180")} />
          </Button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.path}>
                {item.children ? (
                  <details className="group">
                    <summary className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700",
                      "text-gray-700 dark:text-gray-300"
                    )}>
                      {item.icon}
                      <span className="flex-1">{item.label}</span>
                      <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                    </summary>
                    <ul className="ml-7 mt-1 space-y-1">
                      {item.children.map((child) => (
                        <li key={child.path}>
                          <NavLink
                            to={child.path}
                            className={({ isActive }) => cn(
                              "block px-3 py-2 rounded-md text-sm",
                              "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700",
                              isActive && "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                            )}
                          >
                            {child.label}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <NavLink
                        to={item.path}
                        className={({ isActive }) => cn(
                          "flex items-center gap-3 px-3 py-2 rounded-md",
                          item.disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-100 dark:hover:bg-gray-700",
                          "text-gray-700 dark:text-gray-300",
                          isActive && !item.disabled && "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                        )}
                        onClick={(e) => item.disabled && e.preventDefault()}
                        aria-disabled={item.disabled}
                      >
                        {item.icon}
                        {!navCollapsed && <span>{item.label}</span>}
                      </NavLink>
                    </TooltipTrigger>
                    {item.disabled && (
                      <TooltipContent side="right">
                        <p>Coming soon</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Health Pills */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              {!navCollapsed && <span className="text-sm text-gray-600 dark:text-gray-400">ClickHouse</span>}
              <Badge variant={getHealthColor(health?.clickhouse, health?.circuit_breaker?.state === 'half_open')}>
                {health?.clickhouse?.ok ? 'OK' : health?.clickhouse ? 'Error' : 'N/A'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              {!navCollapsed && <span className="text-sm text-gray-600 dark:text-gray-400">Redis</span>}
              <Badge variant={health?.redis_detail ? getHealthColor(health.redis_detail) : 'gray'}>
                {health?.redis_detail?.ok ? 'OK' : health?.redis_detail ? 'Error' : 'N/A'}
              </Badge>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center px-6">
          <div className="flex items-center gap-4 flex-1">
            {/* Tenant Selector */}
            <select 
              value={urlState.tenant}
              onChange={(e) => setUrlState({ tenant: e.target.value })}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="101">Tenant 101</option>
              <option value="102">Tenant 102</option>
              <option value="103">Tenant 103</option>
            </select>

            {/* Time Range Picker */}
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />
              <select 
                value={urlState.range}
                onChange={(e) => setUrlState({ range: e.target.value })}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                {timeRanges.map(range => (
                  <option key={range.value} value={range.value}>{range.label}</option>
                ))}
              </select>
            </div>

            {/* Global Search */}
            <div className="flex-1 max-w-xl">
              <input 
                type="text"
                placeholder="Global search..."
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500"
              />
            </div>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-4">
            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDarkMode(!darkMode)}
              aria-label="Toggle theme"
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>

            {/* Profile Menu */}
            <Button variant="ghost" size="icon">
              <User className="w-5 h-5" />
            </Button>
          </div>
        </header>

        {/* Breadcrumbs (placeholder) */}
        <div className="px-6 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {location.pathname}
          </div>
        </div>

        {/* Page Content */}
        <main id="main-content" className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
          <React.Suspense fallback={
            <div className="p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
                <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
              </div>
            </div>
          }>
            <Outlet />
          </React.Suspense>
        </main>
      </div>
      <ToastContainer />
    </div>
    </TooltipProvider>
  );
}