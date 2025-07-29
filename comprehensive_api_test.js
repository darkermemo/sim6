/**
 * Comprehensive API Endpoint Testing Script
 * Tests all /api/v1/* endpoints with authentication, validation, and error handling
 */

const BASE_URL = 'http://localhost:8082';

// Test results storage
const testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  details: []
};

/**
 * Test an endpoint with comprehensive validation
 */
async function testEndpoint({
  name,
  endpoint,
  method = 'GET',
  body = null,
  headers = {},
  expectedStatus = 200,
  validateResponse = null,
  requiresAuth = false
}) {
  testResults.total++;
  
  try {
    const requestOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (body) {
      requestOptions.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${BASE_URL}${endpoint}`, requestOptions);
    const status = response.status;
    
    let data = null;
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (e) {
        console.warn(`Failed to parse JSON for ${endpoint}:`, e.message);
      }
    }
    
    // Validate status code
    const statusValid = status === expectedStatus;
    
    // Validate response structure if validator provided
    let responseValid = true;
    let validationError = null;
    
    if (validateResponse && data) {
      try {
        responseValid = validateResponse(data);
      } catch (e) {
        responseValid = false;
        validationError = e.message;
      }
    }
    
    const success = statusValid && responseValid;
    
    if (success) {
      testResults.passed++;
      console.log(`✅ ${name}: PASSED`);
    } else {
      testResults.failed++;
      console.log(`❌ ${name}: FAILED`);
      if (!statusValid) {
        console.log(`   Expected status ${expectedStatus}, got ${status}`);
      }
      if (!responseValid) {
        console.log(`   Response validation failed: ${validationError || 'Invalid structure'}`);
      }
    }
    
    testResults.details.push({
      name,
      endpoint,
      method,
      status,
      expectedStatus,
      success,
      data: data ? JSON.stringify(data, null, 2) : null,
      error: success ? null : (validationError || `Status ${status} != ${expectedStatus}`)
    });
    
    // Log response for debugging
    if (data) {
      console.log(`   Response: ${JSON.stringify(data, null, 2).substring(0, 200)}${JSON.stringify(data, null, 2).length > 200 ? '...' : ''}`);
    }
    
  } catch (error) {
    testResults.failed++;
    console.log(`❌ ${name}: ERROR - ${error.message}`);
    
    testResults.details.push({
      name,
      endpoint,
      method,
      status: null,
      expectedStatus,
      success: false,
      data: null,
      error: error.message
    });
  }
  
  console.log('-----------------------------------');
}

/**
 * Response validators for different endpoint types
 */
const validators = {
  healthCheck: (data) => {
    return data.status === 'healthy' && 
           typeof data.timestamp === 'string' &&
           typeof data.uptime_seconds === 'number';
  },
  
  listResponse: (data) => {
    return Array.isArray(data) || 
           (typeof data === 'object' && 
            (Array.isArray(data.items) || 
             Array.isArray(data.alerts) ||
             Array.isArray(data.users) ||
             Array.isArray(data.rules) ||
             Array.isArray(data.cases) ||
             Array.isArray(data.agents) ||
             Array.isArray(data.parsers) ||
             Array.isArray(data.tenants) ||
             Array.isArray(data.roles)));
  },
  
  dashboard: (data) => {
    return typeof data === 'object' &&
           (data.layout !== undefined || data.widgets !== undefined);
  },
  
  metrics: (data) => {
    return typeof data === 'object' &&
           data.status !== undefined &&
           data.timestamp !== undefined;
  },
  
  authLogin: (data) => {
    return typeof data === 'object' &&
           (data.access_token !== undefined || data.token !== undefined);
  }
};

/**
 * Main test suite
 */
async function runComprehensiveTests() {
  console.log('🚀 Starting Comprehensive API Endpoint Tests');
  console.log('==============================================');
  
  // Health and system endpoints
  await testEndpoint({
    name: 'Health Check',
    endpoint: '/health',
    validateResponse: validators.healthCheck
  });
  
  await testEndpoint({
    name: 'Metrics',
    endpoint: '/metrics',
    validateResponse: validators.metrics
  });
  
  // API v1 endpoints - Core functionality
  await testEndpoint({
    name: 'Dashboard',
    endpoint: '/api/v1/dashboard',
    validateResponse: validators.dashboard
  });
  
  await testEndpoint({
    name: 'Alerts List',
    endpoint: '/api/v1/alerts',
    validateResponse: validators.listResponse
  });
  
  await testEndpoint({
    name: 'Rules List',
    endpoint: '/api/v1/rules',
    validateResponse: validators.listResponse
  });
  
  await testEndpoint({
    name: 'Cases List',
    endpoint: '/api/v1/cases',
    validateResponse: validators.listResponse
  });
  
  await testEndpoint({
    name: 'Users List',
    endpoint: '/api/v1/users',
    validateResponse: validators.listResponse
  });
  
  await testEndpoint({
    name: 'Tenants List',
    endpoint: '/api/v1/tenants',
    validateResponse: validators.listResponse
  });
  
  await testEndpoint({
    name: 'Agents List',
    endpoint: '/api/v1/agents',
    validateResponse: validators.listResponse
  });
  
  await testEndpoint({
    name: 'Parsers List',
    endpoint: '/api/v1/parsers',
    validateResponse: validators.listResponse
  });
  
  await testEndpoint({
    name: 'Taxonomy',
    endpoint: '/api/v1/taxonomy',
    expectedStatus: 404
  });
  
  await testEndpoint({
    name: 'Roles List',
    endpoint: '/api/v1/roles',
    validateResponse: validators.listResponse
  });
  
  // Authentication endpoints
  await testEndpoint({
    name: 'Auth Login (POST)',
    endpoint: '/api/v1/auth/login',
    method: 'POST',
    body: { username: 'testuser', password: 'wrongpassword' },
    expectedStatus: 401, // Expected to fail without valid credentials
  });
  
  // Endpoints that should return 404 (not implemented yet)
  await testEndpoint({
    name: 'Log Sources',
    endpoint: '/api/v1/log-sources',
    expectedStatus: 404
  });
  
  await testEndpoint({
    name: 'Assets',
    endpoint: '/api/v1/assets',
    expectedStatus: 404
  });
  
  await testEndpoint({
    name: 'Fields',
    endpoint: '/api/v1/fields',
    expectedStatus: 404
  });
  
  await testEndpoint({
    name: 'Statistics',
    endpoint: '/api/v1/statistics',
    expectedStatus: 404
  });
  
  await testEndpoint({
    name: 'Error Simulation',
    endpoint: '/api/v1/error-simulation',
    expectedStatus: 404
  });
  
  // Legacy endpoints (should still work)
  await testEndpoint({
    name: 'Legacy Health',
    endpoint: '/health',
    validateResponse: validators.healthCheck
  });
  
  // Test POST endpoints with invalid data
  await testEndpoint({
    name: 'Create Alert (Invalid Data)',
    endpoint: '/api/v1/alerts',
    method: 'POST',
    body: { invalid: 'data' },
    expectedStatus: 400 // Should return bad request
  });
  
  await testEndpoint({
    name: 'Create Rule (Invalid Data)',
    endpoint: '/api/v1/rules',
    method: 'POST',
    body: { invalid: 'data' },
    expectedStatus: 400 // Should return bad request
  });
  
  // Test pagination parameters
  await testEndpoint({
    name: 'Alerts with Pagination',
    endpoint: '/api/v1/alerts?page=1&limit=10',
    validateResponse: validators.listResponse
  });
  
  await testEndpoint({
    name: 'Rules with Search',
    endpoint: '/api/v1/rules?search=test&is_active=true',
    validateResponse: validators.listResponse
  });
  
  // Print final results
  console.log('\n📊 Test Results Summary');
  console.log('========================');
  console.log(`Total Tests: ${testResults.total}`);
  console.log(`Passed: ${testResults.passed} ✅`);
  console.log(`Failed: ${testResults.failed} ❌`);
  console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
  
  // Generate detailed report
  const reportPath = './api_test_report.json';
  const fs = require('fs');
  
  try {
    fs.writeFileSync(reportPath, JSON.stringify({
      summary: {
        total: testResults.total,
        passed: testResults.passed,
        failed: testResults.failed,
        successRate: ((testResults.passed / testResults.total) * 100).toFixed(1) + '%',
        timestamp: new Date().toISOString()
      },
      details: testResults.details
    }, null, 2));
    
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  } catch (e) {
    console.log('\n⚠️  Could not save detailed report:', e.message);
  }
  
  if (testResults.failed > 0) {
    console.log('\n❌ Some tests failed. Check the details above.');
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed!');
  }
}

// Run the tests
runComprehensiveTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});