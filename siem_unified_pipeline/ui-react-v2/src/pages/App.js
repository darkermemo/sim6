import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import Home from "./Home";
import Search from "./Search";
import SearchGolden from "./SearchGolden";
import Health from "./Health";
import Login from "./Login";
import Dashboard from "./Dashboard";
import DashboardGolden from "./DashboardGolden";
import { SearchDemo } from "@/components/SearchDemo";
import SearchGoldenV2 from "./SearchGoldenV2";
import SearchGoldenV3 from "./SearchGoldenV3";
import SearchGoldenV4 from "./SearchGoldenV4";
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
    return (_jsx(Routes, { children: _jsxs(Route, { element: _jsx(AppShell, {}), children: [_jsx(Route, { path: "/", element: _jsx(Home, {}) }), _jsx(Route, { path: "/dashboard", element: _jsx(DashboardGolden, {}) }), _jsx(Route, { path: "/dashboard-old", element: _jsx(Dashboard, {}) }), _jsx(Route, { path: "/search", element: _jsx(SearchGoldenV4, {}) }), _jsx(Route, { path: "/search-v3", element: _jsx(SearchGoldenV3, {}) }), _jsx(Route, { path: "/search-v2", element: _jsx(SearchGoldenV2, {}) }), _jsx(Route, { path: "/search-legacy", element: _jsx(SearchGolden, {}) }), _jsx(Route, { path: "/search-simple", element: _jsx(Search, {}) }), _jsx(Route, { path: "/search-demo", element: _jsx(SearchDemo, {}) }), _jsx(Route, { path: "/health", element: _jsx(Health, {}) }), FLAGS.ALERTS_ENABLED && _jsx(Route, { path: "/alerts", element: _jsx("div", { children: "Alerts TBD" }) }), FLAGS.RULES_ENABLED && _jsx(Route, { path: "/rules", element: _jsx("div", { children: "Rules TBD" }) }), FLAGS.RULEPACKS_ENABLED && _jsx(Route, { path: "/rulepacks", element: _jsx("div", { children: "RulePacks TBD" }) }), _jsx(Route, { path: "/login", element: _jsx(Login, {}) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/" }) })] }) }));
}
