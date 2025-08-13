/**
 * VisualThemeProvider - Controls the visual theme feature flag
 * 
 * This component manages the VISUAL_THEME feature flag and applies
 * the appropriate theme classes to the document root.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';

interface VisualThemeContextType {
  theme: 'v1' | 'v2';
  isDark: boolean;
  setTheme: (theme: 'v1' | 'v2') => void;
  toggleDarkMode: () => void;
}

const VisualThemeContext = createContext<VisualThemeContextType | undefined>(undefined);

interface VisualThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: 'v1' | 'v2';
  defaultDarkMode?: boolean;
}

export function VisualThemeProvider({ 
  children, 
  defaultTheme = 'v2', // Default to v2 in development
  defaultDarkMode = false 
}: VisualThemeProviderProps) {
  // Check environment variable for theme override
  const envTheme = import.meta.env.VITE_VISUAL_THEME as 'v1' | 'v2' | undefined;
  const initialTheme = envTheme || defaultTheme;

  // Check for saved preferences
  const [theme, setThemeState] = useState<'v1' | 'v2'>(() => {
    const saved = localStorage.getItem('visual-theme');
    return (saved as 'v1' | 'v2') || initialTheme;
  });

  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('dark-mode');
    if (saved !== null) {
      return JSON.parse(saved);
    }
    // Check system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches || defaultDarkMode;
  });

  // Apply theme to document root
  useEffect(() => {
    const root = document.documentElement;
    
    // Set visual theme data attribute
    root.setAttribute('data-visual-theme', theme);
    
    // Apply dark mode class
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Save preferences
    localStorage.setItem('visual-theme', theme);
    localStorage.setItem('dark-mode', JSON.stringify(isDark));
  }, [theme, isDark]);

  // Listen for system dark mode changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      // Only auto-switch if user hasn't manually set a preference
      const savedDarkMode = localStorage.getItem('dark-mode');
      if (savedDarkMode === null) {
        setIsDark(e.matches);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const setTheme = (newTheme: 'v1' | 'v2') => {
    setThemeState(newTheme);
  };

  const toggleDarkMode = () => {
    setIsDark(!isDark);
  };

  const contextValue: VisualThemeContextType = {
    theme,
    isDark,
    setTheme,
    toggleDarkMode,
  };

  return (
    <VisualThemeContext.Provider value={contextValue}>
      {children}
    </VisualThemeContext.Provider>
  );
}

export function useVisualTheme() {
  const context = useContext(VisualThemeContext);
  if (context === undefined) {
    throw new Error('useVisualTheme must be used within a VisualThemeProvider');
  }
  return context;
}

/**
 * Development-only theme toggle component
 * Only renders in development mode
 */
export function ThemeToggle() {
  const { theme, isDark, setTheme, toggleDarkMode } = useVisualTheme();

  // Only show in development
  if (import.meta.env.PROD) {
    return null;
  }

  return (
    <div 
      style={{ 
        position: 'fixed', 
        top: '16px', 
        right: '16px', 
        zIndex: 9999,
        display: 'flex',
        gap: '8px',
        padding: '8px',
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-2)',
        boxShadow: 'var(--shadow-2)',
        fontSize: '12px'
      }}
    >
      <button
        onClick={() => setTheme(theme === 'v1' ? 'v2' : 'v1')}
        style={{
          padding: '4px 8px',
          fontSize: '11px',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-1)',
          backgroundColor: theme === 'v2' ? 'var(--primary)' : 'var(--surface)',
          color: theme === 'v2' ? 'var(--primary-contrast)' : 'var(--fg)'
        }}
      >
        Theme: {theme.toUpperCase()}
      </button>
      <button
        onClick={toggleDarkMode}
        style={{
          padding: '4px 8px',
          fontSize: '11px',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-1)',
          backgroundColor: 'var(--surface)',
          color: 'var(--fg)'
        }}
      >
        {isDark ? '🌙' : '☀️'}
      </button>
    </div>
  );
}
