#!/usr/bin/env node

// Simple API server to provide missing endpoints for SIEM UI
// This bridges the gap between the UI expectations and the current Rust API

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
const PORT = 8090; // Different port to avoid conflicts
const RUST_API_BASE = 'http://localhost:8084';

// JWT Configuration - read from environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-here-change-this-in-production';
const JWT_ISSUER = process.env.JWT_ISSUER || 'siem-auth';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'siem-search';
const JWT_EXPIRATION_HOURS = parseInt(process.env.JWT_EXPIRATION_HOURS || '24', 10);

// Generate a default JWT token for proxy requests
function generateProxyToken() {
  const payload = {
    sub: 'proxy-user',
    tenant_id: 'default',
    roles: ['admin'],
    iat: Math.floor(Date.now() / 1000),
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    jti: crypto.randomUUID()
  };
  
  // Add expiration only if JWT_EXPIRATION_HOURS > 0 (permanent tokens when 0)
  if (JWT_EXPIRATION_HOURS > 0) {
    payload.exp = Math.floor(Date.now() / 1000) + (JWT_EXPIRATION_HOURS * 60 * 60);
  }
  
  return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256' });
}

// Middleware
app.use(cors());
app.use(express.json());

// Mock data for missing endpoints
const mockData = {
  // Dashboard data removed - now uses real data from Rust API only
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
    { id: '1', name: 'Windows Security Parser', type: 'JSON', status: 'Active', eventsProcessed: 0 },
    { id: '2', name: 'Syslog Parser', type: 'Regex', status: 'Active', eventsProcessed: 0 },
    { id: '3', name: 'Apache Parser', type: 'Grok', status: 'Active', eventsProcessed: 0 }
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
      totalEvents: 0,
      eventsPerSecond: 0,
      alertsGenerated: 0,
      rulesTriggered: 0
    }
  },
  alertNotes: {
    '550e8400-e29b-41d4-a716-446655440001': [
      {
        id: 'note-1',
        alertId: '550e8400-e29b-41d4-a716-446655440001',
        content: 'Initial investigation shows suspicious login attempts from multiple IPs.',
        createdBy: 'analyst1',
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:30:00Z'
      },
      {
        id: 'note-2',
        alertId: '550e8400-e29b-41d4-a716-446655440001',
        content: 'Escalated to security team for further analysis.',
        createdBy: 'analyst2',
        createdAt: '2024-01-15T11:15:00Z',
        updatedAt: '2024-01-15T11:15:00Z'
      }
    ]
  }
};

// Helper function to proxy requests to Rust API
async function proxyToRustAPI(req, res, endpoint) {
  console.log(`[PROXY] ${req.method} ${req.path} -> ${RUST_API_BASE}${endpoint}`);
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
}

// Helper function to safely proxy requests with error handling
async function safeProxyToRustAPI(req, res, endpoint) {
  try {
    await proxyToRustAPI(req, res, endpoint);
    return true;
  } catch (error) {
    console.log(`[PROXY ERROR] ${req.method} ${req.path} -> ${RUST_API_BASE}${endpoint}:`, error.message);
    return false;
  }
}

// Helper function to proxy SSE streams
async function proxySSE(req, res, endpoint) {
  try {
    console.log(`[SSE PROXY] ${req.method} ${req.path} -> ${RUST_API_BASE}${endpoint}`);
    
    const response = await axios({
      method: req.method,
      url: `${RUST_API_BASE}${endpoint}`,
      responseType: 'stream',
      headers: {
        'Authorization': req.headers.authorization,
        'Accept': 'text/event-stream'
      }
    });

    // Set SSE headers only after successful connection
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Pipe the stream
    response.data.pipe(res);
    
    // Handle client disconnect
    req.on('close', () => {
      response.data.destroy();
    });
    
  } catch (error) {
    console.log(`[SSE PROXY ERROR] ${req.method} ${req.path} -> ${RUST_API_BASE}${endpoint}:`, error.message);
    
    // Check if headers haven't been sent yet
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('SSE proxy error');
    }
  }
}

// Dashboard endpoints - now proxied to Rust API
// app.get('/api/v1/dashboard', (req, res) => {
//   res.json({
//     success: true,
//     data: mockData.dashboard
//   });
// });

// app.get('/api/v1/dashboard/kpis', (req, res) => {
//   res.json({
//     success: true,
//     data: mockData.dashboard.kpis
//   });
// });

// app.get('/api/v1/dashboard/alerts-over-time', (req, res) => {
//   res.json({
//     success: true,
//     data: mockData.dashboard.alertsOverTime
//   });
// });

// app.get('/api/v1/dashboard/top-sources', (req, res) => {
//   res.json({
//     success: true,
//     data: mockData.dashboard.topSources
//   });
// });

// Enhanced dashboard proxy with fallback to mock data
app.all('/api/v1/dashboard*', async (req, res) => {
  try {
    const rustPath = req.path; // Keep the full path including /api/v1
    console.log(`[PROXY] ${req.method} ${req.path} -> ${RUST_API_BASE}${rustPath}`);
    
    // Require proper authentication - no fallback token generation
    if (!req.headers.authorization) {
      return res.status(401).json({ 
        error: 'Authentication required', 
        message: 'Authorization header is missing' 
      });
    }
    
    const response = await axios({
      method: req.method,
      url: `${RUST_API_BASE}${rustPath}`,
      data: req.body,
      headers: {
        'Authorization': req.headers.authorization,
        'Content-Type': 'application/json'
      },
      timeout: 5000 // 5 second timeout
    });
    
    // Return the actual response from Rust API
    res.status(response.status).json(response.data);
    
  } catch (error) {
    console.error(`[ERROR] Dashboard API error: ${error.message}`);
    
    if (error.response) {
      // Forward the error response from Rust API
      res.status(error.response.status).json(error.response.data);
    } else if (error.code === 'ECONNREFUSED') {
      res.status(503).json({ 
        error: 'Service unavailable', 
        message: 'ClickHouse search service is not running on port 8084' 
      });
    } else {
      res.status(500).json({ 
        error: 'Internal server error', 
        message: 'Failed to fetch dashboard data' 
      });
    }
  }
});

// Handle SSE streams specifically (must come before general alerts proxy)
app.get('/api/v1/alerts/*/notes/stream', (req, res) => {
  proxySSE(req, res, req.path.replace('/api/v1', ''));
});

// Enhanced alerts proxy with fallback for notes
app.all('/api/v1/alerts*', async (req, res) => {
  // Check if this is a notes endpoint and provide mock data if Rust backend fails
  if (req.path.includes('/notes') && !req.path.includes('/stream')) {
    const alertIdMatch = req.path.match(/\/alerts\/([^/]+)\/notes/);
    if (alertIdMatch) {
      const alertId = alertIdMatch[1];
      
      // Try Rust API first
      const success = await safeProxyToRustAPI(req, res, req.path.replace('/api/v1', ''));
      
      if (!success) {
        // Fallback to mock data if Rust API fails
        console.log(`[FALLBACK] Using mock data for notes endpoint: ${req.path}`);
        const notes = mockData.alertNotes[alertId] || [];
        
        if (req.method === 'GET') {
          res.json(notes);
        } else if (req.method === 'POST') {
          const newNote = {
            id: `note-${Date.now()}`,
            alertId: alertId,
            content: req.body.content || 'New note',
            createdBy: 'current-user',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          
          if (!mockData.alertNotes[alertId]) {
            mockData.alertNotes[alertId] = [];
          }
          mockData.alertNotes[alertId].push(newNote);
          
          res.status(201).json(newNote);
        } else {
          // If not GET or POST, return error
          res.status(405).json({ error: 'Method not allowed for notes endpoint' });
        }
      }
      return; // Important: return here to prevent further processing
    }
  }
  
  // For non-notes endpoints, just proxy to Rust API
  try {
    await proxyToRustAPI(req, res, req.path.replace('/api/v1', ''));
  } catch (error) {
    console.log(`[PROXY ERROR] ${req.method} ${req.path}:`, error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: 'Proxy error', message: error.message });
    }
  }
});

app.all('/api/v1/rules*', (req, res) => {
  proxyToRustAPI(req, res, req.path.replace('/api/v1', ''));
});

app.all('/api/v1/cases*', (req, res) => {
  proxyToRustAPI(req, res, req.path.replace('/api/v1', ''));
});

// Events proxy - now uses real ClickHouse data only
app.all('/api/v1/events*', async (req, res) => {
  try {
    const rustPath = req.path.replace('/api/v1', '');
    console.log(`[PROXY] ${req.method} ${req.path} -> ${RUST_API_BASE}${rustPath}`);
    const response = await axios({
      method: req.method,
      url: `${RUST_API_BASE}${rustPath}`,
      data: req.body,
      headers: {
        'Authorization': req.headers.authorization,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✓ Using real data from ClickHouse via Rust API');
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Error proxying events request:', error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: 'Failed to fetch events data from ClickHouse', message: error.message });
    }
  }
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