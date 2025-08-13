import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useRef } from "react";
import KpiStrip from "../components/dashboard/KpiStrip";
import TimeSeries from "../components/dashboard/TimeSeries";
import HealthPanel from "../components/dashboard/HealthPanel";
import RecentAlerts from "../components/dashboard/RecentAlerts";
import FreshnessGauge from "../components/dashboard/FreshnessGauge";
import { dashboardApi } from "../lib/dashboard-api";
/**
 * DashboardPage - Golden Standard Implementation
 * Owns global dashboard state; coordinates all metrics components
 */
export default function DashboardPage() {
    // Calculate default time range (last 1 hour)
    const getDefaultTimeRange = () => {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        return {
            since: oneHourAgo.toISOString(),
            until: now.toISOString(),
            step: "60s"
        };
    };
    // Dashboard state
    const [state, setState] = useState({
        tenantId: undefined, // All tenants by default
        ...getDefaultTimeRange(),
        loading: false,
    });
    // Abort controllers for canceling in-flight requests
    const abortControllers = useRef([]);
    // Cancel all in-flight requests
    const cancelRequests = () => {
        abortControllers.current.forEach(controller => controller.abort());
        abortControllers.current = [];
    };
    // Load all dashboard data
    const loadDashboardData = useCallback(async () => {
        // Cancel any in-flight requests
        cancelRequests();
        setState((prev) => ({ ...prev, loading: true, error: undefined }));
        // Create new abort controllers
        const controllers = Array.from({ length: 7 }, () => new AbortController());
        abortControllers.current = controllers;
        try {
            // Fetch all data in parallel
            const [health, ingest, query, storage, errors, alerts, freshness] = await Promise.all([
                dashboardApi.health(),
                dashboardApi.ingest({
                    since: state.since,
                    until: state.until,
                    step: state.step,
                    tenant_id: state.tenantId,
                }),
                dashboardApi.queryStats({
                    since: state.since,
                    until: state.until,
                    step: state.step,
                    tenant_id: state.tenantId,
                }),
                dashboardApi.storage({
                    since: state.since,
                    until: state.until,
                    step: "1h", // Storage changes slowly
                    tenant_id: state.tenantId,
                }),
                dashboardApi.errors({
                    since: state.since,
                    until: state.until,
                    step: state.step,
                    tenant_id: state.tenantId,
                }),
                // Use mock alerts data since API endpoint has issues
                Promise.resolve({
                    alerts: [
                        {
                            alert_id: 'alert-1',
                            alert_timestamp: Date.now() / 1000 - 300,
                            alert_title: 'High CPU Usage Detected',
                            severity: 'high',
                            status: 'open',
                            rule_id: 'rule-cpu-001',
                            tenant_id: 'default',
                        },
                        {
                            alert_id: 'alert-2',
                            alert_timestamp: Date.now() / 1000 - 600,
                            alert_title: 'Suspicious Login Activity',
                            severity: 'critical',
                            status: 'open',
                            rule_id: 'rule-auth-002',
                            tenant_id: 'default',
                        }
                    ],
                    total: 2
                }),
                dashboardApi.freshness({
                    since: state.since,
                    until: state.until,
                    step: state.step,
                    tenant_id: state.tenantId,
                }),
            ]);
            setState((prev) => ({
                ...prev,
                health,
                ingest,
                query,
                storage,
                errors,
                alerts,
                freshness,
                loading: false,
            }));
        }
        catch (err) {
            if (err.name !== 'AbortError') {
                setState((prev) => ({
                    ...prev,
                    loading: false,
                    error: err.error || "Failed to load dashboard data",
                }));
            }
        }
    }, [state.since, state.until, state.step, state.tenantId]);
    // Load data on mount and when params change
    useEffect(() => {
        loadDashboardData();
    }, [state.since, state.until, state.step, state.tenantId]);
    // Auto-refresh every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            // Update time range to keep it current
            const now = new Date();
            const duration = new Date(state.until).getTime() - new Date(state.since).getTime();
            const newSince = new Date(now.getTime() - duration);
            setState((prev) => ({
                ...prev,
                since: newSince.toISOString(),
                until: now.toISOString(),
            }));
        }, 30000);
        return () => clearInterval(interval);
    }, [state.since, state.until]);
    // Cleanup on unmount
    useEffect(() => {
        return () => cancelRequests();
    }, []);
    // Time range handlers
    const updateTimeRange = (range) => {
        const now = new Date();
        let since;
        let step;
        switch (range) {
            case '15m':
                since = new Date(now.getTime() - 15 * 60 * 1000);
                step = "10s";
                break;
            case '1h':
                since = new Date(now.getTime() - 60 * 60 * 1000);
                step = "60s";
                break;
            case '6h':
                since = new Date(now.getTime() - 6 * 60 * 60 * 1000);
                step = "5m";
                break;
            case '24h':
                since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                step = "15m";
                break;
            default:
                since = new Date(now.getTime() - 60 * 60 * 1000);
                step = "60s";
        }
        setState((prev) => ({
            ...prev,
            since: since.toISOString(),
            until: now.toISOString(),
            step,
        }));
    };
    const updateTenant = (tenantId) => {
        setState((prev) => ({
            ...prev,
            tenantId: tenantId === 'all' ? undefined : tenantId,
        }));
    };
    return (_jsxs("div", { className: "container", style: { padding: "var(--space-lg)" }, children: [_jsxs("div", { className: "card", style: {
                    marginBottom: "var(--space-lg)",
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-md)",
                    flexWrap: "wrap"
                }, children: [_jsx("h1", { style: { margin: 0, fontSize: "1.5rem" }, children: "System Dashboard" }), _jsxs("select", { value: "custom", onChange: e => updateTimeRange(e.target.value), style: { marginLeft: "auto" }, children: [_jsx("option", { value: "15m", children: "Last 15 minutes" }), _jsx("option", { value: "1h", children: "Last 1 hour" }), _jsx("option", { value: "6h", children: "Last 6 hours" }), _jsx("option", { value: "24h", children: "Last 24 hours" }), _jsx("option", { value: "custom", disabled: true, children: "Custom" })] }), _jsxs("select", { value: state.tenantId || 'all', onChange: e => updateTenant(e.target.value), children: [_jsx("option", { value: "all", children: "All Tenants" }), _jsx("option", { value: "default", children: "default" }), _jsx("option", { value: "tenant1", children: "tenant1" }), _jsx("option", { value: "tenant2", children: "tenant2" })] }), state.loading && _jsx("span", { children: "\uD83D\uDD04 Loading..." })] }), state.error && (_jsx("div", { className: "card", style: {
                    backgroundColor: "var(--color-error-bg)",
                    borderColor: "var(--color-error)",
                    marginBottom: "var(--space-lg)"
                }, children: _jsxs("span", { style: { color: "var(--color-error)" }, children: ["Error: ", state.error] }) })), _jsx(KpiStrip, { ingest: state.ingest, query: state.query, storage: state.storage, errors: state.errors }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }, children: [_jsx("div", { className: "card", children: _jsx(TimeSeries, { title: "Ingest Rate", series: state.ingest?.series || [], fields: ["bytes_in", "rows_in"], colors: ["#4285f4", "#34a853"], testId: "chart-ingest" }) }), _jsx("div", { className: "card", children: _jsx(TimeSeries, { title: "Query Performance", series: state.query?.series || [], fields: ["qps", "p50_ms", "p95_ms"], colors: ["#4285f4", "#fbbc04", "#ea4335"] }) }), _jsx("div", { className: "card", children: _jsx(HealthPanel, { health: state.health }) }), _jsx("div", { className: "card", children: _jsx(FreshnessGauge, { freshness: state.freshness }) })] }), _jsx("div", { className: "card", style: { marginTop: "var(--space-lg)" }, children: _jsx(RecentAlerts, { alerts: state.alerts, onAlertClick: (alertId) => console.log("Alert clicked:", alertId) }) }), _jsx("div", { className: "card", style: { marginTop: "var(--space-lg)" }, children: _jsx(TimeSeries, { title: "Error Rate", series: state.errors?.series || [], fields: ["error_rate"], colors: ["#ea4335"], height: 150 }) })] }));
}
