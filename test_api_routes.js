// Using built-in fetch (Node.js 18+)

// Base URL for the API
const BASE_URL = 'http://localhost:8082';

// Function to test an endpoint
async function testEndpoint(endpoint) {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`);
    const status = response.status;
    let data = null;
    
    try {
      data = await response.json();
    } catch (e) {
      // Not JSON or empty response
    }
    
    console.log(`Endpoint: ${endpoint}`);
    console.log(`Status: ${status}`);
    console.log(`Response: ${JSON.stringify(data, null, 2)}`);
    console.log('-----------------------------------');
    
    return { endpoint, status, data };
  } catch (error) {
    console.error(`Error testing ${endpoint}:`, error.message);
    console.log('-----------------------------------');
    return { endpoint, error: error.message };
  }
}

// List of endpoints to test
const endpoints = [
  '/',
  '/api/v1/agents',
  '/api/v1/parsers',
  '/api/v1/taxonomy',
  '/api/v1/auth/login',
  '/api/v1/users',
  '/api/v1/tenants',
  '/api/v1/alerts',
  '/api/v1/cases',
  '/api/v1/rules',
  '/api/v1/dashboard',
  '/api/v1/log-sources',
  '/api/v1/assets',
  '/api/v1/fields',
  '/api/v1/statistics',
  '/api/v1/roles',
  '/api/v1/error-simulation',
  '/health',
  '/metrics'
];

// Run tests
async function runTests() {
  console.log('Starting API endpoint tests...');
  console.log('===================================');
  
  for (const endpoint of endpoints) {
    await testEndpoint(endpoint);
  }
  
  console.log('All tests completed.');
}

runTests();