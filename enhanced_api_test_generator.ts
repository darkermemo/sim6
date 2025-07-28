import fs from 'fs';
import path from 'path';

/**
 * Enhanced Playwright test generator with better method detection and auth support
 * This script creates comprehensive E2E tests for API endpoints with authentication
 */

interface RouteInfo {
  path: string;
  method: string;
  requiresAuth?: boolean;
  expectedStatus?: number;
}

/**
 * Detect HTTP method from endpoint path patterns
 * @param path - The API endpoint path
 * @returns Likely HTTP method
 */
function detectHttpMethod(path: string): string {
  // Common patterns for different HTTP methods
  if (path.includes('/login') || path.includes('/auth')) return 'POST';
  if (path.includes('/logout')) return 'POST';
  if (path.includes('/refresh')) return 'POST';
  if (path.includes('/download')) return 'GET';
  if (path.includes('/decommission')) return 'POST';
  if (path.includes('/assignee')) return 'PUT';
  if (path.includes('/status')) return 'PUT';
  if (path.includes('/test')) return 'POST';
  
  // Default to GET for most endpoints
  return 'GET';
}

/**
 * Determine if endpoint requires authentication
 * @param path - The API endpoint path
 * @returns Whether auth is required
 */
function requiresAuth(path: string): boolean {
  // Public endpoints that don't require auth
  const publicEndpoints = ['/login', '/health', '/simulate-error'];
  return !publicEndpoints.some(endpoint => path.includes(endpoint));
}

/**
 * Generate test case for a single route
 * @param route - Route information
 * @returns Generated test code
 */
function generateTestCase(route: RouteInfo): string {
  const method = route.method.toLowerCase();
  const authSetup = route.requiresAuth ? `
  // Set up authentication headers
  const authHeaders = {
    'Authorization': 'Bearer test-token',
    'Content-Type': 'application/json'
  };` : '';
  
  const requestOptions = route.requiresAuth ? `, { headers: authHeaders }` : '';
  
  return `
test('${route.method} ${route.path} responds successfully', async ({ request }) => {${authSetup}
  const response = await request.${method}('${route.path}'${requestOptions});
  expect(response.status()).toBe(${route.expectedStatus || 200});
  
  // Verify response has expected structure
  if (response.ok()) {
    const data = await response.json();
    expect(data).toBeDefined();
  }
});
`;
}

/**
 * Main execution function
 */
function main() {
  // Read the route mapping data
  const routeData = JSON.parse(fs.readFileSync('api_route_map.json', 'utf-8'));
  
  // Extract routes from different sources
  let rawRoutes: string[] = [];
  
  if (routeData.route_details && routeData.route_details.length > 0) {
    rawRoutes = routeData.route_details.map((r: any) => r.path);
  } else if (routeData.coverage_analysis?.frontend_only) {
    rawRoutes = routeData.coverage_analysis.frontend_only;
  }
  
  // Process routes and enhance with method detection
  const routes: RouteInfo[] = rawRoutes
    .filter(path => path.startsWith('/api/v1'))
    .map(path => {
      // Clean up dynamic parameters
      const cleanPath = path.split('?')[0].replace(/\$:[^/]+/g, '1');
      
      return {
        path: cleanPath,
        method: detectHttpMethod(cleanPath),
        requiresAuth: requiresAuth(cleanPath),
        expectedStatus: cleanPath.includes('/simulate-error') ? 500 : 200
      };
    })
    // Remove duplicates
    .filter((route, index, self) => 
      index === self.findIndex(r => r.path === route.path && r.method === route.method)
    );
  
  console.log(`Processing ${routes.length} unique API endpoints`);
  
  // Generate test file content
  const output: string[] = [
    `import { test, expect, request } from '@playwright/test';`,
    ``,
    `// Auto-generated API tests for SIEM endpoints`,
    `// Generated at: ${new Date().toISOString()}`,
    ``,
    `test.describe('SIEM API Endpoints', () => {`,
    `  test.beforeEach(async ({ request }) => {`,
    `    // Set base URL for all requests`,
    `    // Note: Update this to match your actual API base URL`,
    `  });`,
    ``
  ];
  
  // Generate test cases
  routes.forEach(route => {
    output.push(generateTestCase(route));
  });
  
  output.push(`});`);
  
  // Ensure tests directory exists
  if (!fs.existsSync('tests')) {
    fs.mkdirSync('tests');
  }
  
  // Write enhanced tests
  fs.writeFileSync(
    path.join('tests', 'enhanced_api_tests.spec.ts'), 
    output.join('\n')
  );
  
  // Generate summary
  const methodCounts = routes.reduce((acc, route) => {
    acc[route.method] = (acc[route.method] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const authRequiredCount = routes.filter(r => r.requiresAuth).length;
  
  console.log('✅ Enhanced Playwright tests generated at tests/enhanced_api_tests.spec.ts');
  console.log('📊 Test Summary:');
  console.log(`   Total endpoints: ${routes.length}`);
  console.log(`   Require authentication: ${authRequiredCount}`);
  Object.entries(methodCounts).forEach(([method, count]) => {
    console.log(`   ${method}: ${count} endpoints`);
  });
}

if (require.main === module) {
  main();
}

export { generateTestCase, detectHttpMethod, requiresAuth };