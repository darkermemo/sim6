import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * ErrorBoundary - Catch React rendering errors and display them
 * This prevents pages from going blank and hides critical errors
 */
import { Component } from 'react';
export class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI
        return {
            hasError: true,
            error,
        };
    }
    componentDidCatch(error, errorInfo) {
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
    render() {
        if (this.state.hasError) {
            // Custom fallback UI
            if (this.props.fallback) {
                return this.props.fallback;
            }
            // Default error display
            return (_jsxs("div", { "data-testid": "error-boundary", style: {
                    padding: '20px',
                    border: '2px solid #ff6b6b',
                    borderRadius: '8px',
                    backgroundColor: '#ffe0e0',
                    color: '#d63031',
                    margin: '20px',
                }, children: [_jsx("h3", { children: "\u26A0\uFE0F Component Error" }), _jsxs("details", { style: { marginTop: '10px' }, children: [_jsx("summary", { style: { cursor: 'pointer', fontWeight: 'bold' }, children: this.state.error?.message || 'Unknown error occurred' }), this.state.error && (_jsx("pre", { style: {
                                    marginTop: '10px',
                                    fontSize: '12px',
                                    overflow: 'auto',
                                    maxHeight: '200px',
                                    backgroundColor: '#f8f9fa',
                                    padding: '10px',
                                    borderRadius: '4px',
                                }, children: this.state.error.stack })), this.state.errorInfo && (_jsx("pre", { style: {
                                    marginTop: '10px',
                                    fontSize: '12px',
                                    overflow: 'auto',
                                    maxHeight: '200px',
                                    backgroundColor: '#f8f9fa',
                                    padding: '10px',
                                    borderRadius: '4px',
                                }, children: this.state.errorInfo.componentStack }))] }), _jsx("button", { onClick: () => window.location.reload(), style: {
                            marginTop: '15px',
                            padding: '8px 16px',
                            backgroundColor: '#fd79a8',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                        }, children: "Reload Page" })] }));
        }
        return this.props.children;
    }
}
/**
 * Higher-order component to wrap pages with error boundary
 */
export function withErrorBoundary(Component, fallback) {
    const WrappedComponent = (props) => (_jsx(ErrorBoundary, { fallback: fallback, children: _jsx(Component, { ...props }) }));
    WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
    return WrappedComponent;
}
