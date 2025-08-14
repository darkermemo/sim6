/**
 * Code-Split Route Components for Performance Optimization
 * Lazy-loaded components reduce initial bundle size
 */

import React, { Suspense } from 'react';

// Lazy-loaded page components for code splitting
const SearchGoldenV4 = React.lazy(() => import('../pages/SearchGoldenV4'));
const SearchGoldenV3 = React.lazy(() => import('../pages/SearchGoldenV3'));
const SearchGoldenV2 = React.lazy(() => import('../pages/SearchGoldenV2'));
const SearchGolden = React.lazy(() => import('../pages/SearchGolden'));
const DashboardGolden = React.lazy(() => import('../pages/DashboardGolden'));
const Dashboard = React.lazy(() => import('../pages/Dashboard'));
const Health = React.lazy(() => import('../pages/Health'));
const Search = React.lazy(() => import('../pages/Search'));
const SearchDemo = React.lazy(() => import('../components/SearchDemo'));

// Loading fallback component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="flex flex-col items-center space-y-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]"></div>
      <p className="text-[var(--fg-muted)] text-sm">Loading page...</p>
    </div>
  </div>
);

// Higher-order component for lazy loading with error boundary
function withLazyLoading<P extends object>(Component: React.ComponentType<P>) {
  return React.forwardRef<any, P>((props, ref) => (
    <Suspense fallback={<PageLoader />}>
      <Component {...props} ref={ref} />
    </Suspense>
  ));
}

// Export lazy-loaded components
export const LazySearchGoldenV4 = withLazyLoading(SearchGoldenV4);
export const LazySearchGoldenV3 = withLazyLoading(SearchGoldenV3);
export const LazySearchGoldenV2 = withLazyLoading(SearchGoldenV2);
export const LazySearchGolden = withLazyLoading(SearchGolden);
export const LazyDashboardGolden = withLazyLoading(DashboardGolden);
export const LazyDashboard = withLazyLoading(Dashboard);
export const LazyHealth = withLazyLoading(Health);
export const LazySearch = withLazyLoading(Search);
export const LazySearchDemo = withLazyLoading(SearchDemo);

// Bundle analysis helper - chunk information
export const CHUNK_INFO = {
  'search-v4': 'SearchGoldenV4 - Latest enterprise search with all features',
  'search-v3': 'SearchGoldenV3 - Virtualized search with performance optimizations',
  'search-v2': 'SearchGoldenV2 - React Query integration',
  'search-legacy': 'SearchGolden - Original search implementation',
  'dashboard': 'Dashboard and health monitoring pages',
  'search-demo': 'Development and testing components',
} as const;
