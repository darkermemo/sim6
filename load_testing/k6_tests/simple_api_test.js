import http from 'k6/http';
import { check, sleep } from 'k6';

// Simple API test for local development
export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    'http_req_duration': ['p(95)<1000'],
    'http_req_failed': ['rate<0.1'],
  },
};

const API_URL = __ENV.API_URL || 'http://localhost:8080';

export default function() {
  // Test health endpoint
  let healthResponse = http.get(`${API_URL}/v1/health`);
  check(healthResponse, {
    'health check is successful': (r) => r.status === 200,
  });

  sleep(1);

  // Test events listing endpoint (should work without auth for basic testing)
  let eventsResponse = http.get(`${API_URL}/v1/events?limit=10`);
  check(eventsResponse, {
    'events endpoint responds': (r) => r.status === 200 || r.status === 401,
  });

  sleep(1);

  // Test alerts endpoint
  let alertsResponse = http.get(`${API_URL}/v1/alerts?limit=10`);
  check(alertsResponse, {
    'alerts endpoint responds': (r) => r.status === 200 || r.status === 401,
  });

  sleep(2);
} 