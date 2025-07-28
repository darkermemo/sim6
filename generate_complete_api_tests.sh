#!/bin/bash

# Complete API Test Generation Workflow
# This script automates the entire process of extracting routes and generating tests

set -e  # Exit on any error

echo "🚀 Starting Complete API Test Generation Workflow"
echo "================================================="

# Step 1: Extract Express/Proxy routes
echo "📋 Step 1: Extracting Express/Proxy routes..."
node express_route_extractor.js

if [ -f "proxy_routes.json" ]; then
    echo "✅ Proxy routes extracted successfully"
else
    echo "⚠️  No proxy routes found, continuing with existing API mapping"
fi

# Step 2: Generate basic Playwright tests
echo "📋 Step 2: Generating basic Playwright tests..."
npx ts-node generate_api_tests.ts

# Step 3: Generate enhanced Playwright tests with auth support
echo "📋 Step 3: Generating enhanced Playwright tests..."
npx ts-node enhanced_api_test_generator.ts

# Step 4: Create Playwright configuration if it doesn't exist
echo "📋 Step 4: Setting up Playwright configuration..."
if [ ! -f "playwright.config.ts" ]; then
    echo "Creating Playwright configuration..."
    cat > playwright.config.ts << 'EOF'
import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:8082',
    
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'echo "Using existing server on port 8082"',
    url: 'http://localhost:8082',
    reuseExistingServer: !process.env.CI,
  },
});
EOF
    echo "✅ Playwright configuration created"
else
    echo "✅ Playwright configuration already exists"
fi

# Step 5: Install Playwright if not already installed
echo "📋 Step 5: Checking Playwright installation..."
if ! command -v playwright &> /dev/null; then
    echo "Installing Playwright..."
    npm install -D @playwright/test
    npx playwright install
else
    echo "✅ Playwright is already installed"
fi

# Step 6: Generate test summary
echo "📋 Step 6: Generating test summary..."
echo "" > test_generation_summary.md
echo "# API Test Generation Summary" >> test_generation_summary.md
echo "Generated at: $(date)" >> test_generation_summary.md
echo "" >> test_generation_summary.md

if [ -f "proxy_routes.json" ]; then
    PROXY_COUNT=$(jq '.total_routes' proxy_routes.json 2>/dev/null || echo "0")
    echo "## Proxy Routes Extracted: $PROXY_COUNT" >> test_generation_summary.md
fi

if [ -f "tests/generated_api_tests.spec.ts" ]; then
    BASIC_TESTS=$(grep -c "test('" tests/generated_api_tests.spec.ts || echo "0")
    echo "## Basic Playwright Tests Generated: $BASIC_TESTS" >> test_generation_summary.md
fi

if [ -f "tests/enhanced_api_tests.spec.ts" ]; then
    ENHANCED_TESTS=$(grep -c "test('" tests/enhanced_api_tests.spec.ts || echo "0")
    echo "## Enhanced Playwright Tests Generated: $ENHANCED_TESTS" >> test_generation_summary.md
fi

echo "" >> test_generation_summary.md
echo "## Files Generated:" >> test_generation_summary.md
echo "- \`proxy_routes.json\` - Extracted Express/proxy routes" >> test_generation_summary.md
echo "- \`tests/generated_api_tests.spec.ts\` - Basic API tests" >> test_generation_summary.md
echo "- \`tests/enhanced_api_tests.spec.ts\` - Enhanced API tests with auth" >> test_generation_summary.md
echo "- \`playwright.config.ts\` - Playwright configuration" >> test_generation_summary.md
echo "" >> test_generation_summary.md
echo "## Next Steps:" >> test_generation_summary.md
echo "1. Review and customize the generated tests" >> test_generation_summary.md
echo "2. Update authentication tokens/headers as needed" >> test_generation_summary.md
echo "3. Run tests with: \`npx playwright test\`" >> test_generation_summary.md
echo "4. View test results with: \`npx playwright show-report\`" >> test_generation_summary.md

echo "================================================="
echo "🎉 Complete API Test Generation Workflow Finished!"
echo "📄 Summary saved to: test_generation_summary.md"
echo ""
echo "📋 Generated Files:"
ls -la tests/*.spec.ts 2>/dev/null || echo "   No test files found"
echo ""
echo "🚀 To run the tests:"
echo "   npx playwright test"
echo ""
echo "📊 To view test results:"
echo "   npx playwright show-report"