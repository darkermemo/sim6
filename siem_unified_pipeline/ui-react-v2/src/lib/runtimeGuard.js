/**
 * Runtime Guard - Trap all runtime errors for E2E validation
 * A page is only healthy if it has zero pageerror, console errors, and network failures
 */
/**
 * Install global runtime error traps
 * @param allowNetwork - Regex patterns for allowed network failures (e.g., optional endpoints)
 */
export function installRuntimeGuard(allowNetwork = []) {
    // Initialize global runtime tracker
    window.__rt = {
        issues: [],
        getIssues() { return [...this.issues]; },
        clearIssues() { this.issues.length = 0; }
    };
    // Trap console errors and warnings
    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);
    console.error = (...args) => {
        const message = args.map(a => String(a)).join(' ');
        window.__rt.issues.push({
            type: 'console',
            message: `ERROR: ${message}`,
            timestamp: Date.now()
        });
        origError(...args);
    };
    console.warn = (...args) => {
        const message = args.map(a => String(a)).join(' ');
        window.__rt.issues.push({
            type: 'console',
            message: `WARN: ${message}`,
            timestamp: Date.now()
        });
        origWarn(...args);
    };
    // Trap fetch network failures
    const origFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
        try {
            const response = await origFetch(input, init);
            const url = typeof input === 'string' ? input : input.url || String(input);
            // Check if this network failure is allowed
            const isAllowed = allowNetwork.some(regex => regex.test(url));
            if (response.status >= 400 && !isAllowed) {
                window.__rt.issues.push({
                    type: 'network',
                    message: `HTTP ${response.status} ${response.statusText}`,
                    url,
                    status: response.status,
                    timestamp: Date.now()
                });
            }
            return response;
        }
        catch (error) {
            const url = typeof input === 'string' ? input : String(input);
            window.__rt.issues.push({
                type: 'network',
                message: `Network error: ${error?.message || 'Unknown error'}`,
                url,
                timestamp: Date.now()
            });
            throw error;
        }
    };
    // Trap uncaught JavaScript errors
    window.addEventListener('error', (event) => {
        window.__rt.issues.push({
            type: 'pageerror',
            message: `Uncaught error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`,
            url: event.filename,
            timestamp: Date.now()
        });
    });
    // Trap unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason;
        const message = reason?.message || reason?.toString() || 'Unknown rejection';
        window.__rt.issues.push({
            type: 'pageerror',
            message: `Unhandled rejection: ${message}`,
            timestamp: Date.now()
        });
    });
    console.log('🛡️ Runtime guard installed - tracking pageerror, console, and network issues');
}
/**
 * Mark the app as ready for testing
 */
export function markAppReady() {
    document.documentElement.setAttribute('data-app-ready', '1');
    console.log('✅ App marked as ready for E2E testing');
}
/**
 * Get current runtime issues (for debugging)
 */
export function getRuntimeIssues() {
    return window.__rt?.getIssues() || [];
}
/**
 * Clear runtime issues (for testing)
 */
export function clearRuntimeIssues() {
    window.__rt?.clearIssues();
}
