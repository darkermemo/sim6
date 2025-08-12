import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { SearchPage } from '@/pages/Search';
import { AlertsPage } from '@/pages/Alerts';
import { RulesPage } from '@/pages/Rules';
import { RulePacksPage } from '@/pages/RulePacks';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <Navigate to="/search" replace />,
      },
      {
        path: 'search',
        element: <SearchPage />,
      },
      {
        path: 'alerts',
        element: <AlertsPage />,
      },
      {
        path: 'rules',
        element: <RulesPage />,
      },
      {
        path: 'rule-packs',
        element: <RulePacksPage />,
      },
      {
        path: 'health',
        element: <div className="p-6">Health Dashboard (coming soon)</div>,
      },
      {
        path: 'admin',
        children: [
          {
            path: 'log-sources',
            element: <div className="p-6">Log Sources Admin (coming soon)</div>,
          },
          {
            path: 'parsers',
            element: <div className="p-6">Parsers Admin (coming soon)</div>,
          },
          {
            path: 'tenants',
            element: <div className="p-6">Tenants Admin (coming soon)</div>,
          },
        ],
      },
    ],
  },
]);