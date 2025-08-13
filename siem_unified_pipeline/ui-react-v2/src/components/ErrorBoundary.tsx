/**
 * ErrorBoundary - Catch React rendering errors and display them
 * This prevents pages from going blank and hides critical errors
 */

import { Component, ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error details
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Update state with error info
    this.setState({
      error,
      errorInfo,
    });

    // Report to runtime guard if available
    if (window.__rt) {
      window.__rt.issues.push({
        type: 'pageerror',
        message: `React Error: ${error.message}`,
        timestamp: Date.now(),
      });
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error display
      return (
        <div 
          data-testid="error-boundary"
          style={{
            padding: '20px',
            border: '2px solid #ff6b6b',
            borderRadius: '8px',
            backgroundColor: '#ffe0e0',
            color: '#d63031',
            margin: '20px',
          }}
        >
          <h3>⚠️ Component Error</h3>
          <details style={{ marginTop: '10px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
              {this.state.error?.message || 'Unknown error occurred'}
            </summary>
            {this.state.error && (
              <pre style={{ 
                marginTop: '10px', 
                fontSize: '12px', 
                overflow: 'auto',
                maxHeight: '200px',
                backgroundColor: '#f8f9fa',
                padding: '10px',
                borderRadius: '4px',
              }}>
                {this.state.error.stack}
              </pre>
            )}
            {this.state.errorInfo && (
              <pre style={{ 
                marginTop: '10px', 
                fontSize: '12px', 
                overflow: 'auto',
                maxHeight: '200px',
                backgroundColor: '#f8f9fa',
                padding: '10px',
                borderRadius: '4px',
              }}>
                {this.state.errorInfo.componentStack}
              </pre>
            )}
          </details>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '15px',
              padding: '8px 16px',
              backgroundColor: '#fd79a8',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-order component to wrap pages with error boundary
 */
export function withErrorBoundary<T extends object>(
  Component: React.ComponentType<T>,
  fallback?: ReactNode
) {
  const WrappedComponent = (props: T) => (
    <ErrorBoundary fallback={fallback}>
      <Component {...props} />
    </ErrorBoundary>
  );
  
  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
}
