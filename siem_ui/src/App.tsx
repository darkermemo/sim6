import { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import Alerts from './pages/Alerts';
import Cases from './pages/Cases';
import Admin from './pages/Admin';
import { Rules } from './components/Rules';
import { LogSourceManagement } from './components/LogSourceManagement';

import { UserManagement } from './components/UserManagement';
import ParserManagement from './components/ParserManagement';
import TenantMetricsDashboard from './components/TenantMetricsDashboard';
import { InteractiveParserBuilder } from './components/InteractiveParserBuilder';
import { EventInvestigation } from './components/EventInvestigation';

import DevEventsTable from './components/DevEventsTable';
import { AlertDetailDrawer } from './components/AlertDetailDrawer';
import { AdvancedRuleCreation } from './components/AdvancedRuleCreation';
import { VendorMappingPage } from './pages/VendorMappingPage';
import AgentFleetPage from './components/AgentFleetPage';
import { TypedApiExample } from './components/TypedApiExample';
import { AppLayout } from './components/AppLayout';
import { Toaster } from './components/ui/Toaster';
import { AuthGuard } from './components/AuthGuard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useUiStore } from './stores/uiStore';


/**
 * Main App Component
 * 
 * Critical Quality Gate Rule 3: Infinite Loop Prevention (AuthGuard)
 * Critical Quality Gate Rule 4: Security-First Development (AuthGuard)
 * Critical Quality Gate Rule 6: Comprehensive Error Boundary (ErrorBoundary)
 */
function App() {
  type PageType = 'dashboard' | 'alerts' | 'cases' | 'admin' | 'rules' | 'log-sources' | 'enhanced-log-sources' | 'tenant-metrics' | 'users' | 'parsers' | 'interactive-parser' | 'events' | 'vendor-mapping' | 'log-activity' | 'agent-fleet' | 'typed-api-example' | 'dev-events';
  
  // Function to get page from URL path
  const getPageFromPath = (pathname: string): PageType => {
    const path = pathname.replace('/', '') || 'dashboard';
    const validPages: PageType[] = ['dashboard', 'alerts', 'cases', 'admin', 'rules', 'log-sources', 'enhanced-log-sources', 'tenant-metrics', 'users', 'parsers', 'interactive-parser', 'events', 'vendor-mapping', 'log-activity', 'agent-fleet', 'typed-api-example', 'dev-events'];
    return validPages.includes(path as PageType) ? (path as PageType) : 'dashboard';
  };
  
  const [currentPage, setCurrentPage] = useState<PageType>(() => getPageFromPath(window.location.pathname));

  // Handle browser navigation (back/forward buttons)
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPage(getPageFromPath(window.location.pathname));
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = (page: string) => {
    const newPage = page as PageType;
    setCurrentPage(newPage);
    // Update URL without page reload
    const newPath = newPage === 'dashboard' ? '/' : `/${newPage}`;
    window.history.pushState({}, '', newPath);
  };
  const { ruleDrawerOpen, selectedRuleId, closeRuleDrawer } = useUiStore();

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'alerts':
        return <Alerts />;
      case 'cases':
        return <Cases />;
      case 'admin':
        return <Admin />;
      case 'rules':
        return <Rules />;
      case 'log-sources':
        return <LogSourceManagement />;
      case 'enhanced-log-sources':
        return <LogSourceManagement />;
      case 'tenant-metrics':
        return <TenantMetricsDashboard />;
      case 'users':
        return <UserManagement />;
      case 'parsers':
        return <ParserManagement userRole={'Admin'} />;
      case 'interactive-parser':
        return <InteractiveParserBuilder />;
      case 'events':
        return <EventInvestigation />;
      case 'log-activity':
        return <EventInvestigation />;
      case 'vendor-mapping':
        return <VendorMappingPage />;
      case 'agent-fleet':
        return <AgentFleetPage userRole={'Admin'} onNavigate={handleNavigate} />;
      case 'typed-api-example':
        return <TypedApiExample />;
      case 'dev-events':
        return <DevEventsTable />;
      default:
        return <Dashboard />;
    }
  };

  // Connected Rule Drawer Component
  const ConnectedRuleDrawer = () => {
    // Only show for new rule creation - for viewing existing rules, use the old drawer
    const shouldShowAdvanced = selectedRuleId === 'new';

    if (!shouldShowAdvanced) {
      return null; // For now, only support creation with advanced UI
    }

    return (
      <AdvancedRuleCreation 
        isOpen={ruleDrawerOpen}
        onClose={closeRuleDrawer}
        onSuccess={closeRuleDrawer}
      />
    );
  };

  return (
    <ErrorBoundary>
      <AuthGuard>
        <AppLayout currentPage={currentPage} onNavigate={handleNavigate}>
          {/* Page Content */}
          {renderPage()}

          {/* Global Components */}
          <AlertDetailDrawer />
          <ConnectedRuleDrawer />
          <Toaster />
        </AppLayout>
      </AuthGuard>
    </ErrorBoundary>
  );
}

export default App;