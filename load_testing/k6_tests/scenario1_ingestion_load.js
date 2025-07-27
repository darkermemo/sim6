import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomString, randomItem } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics for detailed monitoring
export const syslogMessagesSent = new Counter('syslog_messages_sent');
export const httpMessagesSent = new Counter('http_messages_sent');
export const ingestionErrors = new Counter('ingestion_errors');
export const ingestionSuccessRate = new Rate('ingestion_success_rate');
export const ingestionDuration = new Trend('ingestion_duration');

// Test configuration
export const options = {
  scenarios: {
    // Scenario 1: UDP Syslog Load (simulated via HTTP due to k6 limitations)
    syslog_load: {
      executor: 'ramping-vus',
      exec: 'syslogLoad',
      startVUs: 10,
      stages: [
        { duration: '5m', target: 50 },   // Ramp to 1,000 EPS (50 VUs * 20 req/sec)
        { duration: '5m', target: 125 },  // Ramp to 2,500 EPS  
        { duration: '5m', target: 250 },  // Ramp to 5,000 EPS
        { duration: '10m', target: 500 }, // Ramp to 10,000 EPS
        { duration: '10m', target: 750 }, // Ramp to 15,000 EPS
        { duration: '10m', target: 1000 }, // Ramp to 20,000 EPS (stress test)
        { duration: '5m', target: 500 },  // Scale down to sustainable load
        { duration: '5m', target: 0 },    // Graceful shutdown
      ],
    },

    // Scenario 2: HTTP Raw Ingestion Load
    http_ingestion_load: {
      executor: 'ramping-vus', 
      exec: 'httpIngestionLoad',
      startVUs: 5,
      stages: [
        { duration: '5m', target: 25 },   // Ramp to 500 EPS
        { duration: '5m', target: 62 },   // Ramp to 1,250 EPS
        { duration: '5m', target: 125 },  // Ramp to 2,500 EPS
        { duration: '10m', target: 250 }, // Ramp to 5,000 EPS
        { duration: '10m', target: 375 }, // Ramp to 7,500 EPS
        { duration: '10m', target: 500 }, // Ramp to 10,000 EPS
        { duration: '5m', target: 250 },  // Scale down
        { duration: '5m', target: 0 },    // Graceful shutdown
      ],
    }
  },
  thresholds: {
    // Performance thresholds that must be met
    'http_req_duration': ['p(95)<500'], // 95% of requests under 500ms
    'http_req_failed': ['rate<0.001'],  // Less than 0.1% failure rate
    'ingestion_success_rate': ['rate>0.999'], // 99.9% success rate
    'http_req_duration{scenario:syslog_load}': ['p(95)<200'], // Syslog ingestion fast
    'http_req_duration{scenario:http_ingestion_load}': ['p(95)<300'], // HTTP ingestion reasonable
  },
};

// Environment configuration
const INGESTOR_BASE_URL = __ENV.INGESTOR_URL || 'http://localhost:8081';
const API_BASE_URL = __ENV.API_URL || 'http://localhost:8080';
const TARGET_EPS = parseInt(__ENV.TARGET_EPS) || 10000;

// Realistic log message templates
const syslogTemplates = [
  '<134>Jul 21 ${timestamp} web-server-${serverNum} nginx: ${remoteIp} - - [${logTime}] "GET /api/v1/users HTTP/1.1" 200 1234 "-" "Mozilla/5.0"',
  '<165>Jul 21 ${timestamp} db-server-${serverNum} mysql: [Warning] Connection from ${remoteIp} using password: YES',
  '<131>Jul 21 ${timestamp} app-server-${serverNum} application: INFO User ${userId} logged in successfully from ${remoteIp}',
  '<163>Jul 21 ${timestamp} fw-${serverNum} iptables: DROP IN=eth0 OUT= SRC=${remoteIp} DST=10.0.1.100 PROTO=TCP SPT=${srcPort} DPT=22',
  '<134>Jul 21 ${timestamp} mail-server-${serverNum} postfix: SMTP connection from ${remoteIp}',
];

const jsonLogTemplates = [
  {
    "timestamp": "${timestamp}",
    "level": "INFO", 
    "service": "authentication",
    "user_id": "${userId}",
    "source_ip": "${remoteIp}",
    "action": "login_success",
    "message": "User authentication successful"
  },
  {
    "timestamp": "${timestamp}",
    "level": "WARNING",
    "service": "database", 
    "source_ip": "${remoteIp}",
    "action": "connection_failed",
    "error": "Connection timeout after 30 seconds"
  },
  {
    "timestamp": "${timestamp}",
    "level": "ERROR",
    "service": "api_gateway",
    "source_ip": "${remoteIp}", 
    "action": "rate_limit_exceeded",
    "message": "Request rate limit exceeded: ${requestCount} requests in 1 minute"
  }
];

// Generate realistic test data
function generateSyslogMessage() {
  const template = randomItem(syslogTemplates);
  const now = new Date();
  
  return template
    .replace('${timestamp}', now.toTimeString().slice(0, 8))
    .replace('${serverNum}', Math.floor(Math.random() * 10) + 1)
    .replace('${remoteIp}', generateRandomIP())
    .replace('${logTime}', now.toISOString().slice(0, 19).replace('T', ' '))
    .replace('${userId}', `user_${Math.floor(Math.random() * 1000)}`)
    .replace('${srcPort}', Math.floor(Math.random() * 60000) + 1024)
    .replace('${requestCount}', Math.floor(Math.random() * 200) + 50);
}

function generateJSONMessage() {
  const template = randomItem(jsonLogTemplates);
  const now = new Date();
  
  let message = JSON.stringify(template)
    .replace(/"\${timestamp}"/g, `"${now.toISOString()}"`)
    .replace(/"\${userId}"/g, `"user_${Math.floor(Math.random() * 1000)}"`)
    .replace(/"\${remoteIp}"/g, `"${generateRandomIP()}"`)
    .replace(/"\${requestCount}"/g, Math.floor(Math.random() * 200) + 50);
    
  return JSON.parse(message);
}

function generateRandomIP() {
  return `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

// Load test execution functions
export function syslogLoad() {
  const message = generateSyslogMessage();
  const url = `${INGESTOR_BASE_URL}/ingest/raw`;
  
  const params = {
    headers: {
      'Content-Type': 'text/plain',
      'X-Source-Type': 'syslog',
    },
    timeout: '10s',
  };

  const startTime = Date.now();
  const response = http.post(url, message, params);
  const duration = Date.now() - startTime;

  // Record metrics
  syslogMessagesSent.add(1);
  ingestionDuration.add(duration);

  const success = check(response, {
    'syslog ingestion status is 200': (r) => r.status === 200,
    'syslog response time < 500ms': (r) => r.timings.duration < 500,
    'syslog response contains event_id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.event_id && body.event_id.length > 0;
      } catch (e) {
        return false;
      }
    },
  });

  ingestionSuccessRate.add(success);
  if (!success) {
    ingestionErrors.add(1);
    console.error(`Syslog ingestion failed: ${response.status} - ${response.body}`);
  }

  // Rate limiting to achieve target EPS
  // Each VU should send ~20 requests per second at peak
  const sleepTime = Math.max(0, 50 - (Date.now() - startTime)); // Target 20 RPS per VU
  if (sleepTime > 0) {
    sleep(sleepTime / 1000);
  }
}

export function httpIngestionLoad() {
  const message = generateJSONMessage();
  const url = `${INGESTOR_BASE_URL}/ingest/raw`;
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-Source-Type': 'json',
    },
    timeout: '10s',
  };

  const startTime = Date.now();
  const response = http.post(url, JSON.stringify(message), params);
  const duration = Date.now() - startTime;

  // Record metrics
  httpMessagesSent.add(1);
  ingestionDuration.add(duration);

  const success = check(response, {
    'http ingestion status is 200': (r) => r.status === 200,
    'http response time < 500ms': (r) => r.timings.duration < 500,
    'http response contains event_id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.event_id && body.event_id.length > 0;
      } catch (e) {
        return false;
      }
    },
  });

  ingestionSuccessRate.add(success);
  if (!success) {
    ingestionErrors.add(1);
    console.error(`HTTP ingestion failed: ${response.status} - ${response.body}`);
  }

  // Rate limiting to achieve target EPS
  const sleepTime = Math.max(0, 50 - (Date.now() - startTime)); // Target 20 RPS per VU
  if (sleepTime > 0) {
    sleep(sleepTime / 1000);
  }
}

// Test lifecycle hooks
export function setup() {
  console.log('🚀 Starting SIEM Ingestion Load Test');
  console.log(`📊 Target configuration:`);
  console.log(`   - Ingestor URL: ${INGESTOR_BASE_URL}`);
  console.log(`   - API URL: ${API_BASE_URL}`);
  console.log(`   - Target EPS: ${TARGET_EPS}`);
  
  // Verify services are running
  console.log('🔍 Verifying service availability...');
  
  // Check ingestor health
  const ingestorHealth = http.get(`${INGESTOR_BASE_URL}/health`);
  if (ingestorHealth.status !== 200) {
    console.error(`❌ Ingestor service not available: ${ingestorHealth.status}`);
    throw new Error('Ingestor service not available');
  }
  
  console.log('✅ All services are available');
  console.log('🎯 Load test starting...');
}

export function teardown(data) {
  console.log('📈 Load test completed!');
  console.log(`📊 Final metrics summary:`);
  console.log(`   - Total Syslog messages sent: ${syslogMessagesSent.count}`);
  console.log(`   - Total HTTP messages sent: ${httpMessagesSent.count}`);
  console.log(`   - Total errors: ${ingestionErrors.count}`);
  console.log(`   - Success rate: ${(ingestionSuccessRate.rate * 100).toFixed(2)}%`);
  console.log(`   - Average ingestion time: ${ingestionDuration.avg.toFixed(2)}ms`);
  
  // Verification recommendations
  console.log('🔍 Post-test verification steps:');
  console.log('   1. Check Kafka consumer lag in monitoring');
  console.log('   2. Verify all messages stored in ClickHouse');
  console.log('   3. Review service resource utilization');
  console.log('   4. Check for any service errors or restarts');
}

// Helper function for sleep
function sleep(seconds) {
  // k6 sleep function simulation for IDE compatibility
  if (typeof __ENV !== 'undefined') {
    // Running in k6
    require('k6').sleep(seconds);
  }
} 