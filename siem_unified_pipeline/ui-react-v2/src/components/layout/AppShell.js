import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
/**
 * AppShell - wraps all pages with navigation header
 * Provides consistent layout and navigation across the app
 */
export default function AppShell() {
    const location = useLocation();
    const [isDark, setIsDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
    useEffect(() => {
        // Apply dark mode class to root element
        if (isDark) {
            document.documentElement.classList.add('dark');
        }
        else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDark]);
    const isActive = (path) => location.pathname === path;
    return (_jsxs("div", { "data-testid": "appshell", style: { minHeight: '100vh', display: 'flex', flexDirection: 'column' }, children: [_jsx("header", { style: {
                    backgroundColor: 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border-color)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 50,
                    backdropFilter: 'blur(8px)',
                    background: 'rgba(var(--bg-secondary-rgb), 0.8)'
                }, children: _jsxs("div", { className: "container", style: {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        height: '64px'
                    }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '2rem' }, children: [_jsx("h1", { style: {
                                        fontSize: '1.25rem',
                                        fontWeight: 700,
                                        margin: 0,
                                        background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-info) 100%)',
                                        WebkitBackgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                        backgroundClip: 'text'
                                    }, children: "SIEM v2" }), _jsx("nav", { style: { display: 'flex', gap: '0.5rem' }, children: [
                                        { path: '/', label: 'Home' },
                                        { path: '/dashboard', label: 'Dashboard' },
                                        { path: '/search', label: 'Search' },
                                        { path: '/health', label: 'Health' }
                                    ].map(({ path, label }) => (_jsx(Link, { to: path, style: {
                                            padding: '0.5rem 1rem',
                                            borderRadius: 'var(--radius-md)',
                                            fontWeight: 500,
                                            fontSize: '0.875rem',
                                            transition: 'all 0.2s',
                                            backgroundColor: isActive(path) ? 'var(--color-primary)' : 'transparent',
                                            color: isActive(path) ? 'white' : 'var(--text-secondary)',
                                            textDecoration: 'none'
                                        }, onMouseEnter: (e) => {
                                            if (!isActive(path)) {
                                                e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                                                e.currentTarget.style.color = 'var(--text-primary)';
                                            }
                                        }, onMouseLeave: (e) => {
                                            if (!isActive(path)) {
                                                e.currentTarget.style.backgroundColor = 'transparent';
                                                e.currentTarget.style.color = 'var(--text-secondary)';
                                            }
                                        }, children: label }, path))) })] }), _jsx("button", { onClick: () => setIsDark(!isDark), style: {
                                padding: '0.5rem',
                                borderRadius: 'var(--radius-md)',
                                backgroundColor: 'transparent',
                                border: '1px solid var(--border-color)',
                                cursor: 'pointer',
                                fontSize: '1.25rem',
                                lineHeight: 1,
                                transition: 'all 0.2s'
                            }, "aria-label": "Toggle theme", children: isDark ? '☀️' : '🌙' })] }) }), _jsx("main", { style: { flex: 1, backgroundColor: 'var(--bg-primary)' }, children: _jsx("div", { className: "fade-in", style: { padding: 'var(--space-xl) 0' }, children: _jsx(Outlet, {}) }) }), _jsx("footer", { style: {
                    backgroundColor: 'var(--bg-secondary)',
                    borderTop: '1px solid var(--border-color)',
                    padding: 'var(--space-lg) 0',
                    textAlign: 'center',
                    fontSize: '0.875rem',
                    color: 'var(--text-tertiary)'
                }, children: _jsx("div", { className: "container", children: "SIEM v2 \u2022 Real-time Security Information and Event Management" }) })] }));
}
