/**
 * Comprehensive UI Page Testing Script
 * Tests all pages for accessibility, console errors, and API functionality
 */

const pages = [
  { name: 'Dashboard', path: 'dashboard' },
  { name: 'Alerts', path: 'alerts' },
  { name: 'Cases', path: 'cases' },
  { name: 'Admin', path: 'admin' },
  { name: 'Rules', path: 'rules' },
  { name: 'Log Sources', path: 'log-sources' },
  { name: 'Users', path: 'users' },
  { name: 'Parsers', path: 'parsers' },
  { name: 'Interactive Parser', path: 'interactive-parser' },
  { name: 'Events', path: 'events' },
  { name: 'Log Activity', path: 'log-activity' },
  { name: 'Vendor Mapping', path: 'vendor-mapping' },
  { name: 'Agent Fleet', path: 'agent-fleet' }
];

const testResults = {
  passed: [],
  failed: [],
  consoleErrors: [],
  apiErrors: []
};

// Track console errors
const originalConsoleError = console.error;
console.error = function(...args) {
  testResults.consoleErrors.push({
    page: window.currentTestPage || 'unknown',
    error: args.join(' '),
    timestamp: new Date().toISOString()
  });
  originalConsoleError.apply(console, args);
};

// Track network errors
const originalFetch = window.fetch;
window.fetch = function(...args) {
  return originalFetch.apply(this, args)
    .then(response => {
      if (!response.ok) {
        testResults.apiErrors.push({
          page: window.currentTestPage || 'unknown',
          url: args[0],
          status: response.status,
          statusText: response.statusText,
          timestamp: new Date().toISOString()
        });
      }
      return response;
    })
    .catch(error => {
      testResults.apiErrors.push({
        page: window.currentTestPage || 'unknown',
        url: args[0],
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    });
};

// Function to wait for page load
function waitForPageLoad(timeout = 5000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const checkLoad = () => {
      if (Date.now() - startTime > timeout) {
        resolve(false);
        return;
      }
      
      // Check if page has loaded by looking for common elements
      const hasContent = document.querySelector('[data-testid], .page-content, main, .container');
      if (hasContent) {
        setTimeout(resolve, 1000); // Wait additional 1s for API calls
      } else {
        setTimeout(checkLoad, 100);
      }
    };
    checkLoad();
  });
}

// Function to simulate navigation
function navigateToPage(pagePath) {
  return new Promise((resolve) => {
    window.currentTestPage = pagePath;
    
    // Find navigation element and click it
    const navElements = document.querySelectorAll('[data-page], [data-testid*="nav"], nav a, .nav-item');
    let found = false;
    
    for (const element of navElements) {
      const text = element.textContent?.toLowerCase() || '';
      const dataPage = element.getAttribute('data-page');
      
      if (dataPage === pagePath || text.includes(pagePath.replace('-', ' '))) {
        element.click();
        found = true;
        break;
      }
    }
    
    if (!found) {
      // Try to trigger navigation programmatically if available
      if (window.navigateToPage) {
        window.navigateToPage(pagePath);
      }
    }
    
    setTimeout(resolve, 500);
  });
}

// Function to test a single page
async function testPage(page) {
  console.log(`Testing page: ${page.name} (${page.path})`);
  
  try {
    // Navigate to page
    await navigateToPage(page.path);
    
    // Wait for page to load
    const loaded = await waitForPageLoad();
    
    if (!loaded) {
      testResults.failed.push({
        page: page.name,
        error: 'Page failed to load within timeout',
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    // Check for 404 or error states
    const errorElements = document.querySelectorAll('.error, .not-found, [data-testid*="error"]');
    if (errorElements.length > 0) {
      testResults.failed.push({
        page: page.name,
        error: 'Page shows error state',
        details: Array.from(errorElements).map(el => el.textContent).join(', '),
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    // Check if page has content
    const hasContent = document.querySelector('main, .page-content, .container, [data-testid]');
    if (!hasContent) {
      testResults.failed.push({
        page: page.name,
        error: 'Page appears to be empty',
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    testResults.passed.push({
      page: page.name,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    testResults.failed.push({
      page: page.name,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// Main test function
async function runAllTests() {
  console.log('Starting comprehensive UI testing...');
  
  for (const page of pages) {
    await testPage(page);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait between tests
  }
  
  // Generate report
  console.log('\n=== UI TEST RESULTS ===');
  console.log(`Total Pages Tested: ${pages.length}`);
  console.log(`Passed: ${testResults.passed.length}`);
  console.log(`Failed: ${testResults.failed.length}`);
  console.log(`Console Errors: ${testResults.consoleErrors.length}`);
  console.log(`API Errors: ${testResults.apiErrors.length}`);
  
  if (testResults.failed.length > 0) {
    console.log('\n--- FAILED PAGES ---');
    testResults.failed.forEach(failure => {
      console.log(`❌ ${failure.page}: ${failure.error}`);
      if (failure.details) console.log(`   Details: ${failure.details}`);
    });
  }
  
  if (testResults.consoleErrors.length > 0) {
    console.log('\n--- CONSOLE ERRORS ---');
    testResults.consoleErrors.forEach(error => {
      console.log(`🔴 ${error.page}: ${error.error}`);
    });
  }
  
  if (testResults.apiErrors.length > 0) {
    console.log('\n--- API ERRORS ---');
    testResults.apiErrors.forEach(error => {
      console.log(`🌐 ${error.page}: ${error.url} - ${error.status || error.error}`);
    });
  }
  
  if (testResults.passed.length > 0) {
    console.log('\n--- PASSED PAGES ---');
    testResults.passed.forEach(success => {
      console.log(`✅ ${success.page}`);
    });
  }
  
  return testResults;
}

// Export for manual execution
window.runUITests = runAllTests;
window.testResults = testResults;

console.log('UI Test Script Loaded. Run window.runUITests() to start testing.');