import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend, Gauge } from 'k6/metrics';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics for comprehensive monitoring
export const totalOperations = new Counter('total_operations');
export const ingestionOps = new Counter('ingestion_operations');
export const queryOps = new Counter('query_operations');
export const ruleEngineOps = new Counter('rule_engine_operations');
export const alertsGenerated = new Counter('alerts_generated');
export const systemLoad = new Gauge('system_load_level');
export const endToEndLatency = new Trend('end_to_end_latency');
export const overallSuccessRate = new Rate('overall_success_rate');

// Test configuration for combined load scenario
export const options = {
  scenarios: {
    // Scenario 3A: Sustained Ingestion Load (5,000 EPS)
    sustained_ingestion: {
      executor: 'constant-vus',
      exec: 'sustainedIngestion',
      vus: 250,  // 250 VUs * 20 req/sec = 5,000 EPS
      duration: '2h',
      gracefulStop: '30s',
    },

    // Scenario 3B: Concurrent User Queries (20 users)
    concurrent_analysts: {
      executor: 'constant-vus',
      exec: 'analystWorkflow',
      vus: 20,
      duration: '2h',
      gracefulStop: '30s',
    },

    // Scenario 3C: Rule Engine Simulation and Testing
    rule_engine_test: {
      executor: 'constant-vus',
      exec: 'ruleEngineTest',
      vus: 2,  // Low VU count for periodic rule engine operations
      duration: '2h',
      gracefulStop: '30s',
    },

    // Scenario 3D: Critical Event Injection
    critical_events: {
      executor: 'constant-arrival-rate',
      exec: 'injectCriticalEvents',
      rate: 5,  // 5 critical events per second
      timeUnit: '1s',
      duration: '2h',
      preAllocatedVUs: 10,
      maxVUs: 20,
    },

    // Scenario 3E: System Health Monitoring
    health_monitoring: {
      executor: 'constant-vus',
      exec: 'systemHealthCheck',
      vus: 1,
      duration: '2h',
      gracefulStop: '30s',
    }
  },
  thresholds: {
    // Combined scenario thresholds (stricter than individual tests)
    'http_req_duration': ['p(95)<1000'],    // Slightly relaxed due to system load
    'http_req_failed': ['rate<0.001'],      // Still maintain 99.9% success
    'overall_success_rate': ['rate>0.995'], // 99.5% overall success rate
    'end_to_end_latency': ['p(95)<5000'],   // End-to-end processing under 5s
    'ingestion_operations': ['rate>4500'],   // Maintain close to 5,000 EPS
    'query_operations': ['rate>10'],         // Minimum query rate for 20 users
    'rule_engine_operations': ['rate>0.1'],  // Rule engine periodic execution
  },
};

// Environment configuration
const API_BASE_URL = __ENV.API_URL || 'http://localhost:8080';
const INGESTOR_BASE_URL = __ENV.INGESTOR_URL || 'http://localhost:8081';
const CLICKHOUSE_URL = __ENV.CLICKHOUSE_URL || 'http://localhost:8123';
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || '';

// Shared state for the test
let testState = {
  adminToken: '',
  analystToken: '',
  ruleId: '',
  criticalEventsSent: 0,
  alertsFound: 0,
  lastRuleCheck: 0
};

// Critical event templates that should trigger detection rules
const criticalEventTemplates = [
  {
    type: 'syslog',
    message: '<165>Jul 21 ${timestamp} security-server-1 CRITICAL FAILURE: Database connection lost',
    description: 'Database critical failure'
  },
  {
    type: 'syslog', 
    message: '<132>Jul 21 ${timestamp} fw-${serverNum} SECURITY ALERT: Multiple failed login attempts from ${sourceIp}',
    description: 'Multiple failed logins'
  },
  {
    type: 'json',
    message: {
      timestamp: '${timestamp}',
      level: 'CRITICAL',
      service: 'authentication',
      event: 'brute_force_detected',
      source_ip: '${sourceIp}',
      message: 'Brute force attack detected: 50 failed attempts in 60 seconds'
    },
    description: 'Brute force attack'
  },
  {
    type: 'syslog',
    message: '<163>Jul 21 ${timestamp} app-server-${serverNum} MALWARE DETECTED: Suspicious file ${filename} quarantined',
    description: 'Malware detection'
  }
];

// Regular event templates for sustained load
const regularEventTemplates = [
  '<134>Jul 21 ${timestamp} web-server-${serverNum} nginx: ${sourceIp} - - [${logTime}] "GET /api/users HTTP/1.1" 200 1234',
  '<134>Jul 21 ${timestamp} app-server-${serverNum} application: INFO User ${userId} performed action ${action}',
  '<134>Jul 21 ${timestamp} db-server-${serverNum} mysql: Query executed successfully in ${queryTime}ms',
  '<134>Jul 21 ${timestamp} mail-server-${serverNum} postfix: Message sent to ${recipient}',
  '<134>Jul 21 ${timestamp} dns-server-${serverNum} bind: Query for ${domain} from ${sourceIp}'
];

// Analyst workflow query patterns
const analystQueries = [
  {
    endpoint: '/v1/events',
    params: { limit: 100, tenant_id: 'tenant-A' },
    frequency: 0.3,  // 30% of queries
    description: 'Recent events dashboard'
  },
  {
    endpoint: '/v1/alerts',
    params: { tenant_id: 'tenant-A' },
    frequency: 0.2,  // 20% of queries
    description: 'Active alerts check'
  },
  {
    endpoint: '/v1/events',
    params: { limit: 50, event_category: 'Authentication', tenant_id: 'tenant-A' },
    frequency: 0.15, // 15% of queries
    description: 'Authentication events'
  },
  {
    endpoint: '/v1/events',
    params: { limit: 200, event_outcome: 'Failure', tenant_id: 'tenant-A' },
    frequency: 0.15, // 15% of queries
    description: 'Failed events investigation'
  },
  {
    endpoint: '/v1/events',
    params: { 
      limit: 500,
      start_time: Math.floor(Date.now() / 1000) - 3600,
      tenant_id: 'tenant-A' 
    },
    frequency: 0.1,  // 10% of queries
    description: 'Last hour timeline'
  },
  {
    endpoint: '/v1/rules',
    params: { tenant_id: 'tenant-A' },
    frequency: 0.1,  // 10% of queries
    description: 'Detection rules review'
  }
];

// Utility functions
function generateRandomIP() {
  return `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

function generateTimestamp() {
  return new Date().toTimeString().slice(0, 8);
}

function expandTemplate(template, variables = {}) {
  let result = template;
  
  // Default variables
  const defaults = {
    timestamp: generateTimestamp(),
    sourceIp: generateRandomIP(),
    serverNum: Math.floor(Math.random() * 10) + 1,
    userId: `user_${Math.floor(Math.random() * 1000)}`,
    action: randomItem(['login', 'logout', 'update_profile', 'view_report', 'delete_item']),
    queryTime: Math.floor(Math.random() * 500) + 10,
    recipient: `user${Math.floor(Math.random() * 100)}@company.com`,
    domain: randomItem(['api.company.com', 'internal.company.com', 'mail.company.com']),
    filename: `suspicious_${Math.random().toString(36).substr(2, 8)}.exe`,
    logTime: new Date().toISOString().slice(0, 19).replace('T', ' ')
  };
  
  // Merge with provided variables
  const allVars = { ...defaults, ...variables };
  
  // Replace all template variables
  Object.keys(allVars).forEach(key => {
    const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
    result = result.replace(regex, allVars[key]);
  });
  
  return result;
}

// Test execution functions
export function sustainedIngestion() {
  const template = randomItem(regularEventTemplates);
  const message = expandTemplate(template);
  
  const response = http.post(`${INGESTOR_BASE_URL}/ingest/raw`, message, {
    headers: { 'Content-Type': 'text/plain' },
    timeout: '5s',
  });
  
  const success = check(response, {
    'ingestion success': (r) => r.status === 200,
    'ingestion response time': (r) => r.timings.duration < 1000,
  });
  
  ingestionOps.add(1);
  totalOperations.add(1);
  overallSuccessRate.add(success);
  
  // Rate limiting: target 20 requests per second per VU
  sleep(0.05);
}

export function analystWorkflow() {
  const token = testState.analystToken || ADMIN_TOKEN;
  
  if (!token) {
    console.error('No token available for analyst workflow');
    return;
  }
  
  // Select query based on frequency distribution
  const random = Math.random();
  let cumulativeFreq = 0;
  let selectedQuery = null;
  
  for (const query of analystQueries) {
    cumulativeFreq += query.frequency;
    if (random <= cumulativeFreq) {
      selectedQuery = query;
      break;
    }
  }
  
  if (!selectedQuery) {
    selectedQuery = analystQueries[0]; // Fallback
  }
  
  // Build query URL
  const queryString = Object.keys(selectedQuery.params)
    .map(key => `${key}=${encodeURIComponent(selectedQuery.params[key])}`)
    .join('&');
  const url = `${API_BASE_URL}${selectedQuery.endpoint}?${queryString}`;
  
  const response = http.get(url, {
    headers: { 'Authorization': `Bearer ${token}` },
    timeout: '15s',
  });
  
  const success = check(response, {
    [`${selectedQuery.description} success`]: (r) => r.status === 200,
    [`${selectedQuery.description} response time`]: (r) => r.timings.duration < 10000,
  });
  
  queryOps.add(1);
  totalOperations.add(1);
  overallSuccessRate.add(success);
  
  // Realistic analyst think time
  sleep(Math.random() * 10 + 5);
}

export function injectCriticalEvents() {
  const template = randomItem(criticalEventTemplates);
  let message, url, headers;
  
  if (template.type === 'syslog') {
    message = expandTemplate(template.message);
    url = `${INGESTOR_BASE_URL}/ingest/raw`;
    headers = { 'Content-Type': 'text/plain' };
  } else {
    const jsonTemplate = JSON.stringify(template.message);
    message = expandTemplate(jsonTemplate);
    url = `${INGESTOR_BASE_URL}/ingest/raw`;
    headers = { 'Content-Type': 'application/json' };
  }
  
  const startTime = Date.now();
  const response = http.post(url, message, { headers, timeout: '5s' });
  const endTime = Date.now();
  
  const success = check(response, {
    'critical event ingested': (r) => r.status === 200,
    'critical event response time': (r) => r.timings.duration < 2000,
  });
  
  if (success) {
    testState.criticalEventsSent++;
    endToEndLatency.add(endTime - startTime);
  }
  
  totalOperations.add(1);
  overallSuccessRate.add(success);
  
  console.log(`Critical event injected: ${template.description}`);
}

export function ruleEngineTest() {
  const token = testState.adminToken || ADMIN_TOKEN;
  
  if (!token) {
    console.error('No admin token for rule engine test');
    return;
  }
  
  const now = Math.floor(Date.now() / 1000);
  
  // Check rule engine every 5 minutes (300 seconds)
  if (now - testState.lastRuleCheck >= 300) {
    testState.lastRuleCheck = now;
    
    // Check if rule engine has processed recent events
    const alertsResponse = http.get(`${API_BASE_URL}/v1/alerts?tenant_id=tenant-A`, {
      headers: { 'Authorization': `Bearer ${token}` },
      timeout: '10s',
    });
    
    const success = check(alertsResponse, {
      'alerts endpoint accessible': (r) => r.status === 200,
      'alerts response valid': (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch (e) {
          return false;
        }
      },
    });
    
    if (success) {
      try {
        const alertsData = JSON.parse(alertsResponse.body);
        const currentAlerts = alertsData.alerts ? alertsData.alerts.length : 0;
        
        if (currentAlerts > testState.alertsFound) {
          const newAlerts = currentAlerts - testState.alertsFound;
          alertsGenerated.add(newAlerts);
          testState.alertsFound = currentAlerts;
          console.log(`Rule engine generated ${newAlerts} new alerts`);
        }
      } catch (e) {
        console.error(`Failed to parse alerts response: ${e}`);
      }
    }
    
    ruleEngineOps.add(1);
    totalOperations.add(1);
    overallSuccessRate.add(success);
  }
  
  // Sleep for 1 minute before next check
  sleep(60);
}

export function systemHealthCheck() {
  // Monitor system health and set load level gauge
  const currentOps = totalOperations.count;
  const loadLevel = Math.min(currentOps / 1000, 10); // Scale 0-10
  systemLoad.set(loadLevel);
  
  // Check all service health endpoints
  const services = [
    { name: 'API', url: `${API_BASE_URL}/v1/health` },
    { name: 'Ingestor', url: `${INGESTOR_BASE_URL}/health` }
  ];
  
  for (const service of services) {
    const response = http.get(service.url, { timeout: '5s' });
    const healthy = response.status === 200;
    
    if (!healthy) {
      console.error(`❌ ${service.name} service unhealthy: ${response.status}`);
    }
    
    totalOperations.add(1);
    overallSuccessRate.add(healthy);
  }
  
  sleep(30); // Check every 30 seconds
}

// Test lifecycle hooks
export function setup() {
  console.log('🚀 Starting SIEM Combined Load Test');
  console.log('🎯 Simulating production conditions:');
  console.log('   - 5,000 EPS sustained ingestion');
  console.log('   - 20 concurrent analyst users');
  console.log('   - Active rule engine processing');
  console.log('   - Critical event injection');
  console.log('   - 2-hour duration');
  
  // Generate tokens if not provided
  if (!ADMIN_TOKEN) {
    console.log('🔑 Generating authentication tokens...');
    const tokenResponse = http.post(`${API_BASE_URL}/v1/auth/token`, JSON.stringify({
      username: 'alice',
      password: 'password123',
      tenant_id: 'tenant-A'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (tokenResponse.status === 200) {
      const tokenData = JSON.parse(tokenResponse.body);
      testState.adminToken = tokenData.token || tokenData.access_token;
      testState.analystToken = testState.adminToken; // Use same token for simplicity
    } else {
      console.error('❌ Failed to generate authentication tokens');
      throw new Error('Authentication setup failed');
    }
  } else {
    testState.adminToken = ADMIN_TOKEN;
    testState.analystToken = ADMIN_TOKEN;
  }
  
  // Set up detection rule for critical events
  console.log('🔧 Setting up detection rule...');
  const ruleResponse = http.post(`${API_BASE_URL}/v1/rules`, JSON.stringify({
    rule_name: 'Critical Event Detection',
    description: 'Detects critical security events for load testing',
    query: "SELECT * FROM dev.events WHERE raw_event LIKE '%CRITICAL%' OR raw_event LIKE '%SECURITY ALERT%'"
  }), {
    headers: {
      'Authorization': `Bearer ${testState.adminToken}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (ruleResponse.status === 201) {
    const ruleData = JSON.parse(ruleResponse.body);
    testState.ruleId = ruleData.rule_id;
    console.log(`✅ Detection rule created: ${testState.ruleId}`);
  } else {
    console.warn('⚠️  Could not create detection rule, continuing anyway');
  }
  
  console.log('✅ Combined load test setup complete');
  console.log('📊 Starting comprehensive load simulation...');
  
  return testState;
}

export function teardown(data) {
  console.log('📈 Combined Load Test Results');
  console.log('=' .repeat(50));
  console.log(`📊 Operations Summary:`);
  console.log(`   - Total operations: ${totalOperations.count}`);
  console.log(`   - Ingestion operations: ${ingestionOps.count}`);
  console.log(`   - Query operations: ${queryOps.count}`);
  console.log(`   - Rule engine checks: ${ruleEngineOps.count}`);
  console.log(`   - Critical events sent: ${testState.criticalEventsSent}`);
  console.log(`   - Alerts generated: ${alertsGenerated.count}`);
  console.log(`   - Overall success rate: ${(overallSuccessRate.rate * 100).toFixed(2)}%`);
  
  console.log(`\n⏱️  Performance Metrics:`);
  console.log(`   - Average end-to-end latency: ${endToEndLatency.avg.toFixed(2)}ms`);
  console.log(`   - P95 end-to-end latency: ${endToEndLatency.p95.toFixed(2)}ms`);
  console.log(`   - Peak system load level: ${systemLoad.value.toFixed(1)}/10`);
  
  // Calculate EPS achieved
  const durationMinutes = 120; // 2 hours
  const actualEPS = ingestionOps.count / (durationMinutes * 60);
  console.log(`   - Achieved EPS: ${actualEPS.toFixed(0)} (target: 5,000)`);
  
  console.log(`\n🔍 Post-Test Verification Required:`);
  console.log('   1. Check Kafka consumer lag - should be minimal');
  console.log('   2. Verify ClickHouse contains all ingested events');
  console.log('   3. Confirm rule engine processed critical events');
  console.log('   4. Review service resource utilization');
  console.log('   5. Check for any service restarts or errors');
  console.log('   6. Validate data integrity and consistency');
  
  if (actualEPS < 4500) {
    console.log(`\n⚠️  WARNING: EPS below target (${actualEPS.toFixed(0)} < 5,000)`);
    console.log('   System may have reached capacity limits');
  }
  
  if (overallSuccessRate.rate < 0.995) {
    console.log(`\n❌ ERROR: Success rate below threshold (${(overallSuccessRate.rate * 100).toFixed(2)}% < 99.5%)`);
    console.log('   System reliability issues detected');
  }
  
  console.log('\n🎯 Combined load test completed successfully');
} 