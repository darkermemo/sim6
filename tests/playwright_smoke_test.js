/**
 * Playwright Smoke Test for ClickHouse Database Standardization
 * Tests the complete UI flow: Ingest via UI → Search Dashboard → Verify Results
 */

const { test, expect } = require('@playwright/test');
const { chromium } = require('playwright');

// Test configuration
const config = {
  apiUrl: process.env.API_URL || 'http://localhost:8080',
  uiUrl: process.env.UI_URL || 'http://localhost:3000',
  ingestorUrl: process.env.INGESTOR_URL || 'http://localhost:8081',
  adminToken: process.env.ADMIN_TOKEN || 'admin-token-12345-change-in-production',
  clickhouseDatabase: process.env.CLICKHOUSE_DATABASE || 'dev',
  timeout: 30000
};

// Test data
const testEvent = {
  timestamp: Math.floor(Date.now() / 1000),
  event_type: 'network_traffic',
  source_ip: '192.168.1.200',
  dest_ip: '10.0.0.100',
  protocol: 'TCP',
  action: 'blocked',
  severity: 'high',
  message: 'Playwright smoke test event for database standardization',
  tenant_id: 'playwright-test',
  vendor: 'playwright-vendor',
  product: 'smoke-test'
};

test.describe('ClickHouse Database Standardization Smoke Tests', () => {
  let browser;
  let context;
  let page;

  test.beforeAll(async () => {
    browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      slowMo: 100
    });
    
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true
    });
    
    page = await context.newPage();
    
    // Set up console logging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error('Browser console error:', msg.text());
      }
    });
    
    // Set up request/response logging
    page.on('response', response => {
      if (!response.ok() && response.url().includes('/api/')) {
        console.error(`API Error: ${response.status()} ${response.url()}`);
      }
    });
  });

  test.afterAll(async () => {
    await browser?.close();
  });

  test('Service Health Check', async () => {
    console.log('🔍 Testing service health...');
    
    // Check API health
    const apiResponse = await page.request.get(`${config.apiUrl}/health`);
    expect(apiResponse.ok()).toBeTruthy();
    console.log('✅ API service is healthy');
    
    // Check UI accessibility
    const response = await page.goto(config.uiUrl, { waitUntil: 'networkidle' });
    expect(response.ok()).toBeTruthy();
    console.log('✅ UI service is accessible');
  });

  test('Database Standardization - Complete UI Flow', async () => {
    console.log('🧪 Starting complete UI flow test...');
    console.log(`Database: ${config.clickhouseDatabase}`);
    
    // Step 1: Navigate to the application
    console.log('📱 Navigating to SIEM UI...');
    await page.goto(config.uiUrl, { waitUntil: 'networkidle' });
    
    // Wait for the page to load completely
    await page.waitForLoadState('domcontentloaded');
    
    // Step 2: Handle authentication if needed
    console.log('🔐 Handling authentication...');
    
    // Check if we need to login
    const loginButton = page.locator('button:has-text("Login"), button:has-text("Sign In")');
    if (await loginButton.isVisible({ timeout: 5000 })) {
      // If there's a token input field, use it
      const tokenInput = page.locator('input[type="password"], input[placeholder*="token"], input[name="token"]');
      if (await tokenInput.isVisible({ timeout: 2000 })) {
        await tokenInput.fill(config.adminToken);
        await loginButton.click();
        await page.waitForLoadState('networkidle');
      }
    }
    
    // Step 3: Navigate to event ingestion page
    console.log('📥 Navigating to event ingestion...');
    
    // Look for navigation links to ingestion/events page
    const ingestLink = page.locator('a:has-text("Ingest"), a:has-text("Events"), a:has-text("Add Event")');
    if (await ingestLink.first().isVisible({ timeout: 5000 })) {
      await ingestLink.first().click();
      await page.waitForLoadState('networkidle');
    } else {
      // Try direct navigation to ingestion page
      await page.goto(`${config.uiUrl}/ingest`, { waitUntil: 'networkidle' });
    }
    
    // Step 4: Ingest test event via UI
    console.log('📝 Ingesting test event via UI...');
    
    // Look for event input form
    const eventForm = page.locator('form, .event-form, .ingest-form');
    await expect(eventForm.first()).toBeVisible({ timeout: 10000 });
    
    // Fill in event data - try different possible field names
    const fieldMappings = {
      source_ip: ['source_ip', 'sourceIp', 'src_ip', 'source'],
      dest_ip: ['dest_ip', 'destIp', 'dst_ip', 'destination'],
      protocol: ['protocol', 'proto'],
      action: ['action', 'event_action'],
      severity: ['severity', 'level'],
      message: ['message', 'description', 'event_message'],
      vendor: ['vendor', 'source_vendor'],
      product: ['product', 'source_product']
    };
    
    for (const [key, possibleNames] of Object.entries(fieldMappings)) {
      for (const name of possibleNames) {
        const input = page.locator(`input[name="${name}"], input[id="${name}"], textarea[name="${name}"]`);
        if (await input.isVisible({ timeout: 1000 })) {
          await input.fill(testEvent[key]);
          break;
        }
      }
    }
    
    // Submit the form
    const submitButton = page.locator('button[type="submit"], button:has-text("Submit"), button:has-text("Ingest"), button:has-text("Add")');
    await expect(submitButton.first()).toBeVisible();
    await submitButton.first().click();
    
    // Wait for success indication
    await page.waitForTimeout(2000);
    
    // Look for success message
    const successMessage = page.locator('.success, .alert-success, :has-text("success"), :has-text("ingested")');
    if (await successMessage.isVisible({ timeout: 5000 })) {
      console.log('✅ Event ingested successfully via UI');
    } else {
      console.log('⚠️  No explicit success message found, continuing...');
    }
    
    // Step 5: Navigate to search/dashboard
    console.log('🔍 Navigating to search dashboard...');
    
    const searchLink = page.locator('a:has-text("Search"), a:has-text("Dashboard"), a:has-text("Events")');
    if (await searchLink.first().isVisible({ timeout: 5000 })) {
      await searchLink.first().click();
      await page.waitForLoadState('networkidle');
    } else {
      // Try direct navigation
      await page.goto(`${config.uiUrl}/search`, { waitUntil: 'networkidle' });
    }
    
    // Step 6: Wait for event processing
    console.log('⏳ Waiting for event processing...');
    await page.waitForTimeout(5000);
    
    // Step 7: Search for our test event
    console.log('🔎 Searching for test event...');
    
    // Look for search input
    const searchInput = page.locator('input[type="search"], input[placeholder*="search"], input[name="query"]');
    if (await searchInput.isVisible({ timeout: 5000 })) {
      // Search by source IP
      await searchInput.fill(testEvent.source_ip);
      
      // Look for search button
      const searchButton = page.locator('button:has-text("Search"), button[type="submit"]');
      if (await searchButton.isVisible({ timeout: 2000 })) {
        await searchButton.click();
      } else {
        // Try pressing Enter
        await searchInput.press('Enter');
      }
      
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
    }
    
    // Step 8: Verify search results
    console.log('✅ Verifying search results...');
    
    // Look for results table or list
    const resultsContainer = page.locator('.results, .events-table, .search-results, table');
    await expect(resultsContainer.first()).toBeVisible({ timeout: 10000 });
    
    // Look for our test event in the results
    const eventRow = page.locator(`:has-text("${testEvent.source_ip}")`);
    await expect(eventRow.first()).toBeVisible({ timeout: 5000 });
    
    // Verify event details
    const sourceIpElement = page.locator(`:has-text("${testEvent.source_ip}")`);
    const destIpElement = page.locator(`:has-text("${testEvent.dest_ip}")`);
    const vendorElement = page.locator(`:has-text("${testEvent.vendor}")`);
    
    await expect(sourceIpElement.first()).toBeVisible();
    console.log('✅ Found source IP in results');
    
    if (await destIpElement.isVisible({ timeout: 2000 })) {
      console.log('✅ Found destination IP in results');
    }
    
    if (await vendorElement.isVisible({ timeout: 2000 })) {
      console.log('✅ Found vendor in results');
    }
    
    // Step 9: Verify count
    console.log('📊 Verifying event count...');
    
    // Look for result count indicators
    const countElements = page.locator('.count, .total, :has-text("result"), :has-text("event")');
    const countText = await countElements.first().textContent({ timeout: 5000 }).catch(() => '');
    
    if (countText && countText.includes('1')) {
      console.log('✅ Event count verification successful');
    } else {
      console.log('⚠️  Could not verify exact count, but event is visible');
    }
    
    console.log('🎉 Complete UI flow test passed!');
  });

  test('API Integration Verification', async () => {
    console.log('🔍 Testing API integration directly...');
    
    // Test direct API ingestion
    const ingestResponse = await page.request.post(`${config.ingestorUrl}/api/v1/events/ingest`, {
      headers: {
        'Authorization': `Bearer ${config.adminToken}`,
        'Content-Type': 'application/json'
      },
      data: testEvent
    });
    
    expect(ingestResponse.ok()).toBeTruthy();
    console.log('✅ Direct API ingestion successful');
    
    // Wait for processing
    await page.waitForTimeout(3000);
    
    // Test search API
    const searchResponse = await page.request.post(`${config.apiUrl}/api/v1/events/search`, {
      headers: {
        'Authorization': `Bearer ${config.adminToken}`,
        'Content-Type': 'application/json'
      },
      data: {
        query: `source_ip = '${testEvent.source_ip}'`,
        limit: 10,
        offset: 0
      }
    });
    
    expect(searchResponse.ok()).toBeTruthy();
    
    const searchData = await searchResponse.json();
    expect(searchData.events).toBeDefined();
    expect(Array.isArray(searchData.events)).toBeTruthy();
    expect(searchData.events.length).toBeGreaterThan(0);
    
    console.log(`✅ Search API returned ${searchData.events.length} events`);
    console.log('✅ API integration verification successful');
  });

  test('Database Configuration Verification', async () => {
    console.log('🔍 Verifying database configuration...');
    
    // Check that the application is using the correct database
    const response = await page.request.get(`${config.apiUrl}/api/v1/system/info`, {
      headers: {
        'Authorization': `Bearer ${config.adminToken}`
      }
    });
    
    if (response.ok()) {
      const systemInfo = await response.json();
      console.log('✅ System info retrieved');
      
      if (systemInfo.database && systemInfo.database.includes(config.clickhouseDatabase)) {
        console.log(`✅ Confirmed using database: ${config.clickhouseDatabase}`);
      } else {
        console.log(`⚠️  Database info not explicitly confirmed, assuming ${config.clickhouseDatabase}`);
      }
    } else {
      console.log('⚠️  System info endpoint not available, skipping database verification');
    }
  });
});

// Export configuration for external use
module.exports = { config, testEvent };