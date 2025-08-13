import { useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { Rules } from './components/Rules';
import { LogSourceManagement } from './components/LogSourceManagement';
import { UserManagement } from './components/UserManagement';
import { ParserManagement } from './components/ParserManagement';
import { InteractiveParserBuilder } from './components/InteractiveParserBuilder';
import { AlertDetailDrawer } from './components/AlertDetailDrawer';
import { AdvancedRuleCreation } from './components/AdvancedRuleCreation';
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
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'rules' | 'log-sources' | 'users' | 'parsers' | 'interactive-parser'>('dashboard');
  const { ruleDrawerOpen, selectedRuleId, closeRuleDrawer } = useUiStore();

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'rules':
        return <Rules />;
      case 'log-sources':
        return <LogSourceManagement />;
      case 'users':
        return <UserManagement />;
      case 'parsers':
        return <ParserManagement />;
      case 'interactive-parser':
        return <InteractiveParserBuilder />;
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
        <div className="App">
          {/* Simple Navigation */}
          <nav className="bg-card border-b border-border px-6 py-4">
            <div className="flex items-center justify-between max-w-7xl mx-auto">
              <div className="flex items-center space-x-8">
                <h1 className="text-xl font-bold text-primary-text">SIEM Analytics</h1>
                <div className="flex space-x-4">
                  <button
                    onClick={() => setCurrentPage('dashboard')}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      currentPage === 'dashboard'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-secondary-text hover:text-primary-text'
                    }`}
                  >
                    Dashboard
                  </button>
                  <button
                    onClick={() => setCurrentPage('rules')}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      currentPage === 'rules'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-secondary-text hover:text-primary-text'
                    }`}
                  >
                    Rules
                  </button>
                  <button
                    onClick={() => setCurrentPage('log-sources')}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      currentPage === 'log-sources'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-secondary-text hover:text-primary-text'
                    }`}
                  >
                    Log Sources
                  </button>
                  <button
                    onClick={() => setCurrentPage('users')}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      currentPage === 'users'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-secondary-text hover:text-primary-text'
                    }`}
                  >
                    Users
                  </button>
                  <button
                    onClick={() => setCurrentPage('parsers')}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      currentPage === 'parsers'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-secondary-text hover:text-primary-text'
                    }`}
                  >
                    Parsers
                  </button>
                  <button
                    onClick={() => setCurrentPage('interactive-parser')}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      currentPage === 'interactive-parser'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-secondary-text hover:text-primary-text'
                    }`}
                  >
                    Interactive Parser
                  </button>
                </div>
              </div>
            </div>
          </nav>

          {/* Page Content */}
          {renderPage()}

          {/* Global Components */}
          <AlertDetailDrawer />
          <ConnectedRuleDrawer />
          <Toaster />
        </div>
      </AuthGuard>
    </ErrorBoundary>
  );
}

export default App; 