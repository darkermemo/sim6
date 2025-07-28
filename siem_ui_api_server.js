#!/usr/bin/env node

// Simple API server to provide missing endpoints for SIEM UI
// This bridges the gap between the UI expectations and the current Rust API

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = 8081; // Different port to avoid conflicts
const RUST_API_BASE = 'http://localhost:8080/api/v1';

// Middleware
app.use(cors());
app.use(express.json());

// Mock data for missing endpoints
const mockData = {
  dashboard: {
    kpis: {
      totalEvents24h: 125000,
      newAlerts24h: 287,
      casesOpened: 14,
      epsLive: 1450,
      queueCounter: 0,
      totalStorageBytes: 2147483648,
      filteredStorageBytes: 1073741824
    },
    alertsOverTime: [
      { hour: '00:00', critical: 5, high: 12, medium: 25, low: 8 },
      { hour: '01:00', critical: 3, high: 8, medium: 18, low: 12 },
      { hour: '02:00', critical: 2, high: 6, medium: 15, low: 9 },
      { hour: '03:00', critical: 1, high: 4, medium: 12, low: 7 },
      { hour: '04:00', critical: 4, high: 9, medium: 22, low: 11 }
    ],
    topSources: [
      { source: 'Windows Security', count: 45000 },
      { source: 'Firewall Logs', count: 32000 },
      { source: 'Web Server', count: 28000 },
      { source: 'Database', count: 15000 },
      { source: 'Email Server', count: 5000 }
    ]
  },
  users: [
    { id: '1', username: 'admin', email: 'admin@company.com', role: 'Administrator', status: 'Active' },
    { id: '2', username: 'analyst1', email: 'analyst1@company.com', role: 'Analyst', status: 'Active' },
    { id: '3', username: 'analyst2', email: 'analyst2@company.com', role: 'Analyst', status: 'Active' }
  ],
  logSources: [
    { id: '1', name: 'Windows Security', type: 'Windows Event Log', status: 'Active', eventsPerSec: 450 },
    { id: '2', name: 'Firewall Logs', type: 'Syslog', status: 'Active', eventsPerSec: 320 },
    { id: '3', name: 'Web Server', type: 'Apache Access Log', status: 'Active', eventsPerSec: 280 }
  ],
  parsers: [
    { id: '1', name: 'Windows Security Parser', type: 'JSON', status: 'Active', eventsProcessed: 1250000 },
    { id: '2', name: 'Syslog Parser', type: 'Regex', status: 'Active', eventsProcessed: 980000 },
    { id: '3', name: 'Apache Parser', type: 'Grok', status: 'Active', eventsProcessed: 750000 }
  ],
  agents: [
    { id: '1', hostname: 'web-server-01', ip: '192.168.1.10', status: 'Online', lastSeen: Date.now() },
    { id: '2', hostname: 'db-server-01', ip: '192.168.1.20', status: 'Online', lastSeen: Date.now() },
    { id: '3', hostname: 'mail-server-01', ip: '192.168.1.30', status: 'Offline', lastSeen: Date.now() - 300000 }
  ],
  tenants: [
    { id: '1', name: 'default', description: 'Default tenant', status: 'Active', created: '2024-01-01T00:00:00Z' },
    { id: '2', name: 'security-team', description: 'Security team tenant', status: 'Active', created: '2024-01-15T00:00:00Z' }
  ],
  metrics: {
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
  }
};

// Helper function to proxy requests to Rust API
async function proxyToRustAPI(req, res, endpoint) {
  try {
    const response = await axios({
      method: req.method,
      url: `${RUST_API_BASE}${endpoint}`,
      data: req.body,
      headers: {
        'Authorization': req.headers.authorization,
        'Content-Type': 'application/json'
      }
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: 'Proxy error', message: error.message });
    }
  }
}

// Dashboard endpoints
app.get('/api/v1/dashboard', (req, res) => {
  res.json({
    success: true,
    data: mockData.dashboard
  });
});

app.get('/api/v1/dashboard/kpis', (req, res) => {
  res.json({
    success: true,
    data: mockData.dashboard.kpis
  });
});

app.get('/api/v1/dashboard/alerts-over-time', (req, res) => {
  res.json({
    success: true,
    data: mockData.dashboard.alertsOverTime
  });
});

app.get('/api/v1/dashboard/top-sources', (req, res) => {
  res.json({
    success: true,
    data: mockData.dashboard.topSources
  });
});

// Proxy existing endpoints to Rust API
app.all('/api/v1/alerts*', (req, res) => {
  proxyToRustAPI(req, res, req.path.replace('/api/v1', ''));
});

app.all('/api/v1/rules*', (req, res) => {
  proxyToRustAPI(req, res, req.path.replace('/api/v1', ''));
});

app.all('/api/v1/cases*', (req, res) => {
  proxyToRustAPI(req, res, req.path.replace('/api/v1', ''));
});

app.all('/api/v1/events*', (req, res) => {
  proxyToRustAPI(req, res, req.path.replace('/api/v1', ''));
});

// Mock endpoints for missing functionality
app.get('/api/v1/users', (req, res) => {
  res.json({
    success: true,
    data: mockData.users
  });
});

app.get('/api/v1/log-sources', (req, res) => {
  res.json({
    success: true,
    data: mockData.logSources
  });
});

app.get('/api/v1/log_sources', (req, res) => {
  res.json({
    success: true,
    data: mockData.logSources
  });
});

app.get('/api/v1/parsers', (req, res) => {
  res.json({
    success: true,
    data: mockData.parsers
  });
});

app.get('/api/v1/agents', (req, res) => {
  res.json({
    success: true,
    data: mockData.agents
  });
});

app.get('/api/v1/agents/fleet', (req, res) => {
  res.json({
    success: true,
    data: mockData.agents
  });
});

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      api: 'online',
      database: 'online',
      kafka: 'online'
    }
  });
});

// Tenants endpoint
app.get('/api/v1/tenants', (req, res) => {
  res.json({
    success: true,
    data: mockData.tenants
  });
});

// Metrics endpoint
app.get('/api/v1/metrics', (req, res) => {
  res.json({
    success: true,
    data: mockData.metrics
  });
});

app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Catch-all for other endpoints
app.all('/api/v1/*', (req, res) => {
  proxyToRustAPI(req, res, req.path.replace('/api/v1', ''));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 SIEM UI API Server running on http://localhost:${PORT}`);
  console.log(`📡 Proxying to Rust API at ${RUST_API_BASE}`);
  console.log(`🎯 Providing mock data for missing endpoints`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down SIEM UI API Server...');
  process.exit(0);
});