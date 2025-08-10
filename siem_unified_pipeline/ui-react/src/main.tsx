import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { RouterProvider, createRootRoute, createRouter, Link, createRoute, Outlet, Navigate } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TenantsPage from './pages/Tenants'
import SearchPage from './pages/Search'
import AlertsPage from './pages/Alerts'
import DashboardPage from './pages/Dashboard'

function AppLayout(){
  return (
    <div className="min-h-screen grid grid-rows-[56px,1fr]">
      <header className="flex items-center justify-between px-4 border-b bg-white/70 dark:bg-slate-900/70 backdrop-blur">
        <div className="font-semibold">SIEM v2</div>
        <nav className="flex gap-3 text-sm">
          <Link to="/dashboard" className="hover:underline">Dashboard</Link>
          <Link to="/search" className="hover:underline">Search</Link>
          <Link to="/alerts" className="hover:underline">Alerts</Link>
          <Link to="/tenants" className="hover:underline">Tenants</Link>
        </nav>
      </header>
      <main className="p-4">
        <div id="route-outlet" className="text-slate-600 dark:text-slate-300">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

const rootRoute = createRootRoute({ component: AppLayout })
const dashboardRoute = createRoute({ getParentRoute: () => rootRoute, path: '/dashboard', component: DashboardPage })
const searchRoute = createRoute({ getParentRoute: () => rootRoute, path: '/search', component: SearchPage })
const alertsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/alerts', component: AlertsPage })
const tenantsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants', component: TenantsPage })
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => <Navigate to="/dashboard" /> })

const routeTree = rootRoute.addChildren([indexRoute, dashboardRoute, searchRoute, alertsRoute, tenantsRoute])
const router = createRouter({ routeTree, basepath: '/ui/app' })
const qc = new QueryClient()

declare module '@tanstack/react-router' { interface Register { router: typeof router } }

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
)
