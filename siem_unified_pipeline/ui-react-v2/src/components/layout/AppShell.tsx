import { Link, Outlet, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";

/**
 * AppShell - wraps all pages with navigation header
 * Provides consistent layout and navigation across the app
 */
export default function AppShell() {
  const location = useLocation();
  const [isDark, setIsDark] = useState(() => 
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    // Apply dark mode class to root element
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const isActive = (path: string) => location.pathname === path;

  return (
    <div data-testid="appshell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'blur(8px)',
        background: 'rgba(var(--bg-secondary-rgb), 0.8)'
      }}>
        <div className="container" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '64px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <h1 style={{ 
              fontSize: '1.25rem', 
              fontWeight: 700, 
              margin: 0,
              background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-info) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              SIEM v2
            </h1>
            <nav style={{ display: 'flex', gap: '0.5rem' }}>
              {[
                { path: '/', label: 'Home' },
                { path: '/dashboard', label: 'Dashboard' },
                { path: '/search', label: 'Search' },
                { path: '/health', label: 'Health' }
              ].map(({ path, label }) => (
                <Link
                  key={path}
                  to={path}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 500,
                    fontSize: '0.875rem',
                    transition: 'all 0.2s',
                    backgroundColor: isActive(path) ? 'var(--color-primary)' : 'transparent',
                    color: isActive(path) ? 'white' : 'var(--text-secondary)',
                    textDecoration: 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive(path)) {
                      e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive(path)) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }
                  }}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
          <button
            onClick={() => setIsDark(!isDark)}
            style={{
              padding: '0.5rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'transparent',
              border: '1px solid var(--border-color)',
              cursor: 'pointer',
              fontSize: '1.25rem',
              lineHeight: 1,
              transition: 'all 0.2s'
            }}
            aria-label="Toggle theme"
          >
            {isDark ? '☀️' : '🌙'}
          </button>
        </div>
      </header>
      <main style={{ flex: 1, backgroundColor: 'var(--bg-primary)' }}>
        <div className="fade-in" style={{ padding: 'var(--space-xl) 0' }}>
          <Outlet />
        </div>
      </main>
      <footer style={{
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-color)',
        padding: 'var(--space-lg) 0',
        textAlign: 'center',
        fontSize: '0.875rem',
        color: 'var(--text-tertiary)'
      }}>
        <div className="container">
          SIEM v2 • Real-time Security Information and Event Management
        </div>
      </footer>
    </div>
  );
}
