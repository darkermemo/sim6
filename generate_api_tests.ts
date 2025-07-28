import fs from 'fs';
import path from 'path';

/**
 * Auto-generates Playwright tests for each mapped endpoint from api_route_map.json
 * This script creates E2E tests that validate /api/v1/* endpoints
 */

// Read the route mapping data
const routeData = JSON.parse(fs.readFileSync('api_route_map.json', 'utf-8'));

console.log('Route data keys:', Object.keys(routeData));
console.log('Has route_details:', !!routeData.route_details);
console.log('Has coverage_analysis:', !!routeData.coverage_analysis);
console.log('Has frontend_only:', !!routeData.coverage_analysis?.frontend_only);
if (routeData.coverage_analysis?.frontend_only) {
  console.log('Frontend only count:', routeData.coverage_analysis.frontend_only.length);
}

// Extract routes from different sources
let routes: any[] = [];

// Check if we have route_details (from Rust backend)
if (routeData.route_details && routeData.route_details.length > 0) {
  routes = routeData.route_details;
  console.log('Using route_details');
} else if (routeData.coverage_analysis?.frontend_only) {
  // Use frontend endpoints and assume GET method for most
  routes = routeData.coverage_analysis.frontend_only.map((path: string) => ({
    path: path.split('?')[0].replace(/\$:[^/]+/g, '1'), // Clean up dynamic params
    method: 'GET' // Default to GET, could be enhanced with method detection
  }));
  console.log('Using frontend_only routes');
} else {
  console.log('No routes found in expected locations');
}

const output: string[] = [
  `import { test, expect, request } from '@playwright/test';\n`
];

console.log(`Found ${routes.length} routes to process`);

// Generate test cases for each API endpoint
routes.forEach((route: any) => {
  console.log(`Processing route: ${route.path}`);
  // Only generate tests for API v1 endpoints
  if (!route.path.startsWith('/api/v1')) {
    console.log(`Skipping non-API route: ${route.path}`);
    return;
  }

  const testName = route.path.replace(/[^a-zA-Z0-9]/g, '_');
  const method = (route.method || 'GET').toLowerCase();
  // Replace path parameters with sample values for testing
  const fullPath = route.path.replace(/{[^}]+}/g, '1').replace(/\$:[^/]+/g, '1');

  console.log(`Generating test for: ${method.toUpperCase()} ${route.path}`);
  output.push(`
test('${method.toUpperCase()} ${route.path} responds successfully', async ({ request }) => {
  const response = await request.${method}('${fullPath}');
  expect(response.ok()).toBeTruthy();
});
`);
});

console.log(`Generated ${output.length - 1} tests`);

// Ensure tests directory exists
if (!fs.existsSync('tests')) {
  fs.mkdirSync('tests');
}

// Write the generated tests to file
fs.writeFileSync(path.join('tests', 'generated_api_tests.spec.ts'), output.join('\n'));
console.log('✅ Playwright tests generated at tests/generated_api_tests.spec.ts');