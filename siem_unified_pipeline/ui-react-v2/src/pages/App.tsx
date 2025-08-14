import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import Home from "./Home";
import SearchV2 from "./SearchV2";
import Login from "./Login";

// Direct imports for stability (avoiding lazy loading issues)
import SearchGolden from "./SearchGolden";
import Dashboard from "./Dashboard"; 
import Health from "./Health";
import Search from "./Search";
import Diag from "./Diag";

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
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/search" element={<SearchGolden />} />
        <Route path="/search-simple" element={<Search />} />
        <Route path="/health" element={<Health />} />
        <Route path="/diag" element={<Diag />} />
        
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
