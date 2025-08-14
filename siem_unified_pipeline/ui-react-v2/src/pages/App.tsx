import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import Home from "./Home";
import SearchV2 from "./SearchV2";
import Login from "./Login";

// Code-split imports for performance optimization
import {
  LazySearchGolden,
  LazySearchGoldenV2, 
  LazySearchGoldenV3,
  LazySearchGoldenV4,
  LazyDashboardGolden,
  LazyDashboard,
  LazyHealth,
  LazySearch,
  LazySearchDemo,
} from "@/lib/lazy-routes";

/**
 * Feature flags from environment variables
 * Controls visibility of alerts, rules, and rulepacks features
 */
const FLAGS = {
  ALERTS_ENABLED: (import.meta.env.VITE_ALERTS_ENABLED ?? "false") === "true",
  RULES_ENABLED: (import.meta.env.VITE_RULES_ENABLED ?? "false") === "true",
  RULEPACKS_ENABLED: (import.meta.env.VITE_RULEPACKS_ENABLED ?? "false") === "true",
};

/**
 * App - root component with routing configuration
 * All routes wrapped in AppShell for consistent layout
 */
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<LazyDashboardGolden />} />
        <Route path="/dashboard-old" element={<LazyDashboard />} />
        <Route path="/search" element={<LazySearchGoldenV4 />} />
        <Route path="/search-v3" element={<LazySearchGoldenV3 />} />
        <Route path="/search-v2" element={<LazySearchGoldenV2 />} />
        <Route path="/search-legacy" element={<LazySearchGolden />} />
        <Route path="/search-simple" element={<LazySearch />} />
        <Route path="/search-demo" element={<LazySearchDemo />} />
        <Route path="/health" element={<LazyHealth />} />
        
        {/* Feature-flagged routes (hidden by default) */}
        {FLAGS.ALERTS_ENABLED && <Route path="/alerts" element={<div>Alerts TBD</div>} />}
        {FLAGS.RULES_ENABLED && <Route path="/rules" element={<div>Rules TBD</div>} />}
        {FLAGS.RULEPACKS_ENABLED && <Route path="/rulepacks" element={<div>RulePacks TBD</div>} />}
        
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  );
}
