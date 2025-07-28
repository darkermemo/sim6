/**
 * Mock Service Worker handlers for SIEM API endpoints
 * Provides consistent mock data for development and testing
 */
import { http, HttpResponse } from 'msw';

// Mock data for various SIEM endpoints
const mockTenants = [
  { id: 'tenant-1', name: 'Default Tenant', description: 'Default tenant for SIEM', status: 'Active', created: '2024-01-01T00:00:00Z' },
  { id: 'tenant-2', name: 'Security Team', description: 'Security team tenant', status: 'Active', created: '2024-01-15T00:00:00Z' }
];

const mockLogSources = [
  { id: '1', name: 'Windows Security', type: 'Windows Event Log', status: 'Active', eventsPerSec: 450, ipAddress: '192.168.1.10' },
  { id: '2', name: 'Firewall Logs', type: 'Syslog', status: 'Active', eventsPerSec: 320, ipAddress: '192.168.1.1' },
  { id: '3', name: 'Web Server', type: 'Apache Access Log', status: 'Active', eventsPerSec: 280, ipAddress: '192.168.1.20' }
];

const mockAlerts = [
  {
    id: '1',
    title: 'Suspicious Login Activity',
    severity: 'High',
    status: 'Open',
    timestamp: '2024-01-20T10:30:00Z',
    source: 'Windows Security',
    description: 'Multiple failed login attempts detected'
  },
  {
    id: '2',
    title: 'Unusual Network Traffic',
    severity: 'Medium',
    status: 'Investigating',
    timestamp: '2024-01-20T09:15:00Z',
    source: 'Firewall Logs',
    description: 'High volume of outbound traffic detected'
  }
];

const mockMetrics = {
  systemHealth: {
    cpu: 45.2,
    memory: 67.8,
    disk: 23.1,
    network: 12.5
  },
  eventMetrics: {
    totalEvents: 1250000,
    eventsPerSecond: 1450,
    alertsGenerated: 287,
    rulesTriggered: 156
  }
};

const mockRules = [
  {
    id: '1',
    name: 'Failed Login Detection',
    description: 'Detects multiple failed login attempts',
    severity: 'High',
    enabled: true,
    lastTriggered: '2024-01-20T10:30:00Z'
  },
  {
    id: '2',
    name: 'Privilege Escalation',
    description: 'Detects potential privilege escalation attempts',
    severity: 'Critical',
    enabled: true,
    lastTriggered: '2024-01-20T08:45:00Z'
  }
];

export const handlers = [
  // Authentication endpoints
  http.post('/api/v1/auth/login', () => {
    return HttpResponse.json({
      success: true,
      data: {
        token: 'mock-jwt-token',
        user: {
          id: '1',
          username: 'admin',
          email: 'admin@siem.local',
          role: 'admin'
        }
      }
    });
  }),

  // Health check
  http.get('/api/v1/health', () => {
    return HttpResponse.json({ status: 'healthy', timestamp: new Date().toISOString() });
  }),

  // Tenants
  http.get('/api/v1/tenants', () => {
    return HttpResponse.json({ success: true, data: mockTenants });
  }),

  // Log Sources
  http.get('/api/v1/log_sources', () => {
    return HttpResponse.json({ success: true, data: mockLogSources });
  }),

  http.post('/api/v1/log_sources', () => {
    return HttpResponse.json({
      success: true,
      data: {
        id: '4',
        name: 'New Log Source',
        type: 'Custom',
        status: 'Active',
        eventsPerSec: 0,
        ipAddress: '192.168.1.30'
      }
    }, { status: 201 });
  }),

  // Alerts
  http.get('/api/v1/alerts', () => {
    return HttpResponse.json({ success: true, data: mockAlerts });
  }),

  // Metrics
  http.get('/api/v1/metrics', () => {
    return HttpResponse.json({ success: true, data: mockMetrics });
  }),

  // Rules
  http.get('/api/v1/rules', () => {
    return HttpResponse.json({ success: true, data: mockRules });
  }),

  http.post('/api/v1/rules', () => {
    return HttpResponse.json({
      success: true,
      data: {
        id: '3',
        name: 'New Rule',
        description: 'New detection rule',
        severity: 'Medium',
        enabled: true,
        lastTriggered: null
      }
    }, { status: 201 });
  }),

  // Dashboard KPIs
  http.get('/api/v1/dashboard/kpis', () => {
    return HttpResponse.json({
      success: true,
      data: {
        totalEvents: 1250000,
        activeAlerts: 23,
        resolvedAlerts: 156,
        logSources: 12,
        rulesTriggered: 45
      }
    });
  }),

  // Error simulation for testing error handling
  http.get('/api/v1/simulate-error', () => {
    return HttpResponse.json({ success: false, error: 'Simulated server error' }, { status: 500 });
  }),

  // Fallback for unhandled requests
  http.get('*', ({ request }) => {
    console.warn(`Unhandled ${request.method} request to ${request.url}`);
    return HttpResponse.json({ success: false, error: 'Endpoint not found' }, { status: 404 });
  })
];