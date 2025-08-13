import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./pages/App";
import { installRuntimeGuard, markAppReady } from "./lib/runtimeGuard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

// Install runtime guard before app starts
// Allow optional endpoints that may return 404
installRuntimeGuard([
  /\/api\/v2\/search\/grammar$/,  // Grammar endpoint is optional
  /\/api\/v2\/schema\/enums$/,    // Enums endpoint may be optional
]);

const root = createRoot(document.getElementById("root")!);
root.render(
  <ErrorBoundary>
    <BrowserRouter basename="/ui/v2">
      <App />
    </BrowserRouter>
  </ErrorBoundary>
);

// Mark app as ready after initial render
// This gives the app time to load critical data and settle
setTimeout(() => {
  markAppReady();
}, 100);
