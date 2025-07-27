import React from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

/**
 * ErrorBoundary - Comprehensive error boundary to prevent cascading failures
 * 
 * Critical Quality Gate Rule 6: Comprehensive Error Boundary
 * Critical Quality Gate Rule 3: Infinite Loop Prevention
 * 
 * Features:
 * - Catches JavaScript errors anywhere in the child component tree
 * - Logs error details for debugging
 * - Displays fallback UI instead of crashing the app
 * - Prevents infinite loops caused by cascading errors
 * - Provides recovery mechanism
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error details for debugging
    console.error('ErrorBoundary caught an error:', error);
    console.error('Error info:', errorInfo);
    
    // Update state with error details
    this.setState({
      error,
      errorInfo,
    });

    // Log to external error reporting service in production
    if (import.meta.env.PROD) {
      // Example: Sentry.captureException(error, { extra: errorInfo });
      console.error('Production error logged:', { error, errorInfo });
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <Card className="w-full max-w-2xl p-6 space-y-6">
            <div className="text-center space-y-2">
              <div className="text-6xl mb-4">⚠️</div>
              <h1 className="text-2xl font-bold text-primary-text">Something went wrong</h1>
              <p className="text-secondary-text">
                The application encountered an unexpected error and has stopped working properly.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-card border border-border rounded-md p-4 space-y-2">
                <h3 className="text-sm font-medium text-primary-text">Error Details:</h3>
                <code className="text-xs text-red-600 block bg-red-50 p-2 rounded">
                  {this.state.error.message}
                </code>
                {import.meta.env.DEV && this.state.errorInfo && (
                  <details className="text-xs text-secondary-text">
                    <summary className="cursor-pointer hover:text-primary-text">
                      Stack Trace (Development)
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap bg-gray-50 p-2 rounded text-xs">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.handleReset} variant="destructive">
                Try Again
              </Button>
              <Button onClick={this.handleReload} variant="outline">
                Reload Page
              </Button>
              <Button 
                onClick={() => window.location.href = '/'}
                variant="ghost"
              >
                Go Home
              </Button>
            </div>

            <div className="text-center">
              <p className="text-xs text-secondary-text">
                If this problem persists, please contact your system administrator.
              </p>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
} 