import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics for detailed monitoring
export const apiQueriesExecuted = new Counter('api_queries_executed');
export const apiQueryErrors = new Counter('api_query_errors');
export const apiQuerySuccessRate = new Rate('api_query_success_rate');
export const apiQueryDuration = new Trend('api_query_duration');
export const authenticationErrors = new Counter('authentication_errors');
export const rateLimitHits = new Counter('rate_limit_hits');

// Test configuration
export const options = {
  scenarios: {
    // Scenario 2A: Concurrent Query Load
    concurrent_queries: {
      executor: 'ramping-vus',
      exec: 'concurrentQueries',
      startVUs: 1,
      stages: [
        { duration: '2m', target: 10 },   // Ramp to 10 concurrent users
        { duration: '5m', target: 10 },   // Sustain 10 users for 5 minutes
        { duration: '2m', target: 25 },   // Ramp to 25 concurrent users
        { duration: '5m', target: 25 },   // Sustain 25 users for 5 minutes
        { duration: '2m', target: 50 },   // Ramp to 50 concurrent users
        { duration: '5m', target: 50 },   // Sustain 50 users for 5 minutes
        { duration: '2m', target: 100 },  // Ramp to 100 concurrent users
        { duration: '10m', target: 100 }, // Sustain 100 users for 10 minutes
        { duration: '2m', target: 150 },  // Stress test: 150 users
        { duration: '5m', target: 150 },  // Sustain stress load
        { duration: '3m', target: 50 },   // Scale down to manageable load
        { duration: '2m', target: 0 },    // Graceful shutdown
      ],
    },

    // Scenario 2B: Heavy Query Load (Complex Queries)
    heavy_queries: {
      executor: 'ramping-vus',
      exec: 'heavyQueries', 
      startVUs: 1,
      stages: [
        { duration: '5m', target: 5 },    // Start with 5 users running complex queries
        { duration: '10m', target: 10 },  // Ramp to 10 users
        { duration: '10m', target: 15 },  // Ramp to 15 users
        { duration: '10m', target: 20 },  // Stress test with 20 heavy queries
        { duration: '5m', target: 10 },   // Scale down
        { duration: '2m', target: 0 },    // Shutdown
      ],
    }
  },
  thresholds: {
    // Performance thresholds based on requirements
    'http_req_duration': ['p(95)<500'],  // 95% of requests under 500ms
    'http_req_failed': ['rate<0.001'],   // Less than 0.1% failure rate 
    'api_query_success_rate': ['rate>0.999'], // 99.9% success rate
    'http_req_duration{scenario:concurrent_queries}': ['p(95)<500'],
    'http_req_duration{scenario:heavy_queries}': ['p(95)<2000'], // Heavy queries can take longer
    'api_query_duration': ['p(95)<500', 'p(99)<1000'],
  },
};

// Environment configuration
const API_BASE_URL = __ENV.API_URL || 'http://localhost:8080';
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || '';
const ANALYST_TOKEN = __ENV.ANALYST_TOKEN || '';

// Shared test data for authentication
let authTokens = {
  admin: '',
  analyst: ''
};

// Query templates for realistic API testing
const queryTemplates = [
  // Basic event queries
  {
    endpoint: '/v1/events',
    params: {
      limit: 100,
      tenant_id: 'tenant-A'
    },
    description: 'Recent events query'
  },
  {
    endpoint: '/v1/events', 
    params: {
      limit: 50,
      source_ip: '192.168.1.100',
      tenant_id: 'tenant-A'
    },
    description: 'Events by source IP'
  },
  {
    endpoint: '/v1/events',
    params: {
      limit: 200,
      event_category: 'Authentication',
      tenant_id: 'tenant-A'
    },
    description: 'Authentication events'
  },
  {
    endpoint: '/v1/events',
    params: {
      limit: 150,
      event_outcome: 'Failure', 
      tenant_id: 'tenant-A'
    },
    description: 'Failed events query'
  },
  
  // Alert and rule queries
  {
    endpoint: '/v1/alerts',
    params: {
      tenant_id: 'tenant-A'
    },
    description: 'Active alerts query'
  },
  {
    endpoint: '/v1/rules',
    params: {
      tenant_id: 'tenant-A'
    },
    description: 'Detection rules query'
  },
  
  // Time-based queries
  {
    endpoint: '/v1/events',
    params: {
      limit: 500,
      start_time: Math.floor(Date.now() / 1000) - 3600, // Last hour
      tenant_id: 'tenant-A'
    },
    description: 'Last hour events'
  },
  {
    endpoint: '/v1/events',
    params: {
      limit: 1000,
      start_time: Math.floor(Date.now() / 1000) - 86400, // Last 24 hours
      tenant_id: 'tenant-A'
    },
    description: 'Last 24 hours events'
  }
];

// Heavy/complex query templates
const heavyQueryTemplates = [
  {
    endpoint: '/v1/events',
    params: {
      limit: 5000,
      start_time: Math.floor(Date.now() / 1000) - 604800, // Last week
      tenant_id: 'tenant-A'
    },
    description: 'Large time range query (week)'
  },
  {
    endpoint: '/v1/events',
    params: {
      limit: 10000,
      tenant_id: 'tenant-A'
    },
    description: 'Large result set query'
  },
  {
    endpoint: '/v1/events',
    params: {
      limit: 2000,
      event_category: 'Network',
      event_outcome: 'Failure',
      start_time: Math.floor(Date.now() / 1000) - 172800, // Last 2 days
      tenant_id: 'tenant-A'
    },
    description: 'Complex multi-filter query'
  }
];

// Generate authentication token for testing
function generateToken(userType) {
  const url = `${API_BASE_URL}/v1/auth/token`;
  const payload = {
    username: userType === 'admin' ? 'alice' : 'bob',
    password: 'password123', // This should match your test user setup
    tenant_id: 'tenant-A'
  };
  
  const response = http.post(url, JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  if (response.status === 200) {
    try {
      const body = JSON.parse(response.body);
      return body.token || body.access_token;
    } catch (e) {
      console.error(`Failed to parse token response: ${e}`);
      return null;
    }
  } else {
    console.error(`Authentication failed for ${userType}: ${response.status} - ${response.body}`);
    authenticationErrors.add(1);
    return null;
  }
}

// Execute API query with authentication
function executeQuery(queryTemplate, token, userType = 'analyst') {
  if (!token) {
    console.error(`No valid token for ${userType}`);
    authenticationErrors.add(1);
    return false;
  }

  const url = `${API_BASE_URL}${queryTemplate.endpoint}`;
  const params = {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: '30s',
  };

  // Build query string
  const queryString = Object.keys(queryTemplate.params)
    .map(key => `${key}=${encodeURIComponent(queryTemplate.params[key])}`)
    .join('&');
  
  const fullUrl = queryString ? `${url}?${queryString}` : url;

  const startTime = Date.now();
  const response = http.get(fullUrl, params);
  const duration = Date.now() - startTime;

  // Record metrics
  apiQueriesExecuted.add(1);
  apiQueryDuration.add(duration);

  const success = check(response, {
    [`${queryTemplate.description} - status is 200`]: (r) => r.status === 200,
    [`${queryTemplate.description} - response time acceptable`]: (r) => r.timings.duration < 30000,
    [`${queryTemplate.description} - valid JSON response`]: (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch (e) {
        return false;
      }
    },
    [`${queryTemplate.description} - no server errors`]: (r) => r.status < 500,
  });

  // Track specific error types
  if (response.status === 429) {
    rateLimitHits.add(1);
    console.log(`Rate limit hit for ${queryTemplate.description}`);
  } else if (response.status === 401 || response.status === 403) {
    authenticationErrors.add(1);
    console.error(`Auth error for ${queryTemplate.description}: ${response.status}`);
  } else if (!success) {
    apiQueryErrors.add(1);
    console.error(`Query failed for ${queryTemplate.description}: ${response.status} - ${response.body}`);
  }

  apiQuerySuccessRate.add(success);
  return success;
}

// Main test functions
export function concurrentQueries() {
  // Use analyst token for concurrent queries (most common use case)
  const token = authTokens.analyst || ANALYST_TOKEN;
  
  if (!token) {
    console.error('No analyst token available for concurrent queries');
    return;
  }

  // Select a random query template
  const queryTemplate = randomItem(queryTemplates);
  
  // Execute the query
  executeQuery(queryTemplate, token, 'analyst');

  // Realistic think time between queries (1-5 seconds)
  const thinkTime = Math.random() * 4 + 1;
  sleep(thinkTime);
}

export function heavyQueries() {
  // Use admin token for heavy queries (may need higher privileges)
  const token = authTokens.admin || ADMIN_TOKEN;
  
  if (!token) {
    console.error('No admin token available for heavy queries');
    return;
  }

  // Select a random heavy query template
  const queryTemplate = randomItem(heavyQueryTemplates);
  
  // Execute the heavy query
  executeQuery(queryTemplate, token, 'admin');

  // Longer think time for heavy queries (5-10 seconds)
  const thinkTime = Math.random() * 5 + 5;
  sleep(thinkTime);
}

// Test lifecycle hooks
export function setup() {
  console.log('🚀 Starting SIEM API Query Stress Test');
  console.log(`📊 Target configuration:`);
  console.log(`   - API URL: ${API_BASE_URL}`);
  console.log(`   - Query templates: ${queryTemplates.length} standard, ${heavyQueryTemplates.length} heavy`);
  
  // Pre-populate database check
  console.log('🔍 Verifying test prerequisites...');
  
  // Check API health
  const healthResponse = http.get(`${API_BASE_URL}/v1/health`);
  if (healthResponse.status !== 200) {
    console.error(`❌ API service not available: ${healthResponse.status}`);
    throw new Error('API service not available');
  }

  // Generate authentication tokens if not provided
  if (!ADMIN_TOKEN) {
    console.log('🔑 Generating admin authentication token...');
    authTokens.admin = generateToken('admin');
  } else {
    authTokens.admin = ADMIN_TOKEN;
  }

  if (!ANALYST_TOKEN) {
    console.log('🔑 Generating analyst authentication token...');
    authTokens.analyst = generateToken('analyst');
  } else {
    authTokens.analyst = ANALYST_TOKEN;
  }

  if (!authTokens.admin || !authTokens.analyst) {
    console.error('❌ Failed to obtain authentication tokens');
    throw new Error('Authentication setup failed');
  }

  // Verify database has sufficient data
  console.log('📊 Checking database population...');
  const eventCountQuery = `${API_BASE_URL}/v1/events?limit=1&tenant_id=tenant-A`;
  const eventCheck = http.get(eventCountQuery, {
    headers: { 'Authorization': `Bearer ${authTokens.analyst}` }
  });
  
  if (eventCheck.status === 200) {
    console.log('✅ Database contains events for testing');
  } else {
    console.warn('⚠️  Database may not have sufficient test data');
    console.warn('    Consider running ingestion load test first');
  }
  
  console.log('✅ All prerequisites met');
  console.log('🎯 API stress test starting...');
  
  return {
    adminToken: authTokens.admin,
    analystToken: authTokens.analyst
  };
}

export function teardown(data) {
  console.log('📈 API stress test completed!');
  console.log(`📊 Final metrics summary:`);
  console.log(`   - Total API queries executed: ${apiQueriesExecuted.count}`);
  console.log(`   - Total query errors: ${apiQueryErrors.count}`);
  console.log(`   - Success rate: ${(apiQuerySuccessRate.rate * 100).toFixed(2)}%`);
  console.log(`   - Average query time: ${apiQueryDuration.avg.toFixed(2)}ms`);
  console.log(`   - P95 query time: ${apiQueryDuration.p95.toFixed(2)}ms`);
  console.log(`   - Authentication errors: ${authenticationErrors.count}`);
  console.log(`   - Rate limit hits: ${rateLimitHits.count}`);
  
  // Verification recommendations
  console.log('🔍 Post-test verification steps:');
  console.log('   1. Check ClickHouse query performance metrics');
  console.log('   2. Review API server resource utilization');
  console.log('   3. Verify no memory leaks in API service');
  console.log('   4. Check for any authentication system issues');
  console.log('   5. Review rate limiting effectiveness');
} 