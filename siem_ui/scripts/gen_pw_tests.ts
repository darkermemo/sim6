#!/usr/bin/env ts-node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

// Types for the API route map
interface RouteDetail {
  path: string;
  method: string;
  handler: string;
  is_used_in_frontend: boolean;
  frontend_usage?: Array<{
    sample_payload?: any;
    [key: string]: any;
  }>;
  backend_file: string;
  backend_only?: boolean;
  expected_status?: number;
}

interface ApiRouteMap {
  route_details: RouteDetail[];
  [key: string]: any;
}

// Environment validation
function validateEnvironment(): void {
  const requiredVars = ['API_BASE', 'QA_TOKEN'];
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Convert path to filename
function pathToFilename(routePath: string, method: string, allRoutes: RouteDetail[]): string {
  // Remove leading slash and replace remaining slashes with underscores
  let filename = routePath.replace(/^\//, '').replace(/\//g, '_');
  
  // Check if multiple methods exist for this path
  const methodsForPath = allRoutes.filter(r => r.path === routePath).map(r => r.method);
  if (methodsForPath.length > 1) {
    filename += `_${method.toLowerCase()}`;
  }
  
  return `${filename}.spec.ts`;
}

// Convert path to kebab-case for schema filename
function pathToSchemaFilename(routePath: string, method: string): string {
  const kebabPath = routePath
    .replace(/^\//, '')
    .replace(/\//g, '-')
    .replace(/_/g, '-')
    .toLowerCase();
  
  return `${kebabPath}-${method.toLowerCase()}.json`;
}

// Generate test template for GET requests
function generateGetTest(route: RouteDetail): string {
  const schemaFilename = pathToSchemaFilename(route.path, route.method);
  
  return `import { test, expect } from '@playwright/test';
import Ajv from 'ajv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../schemas/${schemaFilename}'), 'utf-8'));

test.use({ 
  baseURL: process.env.API_BASE,
  trace: 'retain-on-failure'
});

test('GET ${route.path} returns 200', async ({ request }) => {
  const res = await request.get('${route.path}', {
    headers: { Authorization: \`Bearer \${process.env.QA_TOKEN}\` }
  });
  expect(res.ok()).toBeTruthy();
  expect(res.status()).toBe(200);

  const body = await res.json();
  const ajv = new Ajv();
  expect(ajv.validate(schema, body)).toBe(true);

  test.info().annotations.push({ type: 'rt', description: \`\${res.headers()['x-response-time'] || 'N/A'}ms\` });
});
`;
}

// Generate test template for POST requests
function generatePostTest(route: RouteDetail): string {
  const schemaFilename = pathToSchemaFilename(route.path, route.method);
  const expectedStatus = route.expected_status || 201;
  
  // Try to get sample payload from frontend usage
  let payload = '{}';
  if (route.frontend_usage && route.frontend_usage[0]?.sample_payload) {
    payload = JSON.stringify(route.frontend_usage[0].sample_payload, null, 2);
  }
  
  return `import { test, expect } from '@playwright/test';
import Ajv from 'ajv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../schemas/${schemaFilename}'), 'utf-8'));

test.use({ 
  baseURL: process.env.API_BASE,
  trace: 'retain-on-failure'
});

test('POST ${route.path} returns ${expectedStatus}', async ({ request }) => {
  const payload = ${payload};
  
  const res = await request.post('${route.path}', {
    headers: { Authorization: \`Bearer \${process.env.QA_TOKEN}\` },
    data: payload
  });
  expect(res.ok()).toBeTruthy();
  expect(res.status()).toBe(${expectedStatus});

  const body = await res.json();
  const ajv = new Ajv();
  expect(ajv.validate(schema, body)).toBe(true);

  test.info().annotations.push({ type: 'rt', description: \`\${res.headers()['x-response-time'] || 'N/A'}ms\` });
});
`;
}

// Generate test template for PUT requests
function generatePutTest(route: RouteDetail): string {
  const schemaFilename = pathToSchemaFilename(route.path, route.method);
  const expectedStatus = route.expected_status || 200;
  
  // Try to get sample payload from frontend usage
  let payload = '{}';
  if (route.frontend_usage && route.frontend_usage[0]?.sample_payload) {
    payload = JSON.stringify(route.frontend_usage[0].sample_payload, null, 2);
  }
  
  return `import { test, expect } from '@playwright/test';
import Ajv from 'ajv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../schemas/${schemaFilename}'), 'utf-8'));

test.use({ 
  baseURL: process.env.API_BASE,
  trace: 'retain-on-failure'
});

test('PUT ${route.path} returns ${expectedStatus}', async ({ request }) => {
  const payload = ${payload};
  
  const res = await request.put('${route.path}', {
    headers: { Authorization: \`Bearer \${process.env.QA_TOKEN}\` },
    data: payload
  });
  expect(res.ok()).toBeTruthy();
  expect(res.status()).toBe(${expectedStatus});

  const body = await res.json();
  const ajv = new Ajv();
  expect(ajv.validate(schema, body)).toBe(true);

  test.info().annotations.push({ type: 'rt', description: \`\${res.headers()['x-response-time'] || 'N/A'}ms\` });
});
`;
}

// Generate test template for DELETE requests
function generateDeleteTest(route: RouteDetail): string {
  const schemaFilename = pathToSchemaFilename(route.path, route.method);
  const expectedStatus = route.expected_status || 200;
  
  return `import { test, expect } from '@playwright/test';
import Ajv from 'ajv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../schemas/${schemaFilename}'), 'utf-8'));

test.use({ 
  baseURL: process.env.API_BASE,
  trace: 'retain-on-failure'
});

test('DELETE ${route.path} returns ${expectedStatus}', async ({ request }) => {
  const res = await request.delete('${route.path}', {
    headers: { Authorization: \`Bearer \${process.env.QA_TOKEN}\` }
  });
  expect(res.ok()).toBeTruthy();
  expect(res.status()).toBe(${expectedStatus});

  const body = await res.json();
  const ajv = new Ajv();
  expect(ajv.validate(schema, body)).toBe(true);

  test.info().annotations.push({ type: 'rt', description: \`\${res.headers()['x-response-time'] || 'N/A'}ms\` });
});
`;
}

// Generate test content based on method
function generateTestContent(route: RouteDetail): string {
  switch (route.method.toUpperCase()) {
    case 'GET':
      return generateGetTest(route);
    case 'POST':
      return generatePostTest(route);
    case 'PUT':
      return generatePutTest(route);
    case 'DELETE':
      return generateDeleteTest(route);
    default:
      throw new Error(`Unsupported HTTP method: ${route.method}`);
  }
}

// Generate JSON schema stub
function generateSchemaStub(route: RouteDetail): object {
  // Basic JSON Schema draft-07 structure
  const schema = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": true
  };
  
  // For now, create a minimal schema - in a real implementation,
  // this would make an actual API call to infer the schema
  switch (route.method.toUpperCase()) {
    case 'GET':
      // Assume GET returns an array or object
      return {
        ...schema,
        "oneOf": [
          { "type": "array", "items": { "type": "object" } },
          { "type": "object" }
        ]
      };
    case 'POST':
    case 'PUT':
      // Assume POST/PUT returns created/updated object
      return {
        ...schema,
        "properties": {
          "id": { "type": "string" },
          "created_at": { "type": "string", "format": "date-time" },
          "updated_at": { "type": "string", "format": "date-time" }
        }
      };
    case 'DELETE':
      // Assume DELETE returns success message
      return {
        ...schema,
        "properties": {
          "message": { "type": "string" },
          "success": { "type": "boolean" }
        },
        "required": ["success"]
      };
    default:
      return schema;
  }
}

// Main generator function
function generatePlaywrightTests(): void {
  console.log('🚀 Starting Playwright API test generation...');
  
  // Validate environment
  try {
    validateEnvironment();
  } catch (error) {
    console.error('❌ Environment validation failed:', error.message);
    process.exit(1);
  }
  
  // Read API route map
  const routeMapPath = path.resolve(process.cwd(), '../api_route_map.json');
  const sampleDataPath = path.resolve(process.cwd(), 'sample_route_data.json');
  
  // Use sample data if main file has empty route_details
  let useMainFile = true;
  if (fs.existsSync(routeMapPath)) {
    const mainContent = JSON.parse(fs.readFileSync(routeMapPath, 'utf-8'));
    if (!mainContent.route_details || mainContent.route_details.length === 0) {
      useMainFile = false;
    }
  }
  
  const finalPath = useMainFile ? routeMapPath : sampleDataPath;
  if (!fs.existsSync(finalPath)) {
    console.error(`❌ API route map not found at: ${finalPath}`);
    process.exit(1);
  }
  
  console.log(`📖 Using route data from: ${useMainFile ? 'main api_route_map.json' : 'sample_route_data.json'}`);
  const routeMapContent = fs.readFileSync(finalPath, 'utf-8');
  const routeMap: ApiRouteMap = JSON.parse(routeMapContent);
  
  if (!routeMap.route_details || !Array.isArray(routeMap.route_details)) {
    console.warn('⚠️  No route_details found in API route map. Exiting.');
    return;
  }
  
  // Filter routes based on selection rules
  const validMethods = ['GET', 'POST', 'PUT', 'DELETE'];
  const selectedRoutes = routeMap.route_details.filter(route => {
    return route.is_used_in_frontend === true &&
           validMethods.includes(route.method.toUpperCase()) &&
           route.backend_only !== true;
  });
  
  console.log(`📊 Found ${selectedRoutes.length} routes to generate tests for`);
  
  if (selectedRoutes.length === 0) {
    console.warn('⚠️  No routes match the selection criteria.');
    return;
  }
  
  // Ensure directories exist
  const testsDir = path.resolve(process.cwd(), 'tests/api');
  const schemasDir = path.resolve(process.cwd(), 'schemas');
  
  if (!fs.existsSync(testsDir)) {
    fs.mkdirSync(testsDir, { recursive: true });
  }
  
  if (!fs.existsSync(schemasDir)) {
    fs.mkdirSync(schemasDir, { recursive: true });
  }
  
  let generatedFiles = 0;
  let generatedSchemas = 0;
  
  // Generate tests and schemas
  selectedRoutes.forEach(route => {
    try {
      // Generate test file
      const testFilename = pathToFilename(route.path, route.method, selectedRoutes);
      const testFilePath = path.join(testsDir, testFilename);
      const testContent = generateTestContent(route);
      
      fs.writeFileSync(testFilePath, testContent);
      generatedFiles++;
      
      // Generate schema file
      const schemaFilename = pathToSchemaFilename(route.path, route.method);
      const schemaFilePath = path.join(schemasDir, schemaFilename);
      
      if (!fs.existsSync(schemaFilePath)) {
        const schemaContent = generateSchemaStub(route);
        fs.writeFileSync(schemaFilePath, JSON.stringify(schemaContent, null, 2));
        generatedSchemas++;
      }
      
      console.log(`✅ Generated: ${testFilename} (${route.method} ${route.path})`);
    } catch (error) {
      console.error(`❌ Failed to generate test for ${route.method} ${route.path}:`, error.message);
    }
  });
  
  // Calculate coverage
  const totalFrontendRoutes = routeMap.route_details.filter(r => r.is_used_in_frontend).length;
  const coverage = totalFrontendRoutes > 0 ? (selectedRoutes.length / totalFrontendRoutes) * 100 : 0;
  
  console.log('\n📈 Generation Summary:');
  console.log(`   Generated test files: ${generatedFiles}`);
  console.log(`   Generated schema files: ${generatedSchemas}`);
  console.log(`   Endpoints covered: ${selectedRoutes.length}`);
  console.log(`   Coverage: ${coverage.toFixed(1)}%`);
  
  if (coverage < 90) {
    console.warn(`⚠️  Coverage is below 90% (${coverage.toFixed(1)}%)`);
  }
  
  console.log('\n🎉 Playwright API test generation completed!');
}

// Run the generator
if (import.meta.url === `file://${process.argv[1]}`) {
  generatePlaywrightTests();
}

export { generatePlaywrightTests };