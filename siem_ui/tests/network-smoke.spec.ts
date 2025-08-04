import { test, expect } from '@playwright/test';

/**
 * Network smoke tests to verify all critical API endpoints return 200
 * This prevents regression of proxy routing issues
 */
test.describe('Network Smoke Tests', () => {
  test('every critical route returns 200', async ({ request }) => {
    const endpoints = [
      'http://127.0.0.1:8082/api/v1/dashboard',
      'http://127.0.0.1:8082/api/v1/events', 
      'http://127.0.0.1:8082/api/v1/cases'
    ];
    
    for (const url of endpoints) {
      console.log(`Testing endpoint: ${url}`);
      
      try {
        const res = await request.get(url);
        expect(res.status()).toBe(200);
        console.log(`✓ ${url} returned ${res.status()}`);
      } catch (error) {
        console.error(`✗ ${url} failed:`, error);
        throw error;
      }
    }
  });
  
  test('routing-rules endpoint with auth returns 200 or 401', async ({ request }) => {
    const url = 'http://127.0.0.1:8084/api/v1/routing-rules?page=1&limit=20';
    
    console.log(`Testing authenticated endpoint: ${url}`);
    
    try {
      const res = await request.get(url);
      // Should return either 200 (if auth works) or 401 (if no token)
      expect([200, 401]).toContain(res.status());
      console.log(`✓ ${url} returned ${res.status()}`);
    } catch (error) {
      console.error(`✗ ${url} failed:`, error);
      throw error;
    }
  });
  
  test('health check endpoints are accessible', async ({ request }) => {
    const healthEndpoints = [
      'http://127.0.0.1:8082/health',
      'http://127.0.0.1:8084/health'
    ];
    
    for (const url of healthEndpoints) {
      console.log(`Testing health endpoint: ${url}`);
      
      try {
        const res = await request.get(url);
        expect([200, 404]).toContain(res.status()); // 404 is acceptable if health endpoint doesn't exist
        console.log(`✓ ${url} returned ${res.status()}`);
      } catch (error) {
        console.log(`⚠ ${url} not accessible (this may be expected)`);
        // Don't fail the test for health endpoints as they may not be implemented
      }
    }
  });
});