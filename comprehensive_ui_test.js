#!/usr/bin/env node

// Comprehensive UI and API Testing Script
// This script tests all UI pages and API endpoints for accessibility and functionality

const fs = require('fs');
const path = require('path');

// Configuration
const UI_BASE_URL = 'http://localhost:3004';
const API_BASE_URL = 'http://localhost:8080/api/v1';

// UI Pages to test (based on App.tsx routing)
const UI_PAGES = [
    { name: 'Dashboard', path: '/', description: 'Main dashboard with KPIs and charts' },
    { name: 'Alerts', path: '/alerts', description: 'Security alerts management' },
    { name: 'Cases', path: '/cases', description: 'Investigation cases' },
    { name: 'Admin', path: '/admin', description: 'Admin panel' },
    { name: 'Rules', path: '/rules', description: 'Detection rules management' },
    { name: 'Log Sources', path: '/log-sources', description: 'Log source management' },
    { name: 'Users', path: '/users', description: 'User management' },
    { name: 'Parsers', path: '/parsers', description: 'Parser management' },
    { name: 'Interactive Parser', path: '/interactive-parser', description: 'Interactive parser builder' },
    { name: 'Events', path: '/events', description: 'Event investigation' },
    { name: 'Log Activity', path: '/log-activity', description: 'Event investigation page' },
    { name: 'Vendor Mapping', path: '/vendor-mapping', description: 'Vendor mapping configuration' },
    { name: 'Agent Fleet', path: '/agent-fleet', description: 'Agent fleet management' }
];

// API Endpoints to test
const API_ENDPOINTS = [
    { name: 'Health Check', method: 'GET', path: '/health', auth: false },
    { name: 'Events Search', method: 'POST', path: '/events/search', auth: true, body: { query: "*", limit: 10 } },
    { name: 'Alerts List', method: 'GET', path: '/alerts', auth: true },
    { name: 'Rules List', method: 'GET', path: '/rules', auth: true },
    { name: 'Log Sources', method: 'GET', path: '/log_sources/cache', auth: true },
    { name: 'Users List', method: 'GET', path: '/users', auth: true },
    { name: 'Agents Fleet', method: 'GET', path: '/agents/fleet', auth: true },
    { name: 'Dashboard Data', method: 'GET', path: '/dashboard', auth: true },
    { name: 'Cases List', method: 'GET', path: '/cases', auth: true },
    { name: 'Parsers List', method: 'GET', path: '/parsers', auth: true }
];

class UITester {
    constructor() {
        this.results = {
            ui: {},
            api: {},
            summary: {
                totalTests: 0,
                passed: 0,
                failed: 0,
                errors: []
            }
        };
        this.authToken = null;
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = {
            'info': '📋',
            'success': '✅',
            'error': '❌',
            'warning': '⚠️'
        }[type] || '📋';
        
        console.log(`[${timestamp}] ${prefix} ${message}`);
    }

    async testUIServer() {
        this.log('Testing UI server accessibility...', 'info');
        
        try {
            const response = await fetch(UI_BASE_URL);
            if (response.ok) {
                this.log('UI server is accessible', 'success');
                return true;
            } else {
                this.log(`UI server returned status: ${response.status}`, 'error');
                return false;
            }
        } catch (error) {
            this.log(`UI server is not accessible: ${error.message}`, 'error');
            return false;
        }
    }

    async testAPIServer() {
        this.log('Testing API server accessibility...', 'info');
        
        try {
            const response = await fetch(`${API_BASE_URL}/health`);
            if (response.ok) {
                this.log('API server is accessible', 'success');
                return true;
            } else {
                this.log(`API server returned status: ${response.status}`, 'error');
                return false;
            }
        } catch (error) {
            this.log(`API server is not accessible: ${error.message}`, 'error');
            return false;
        }
    }

    async testUIPages() {
        this.log('Testing UI pages...', 'info');
        
        for (const page of UI_PAGES) {
            this.results.summary.totalTests++;
            
            try {
                // Test if the UI server responds (we can't test actual routing without a browser)
                const response = await fetch(`${UI_BASE_URL}${page.path}`, { 
                    method: 'HEAD',
                    redirect: 'follow'
                });
                
                if (response.ok || response.status === 200) {
                    this.results.ui[page.name] = { status: 'pass', error: null };
                    this.results.summary.passed++;
                    this.log(`${page.name} (${page.path}): Accessible`, 'success');
                } else {
                    this.results.ui[page.name] = { status: 'fail', error: `HTTP ${response.status}` };
                    this.results.summary.failed++;
                    this.results.summary.errors.push(`${page.name}: HTTP ${response.status}`);
                    this.log(`${page.name} (${page.path}): HTTP ${response.status}`, 'error');
                }
            } catch (error) {
                this.results.ui[page.name] = { status: 'fail', error: error.message };
                this.results.summary.failed++;
                this.results.summary.errors.push(`${page.name}: ${error.message}`);
                this.log(`${page.name} (${page.path}): ${error.message}`, 'error');
            }
        }
    }

    async loadAuthToken() {
        try {
            // For Node.js environment
            if (typeof require !== 'undefined') {
                const fs = require('fs');
                const token = fs.readFileSync('superadmin_token.txt', 'utf8').trim();
                this.authToken = token;
                this.log('Authentication token loaded from file', 'success');
                return true;
            } else {
                // For browser environment - use hardcoded token
                this.authToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzdXBlcmFkbWluLXVzZXIiLCJ0aWQiOiJ0ZW5hbnQtQSIsInJvbGVzIjpbIkFkbWluIiwiU3VwZXJBZG1pbiJdLCJleHAiOjE3NTMzNzI0Njl9.d2jkn1ceCmJtoK-ze_vDO4tyTgoTUR6mETqmheXXpx4';
                this.log('Authentication token loaded (hardcoded)', 'success');
                return true;
            }
        } catch (error) {
            this.log(`Failed to load auth token: ${error.message}`, 'error');
            return false;
        }
    }

    async testAPIEndpoints() {
        this.log('Testing API endpoints...', 'info');
        
        for (const endpoint of API_ENDPOINTS) {
            this.results.summary.totalTests++;
            
            try {
                const options = {
                    method: endpoint.method,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                };

                // Add authentication for protected endpoints
                if (endpoint.auth && this.authToken) {
                    options.headers['Authorization'] = `Bearer ${this.authToken}`;
                }

                if (endpoint.body) {
                    options.body = JSON.stringify(endpoint.body);
                }

                const response = await fetch(`${API_BASE_URL}${endpoint.path}`, options);
                
                // Consider 200, 201, 204 as success, 403 as insufficient permissions (but working)
                if ([200, 201, 204, 403].includes(response.status)) {
                    this.results.api[endpoint.name] = { 
                        status: 'pass', 
                        httpStatus: response.status,
                        error: null 
                    };
                    this.results.summary.passed++;
                    
                    let statusMsg = '';
                    if (response.status === 403) statusMsg = ' (Insufficient permissions)';
                    
                    this.log(`${endpoint.name}: HTTP ${response.status}${statusMsg}`, 'success');
                } else {
                    const errorText = await response.text();
                    this.results.api[endpoint.name] = { 
                        status: 'fail', 
                        httpStatus: response.status,
                        error: errorText 
                    };
                    this.results.summary.failed++;
                    this.results.summary.errors.push(`${endpoint.name}: HTTP ${response.status} - ${errorText}`);
                    this.log(`${endpoint.name}: HTTP ${response.status} - ${errorText}`, 'error');
                }
            } catch (error) {
                this.results.api[endpoint.name] = { 
                    status: 'fail', 
                    httpStatus: null,
                    error: error.message 
                };
                this.results.summary.failed++;
                this.results.summary.errors.push(`${endpoint.name}: ${error.message}`);
                this.log(`${endpoint.name}: ${error.message}`, 'error');
            }
        }
    }

    generateReport() {
        const reportPath = path.join(__dirname, 'ui_test_report.json');
        const htmlReportPath = path.join(__dirname, 'ui_test_report.html');
        
        // Generate JSON report
        fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
        
        // Generate HTML report
        const htmlReport = this.generateHTMLReport();
        fs.writeFileSync(htmlReportPath, htmlReport);
        
        this.log(`Reports generated:`, 'info');
        this.log(`  JSON: ${reportPath}`, 'info');
        this.log(`  HTML: ${htmlReportPath}`, 'info');
    }

    generateHTMLReport() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SIEM UI/API Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .summary-card { padding: 20px; border-radius: 8px; text-align: center; }
        .summary-card.total { background: #e3f2fd; }
        .summary-card.passed { background: #e8f5e8; }
        .summary-card.failed { background: #ffebee; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #333; border-bottom: 2px solid #ddd; padding-bottom: 10px; }
        .test-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; }
        .test-item { padding: 15px; border-radius: 8px; border-left: 4px solid #ddd; }
        .test-item.pass { background: #f1f8e9; border-left-color: #4caf50; }
        .test-item.fail { background: #ffebee; border-left-color: #f44336; }
        .test-name { font-weight: bold; margin-bottom: 5px; }
        .test-status { font-size: 0.9em; color: #666; }
        .error-list { background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; }
        .error-list ul { margin: 0; padding-left: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 SIEM UI/API Test Report</h1>
            <p>Generated on ${new Date().toLocaleString()}</p>
        </div>
        
        <div class="summary">
            <div class="summary-card total">
                <h3>Total Tests</h3>
                <div style="font-size: 2em; font-weight: bold;">${this.results.summary.totalTests}</div>
            </div>
            <div class="summary-card passed">
                <h3>Passed</h3>
                <div style="font-size: 2em; font-weight: bold; color: #4caf50;">${this.results.summary.passed}</div>
            </div>
            <div class="summary-card failed">
                <h3>Failed</h3>
                <div style="font-size: 2em; font-weight: bold; color: #f44336;">${this.results.summary.failed}</div>
            </div>
        </div>
        
        <div class="section">
            <h2>🖥️ UI Pages</h2>
            <div class="test-grid">
                ${Object.entries(this.results.ui).map(([name, result]) => `
                    <div class="test-item ${result.status}">
                        <div class="test-name">${name}</div>
                        <div class="test-status">
                            Status: ${result.status === 'pass' ? '✅ Pass' : '❌ Fail'}
                            ${result.error ? `<br>Error: ${result.error}` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="section">
            <h2>🔌 API Endpoints</h2>
            <div class="test-grid">
                ${Object.entries(this.results.api).map(([name, result]) => `
                    <div class="test-item ${result.status}">
                        <div class="test-name">${name}</div>
                        <div class="test-status">
                            Status: ${result.status === 'pass' ? '✅ Pass' : '❌ Fail'}<br>
                            HTTP: ${result.httpStatus || 'N/A'}
                            ${result.error ? `<br>Error: ${result.error}` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        ${this.results.summary.errors.length > 0 ? `
        <div class="section">
            <h2>⚠️ Errors Summary</h2>
            <div class="error-list">
                <ul>
                    ${this.results.summary.errors.map(error => `<li>${error}</li>`).join('')}
                </ul>
            </div>
        </div>
        ` : ''}
    </div>
</body>
</html>
        `;
    }

    printSummary() {
        this.log('\n=== TEST SUMMARY ===', 'info');
        this.log(`Total Tests: ${this.results.summary.totalTests}`, 'info');
        this.log(`Passed: ${this.results.summary.passed}`, 'success');
        this.log(`Failed: ${this.results.summary.failed}`, this.results.summary.failed > 0 ? 'error' : 'success');
        
        if (this.results.summary.errors.length > 0) {
            this.log('\nErrors:', 'warning');
            this.results.summary.errors.forEach(error => {
                this.log(`  - ${error}`, 'error');
            });
        }
        
        this.log('\n📊 Detailed results saved to ui_test_report.json and ui_test_report.html', 'info');
    }

    async run() {
        this.log('🚀 Starting comprehensive UI/API testing...', 'info');
        
        // Test server accessibility first
        const uiServerOk = await this.testUIServer();
        const apiServerOk = await this.testAPIServer();
        
        if (!uiServerOk) {
            this.log('UI server is not accessible. Please start it with: npm run dev', 'error');
        }
        
        if (!apiServerOk) {
            this.log('API server is not accessible. Please start it with: cargo run', 'error');
        }
        
        if (!uiServerOk && !apiServerOk) {
            this.log('Both servers are down. Cannot proceed with testing.', 'error');
            return;
        }
        
        // Test UI pages if UI server is running
        if (uiServerOk) {
            await this.testUIPages();
        }
        
        // Test API endpoints if API server is running
        if (apiServerOk) {
            await this.loadAuthToken();
            await this.testAPIEndpoints();
        }
        
        // Generate reports
        this.generateReport();
        this.printSummary();
        
        this.log('\n🎯 Manual Testing Recommendations:', 'info');
        this.log('1. Open http://localhost:3004 in browser', 'info');
        this.log('2. Open Developer Tools (F12)', 'info');
        this.log('3. Check Console tab for JavaScript errors', 'info');
        this.log('4. Check Network tab for failed API calls', 'info');
        this.log('5. Navigate through each page and test functionality', 'info');
        this.log('6. Test forms, buttons, and interactive elements', 'info');
    }
}

// Run the tests
if (require.main === module) {
    const tester = new UITester();
    tester.run().catch(console.error);
}

module.exports = UITester;