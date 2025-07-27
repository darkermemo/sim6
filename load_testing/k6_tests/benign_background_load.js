import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics for benign load monitoring
export const benignMessagesSent = new Counter('benign_messages_sent');
export const benignSuccessRate = new Rate('benign_success_rate');

// Test configuration for background benign load
export const options = {
  scenarios: {
    benign_load: {
      executor: 'constant-vus',
      exec: 'generateBenignLoad',
      vus: 50,  // 50 VUs * 20 req/sec = 1,000 EPS
      duration: __ENV.DURATION || '6m',
      gracefulStop: '10s',
    }
  },
  thresholds: {
    'http_req_duration': ['p(95)<500'],
    'http_req_failed': ['rate<0.01'],
    'benign_success_rate': ['rate>0.99'],
  },
};

// Environment configuration
const INGESTOR_URL = __ENV.INGESTOR_URL || 'http://localhost:8081';
const TARGET_EPS = parseInt(__ENV.TARGET_EPS) || 1000;

// Benign log message templates (normal business operations)
const benignLogTemplates = [
  '<134>Jul 21 ${timestamp} web-server-${serverNum} nginx: ${sourceIp} - - [${logTime}] "GET /api/v1/users HTTP/1.1" 200 1234 "-" "Mozilla/5.0"',
  '<134>Jul 21 ${timestamp} web-server-${serverNum} nginx: ${sourceIp} - - [${logTime}] "POST /api/v1/login HTTP/1.1" 200 567 "-" "Mozilla/5.0"',
  '<134>Jul 21 ${timestamp} app-server-${serverNum} application: INFO User ${userId} logged in successfully from ${sourceIp}',
  '<134>Jul 21 ${timestamp} app-server-${serverNum} application: INFO User ${userId} accessed dashboard from ${sourceIp}',
  '<134>Jul 21 ${timestamp} app-server-${serverNum} application: INFO User ${userId} performed search query',
  '<134>Jul 21 ${timestamp} db-server-${serverNum} mysql: Query executed successfully in ${queryTime}ms',
  '<134>Jul 21 ${timestamp} db-server-${serverNum} mysql: Connection established from ${sourceIp}',
  '<134>Jul 21 ${timestamp} mail-server-${serverNum} postfix: Message sent to ${recipient}',
  '<134>Jul 21 ${timestamp} mail-server-${serverNum} postfix: SMTP connection from ${sourceIp}',
  '<134>Jul 21 ${timestamp} dns-server-${serverNum} bind: Query for ${domain} from ${sourceIp}',
  '<134>Jul 21 ${timestamp} dns-server-${serverNum} bind: Response sent to ${sourceIp} for ${domain}',
  '<134>Jul 21 ${timestamp} proxy-server-${serverNum} squid: TCP_HIT/200 1234 GET http://${domain}/ - DIRECT/${sourceIp}',
  '<134>Jul 21 ${timestamp} file-server-${serverNum} samba: User ${userId} accessed file share from ${sourceIp}',
  '<134>Jul 21 ${timestamp} backup-server-${serverNum} backup: Backup job completed successfully',
  '<134>Jul 21 ${timestamp} monitoring-server-${serverNum} nagios: Service check OK - ${serviceName}',
];

// Utility functions
function generateRandomIP() {
  // Generate realistic internal IP addresses
  const subnets = ['192.168.1', '192.168.10', '10.0.1', '10.0.10', '172.16.1'];
  const subnet = randomItem(subnets);
  return `${subnet}.${Math.floor(Math.random() * 254) + 1}`;
}

function generateTimestamp() {
  return new Date().toTimeString().slice(0, 8);
}

function expandBenignTemplate(template) {
  const variables = {
    timestamp: generateTimestamp(),
    sourceIp: generateRandomIP(),
    serverNum: Math.floor(Math.random() * 20) + 1,
    userId: `user_${Math.floor(Math.random() * 500) + 1}`,
    queryTime: Math.floor(Math.random() * 100) + 5,
    recipient: `user${Math.floor(Math.random() * 100)}@company.com`,
    domain: randomItem([
      'company.com', 'internal.company.com', 'api.company.com', 
      'cdn.company.com', 'mail.company.com', 'backup.company.com'
    ]),
    serviceName: randomItem([
      'Web Server', 'Database', 'Mail Server', 'DNS Server', 
      'File Server', 'Backup Service', 'Application Server'
    ]),
    logTime: new Date().toISOString().slice(0, 19).replace('T', ' ')
  };
  
  let result = template;
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
    result = result.replace(regex, variables[key]);
  });
  
  return result;
}

// Main test function (default export for CLI usage)
export default function() {
  generateBenignLoad();
}

export function generateBenignLoad() {
  // Select a random benign log template
  const template = randomItem(benignLogTemplates);
  const message = expandBenignTemplate(template);
  
  // Send to ingestor via HTTP
  const response = http.post(`${INGESTOR_URL}/ingest/raw`, message, {
    headers: {
      'Content-Type': 'text/plain',
      'X-Source-Type': 'syslog-benign',
    },
    timeout: '5s',
  });
  
  // Check response
  const success = check(response, {
    'benign message accepted': (r) => r.status === 200,
    'benign response time OK': (r) => r.timings.duration < 500,
    'benign response has event_id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.event_id && body.event_id.length > 0;
      } catch (e) {
        return false;
      }
    },
  });
  
  // Record metrics
  benignMessagesSent.add(1);
  benignSuccessRate.add(success);
  
  if (!success) {
    console.error(`Benign load failed: ${response.status} - ${response.body}`);
  }
  
  // Rate limiting to achieve target EPS
  // 50 VUs targeting 1,000 EPS = 20 requests per second per VU
  sleep(0.05); // 50ms = 20 RPS per VU
}

// Test lifecycle hooks
export function setup() {
  console.log('🔄 Starting benign background load generation');
  console.log(`📊 Configuration:`);
  console.log(`   - Target EPS: ${TARGET_EPS}`);
  console.log(`   - Ingestor URL: ${INGESTOR_URL}`);
  console.log(`   - Duration: ${__ENV.DURATION || '6m'}`);
  
  // Verify ingestor is available
  const healthCheck = http.get(`${INGESTOR_URL}/health`, { timeout: '5s' });
  if (healthCheck.status !== 200) {
    console.error(`❌ Ingestor not available: ${healthCheck.status}`);
    throw new Error('Ingestor service not available');
  }
  
  console.log('✅ Ingestor service is available');
  console.log('🎯 Benign load generation starting...');
}

export function teardown(data) {
  console.log('📈 Benign background load completed');
  console.log(`📊 Summary:`);
  console.log(`   - Total benign messages sent: ${benignMessagesSent.count}`);
  console.log(`   - Success rate: ${(benignSuccessRate.rate * 100).toFixed(2)}%`);
  
  // Calculate achieved EPS
  const durationMinutes = parseFloat(__ENV.DURATION?.replace('m', '') || '6');
  const actualEPS = benignMessagesSent.count / (durationMinutes * 60);
  console.log(`   - Achieved EPS: ${actualEPS.toFixed(0)} (target: ${TARGET_EPS})`);
  
  if (actualEPS < TARGET_EPS * 0.9) {
    console.log(`⚠️  WARNING: EPS below 90% of target`);
  } else {
    console.log(`✅ EPS target achieved successfully`);
  }
} 