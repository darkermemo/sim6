import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./pages/App";
import { installRuntimeGuard, markAppReady } from "./lib/runtimeGuard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { VisualThemeProvider, ThemeToggle } from "./components/VisualThemeProvider";
import { queryClient } from "./app/queryClient";
import "./index.css";
// Install runtime guard before app starts
// Allow optional endpoints that may return 404
installRuntimeGuard([
    /\/api\/v2\/search\/grammar$/, // Grammar endpoint is optional
    /\/api\/v2\/schema\/enums$/, // Enums endpoint may be optional
]);
const root = createRoot(document.getElementById("root"));
root.render(_jsx(ErrorBoundary, { children: _jsx(QueryClientProvider, { client: queryClient, children: _jsx(VisualThemeProvider, { defaultTheme: "v2", defaultDarkMode: false, children: _jsxs(BrowserRouter, { basename: "/ui/v2", children: [_jsx(App, {}), _jsx(ThemeToggle, {})] }) }) }) }));
// Mark app as ready after initial render
// This gives the app time to load critical data and settle
setTimeout(() => {
    markAppReady();
}, 100);
