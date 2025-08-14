import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./pages/App";
import { installRuntimeGuard, markAppReady } from "./lib/runtimeGuard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { VisualThemeProvider, ThemeToggle } from "./components/VisualThemeProvider";
import { queryClient } from "./app/queryClient";
import { initializeMonitoring, reportBundleSize, monitorMemoryUsage } from "./lib/monitoring";
import "./index.css";

// Initialize enterprise monitoring
initializeMonitoring();

// Start performance monitoring
reportBundleSize();
setTimeout(monitorMemoryUsage, 5000); // Check memory after app load

// Install runtime guard before app starts
// Allow optional endpoints that may return 404
installRuntimeGuard([
  /\/api\/v2\/search\/grammar$/,  // Grammar endpoint is optional
  /\/api\/v2\/schema\/enums$/,    // Enums endpoint may be optional
]);

const root = createRoot(document.getElementById("root")!);
root.render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <VisualThemeProvider defaultTheme="v2" defaultDarkMode={false}>
        <BrowserRouter basename="/ui/v2">
          <App />
          <ThemeToggle />
        </BrowserRouter>
      </VisualThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

// Mark app as ready after initial render
// This gives the app time to load critical data and settle
setTimeout(() => {
  markAppReady();
}, 100);
