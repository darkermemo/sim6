#!/usr/bin/env node

/**
 * Frontend API Usage Scanner
 * Scans React/TypeScript frontend code for /api/v1/* endpoint usage
 * Maps API calls to components, hooks, and services
 */

const fs = require('fs');
const path = require('path');

// Regex patterns for API endpoint detection
const API_PATTERNS = [
  // Direct string literals: '/api/v1/alerts'
  /['"`](\/api\/v1\/[^'"` ]+)['"`]/g,
  // Template literals: `/api/v1/alerts/${id}`
  /`(\/api\/v1\/[^`]+)`/g,
  // URL construction: new URL('/api/v1/alerts', baseUrl)
  /new URL\(['"`](\/api\/v1\/[^'"` ]+)['"`]/g,
  // Fetch calls: fetch('/api/v1/alerts')
  /fetch\(['"`](\/api\/v1\/[^'"` ]+)['"`]/g,
  // Axios calls: axios.get('/api/v1/alerts')
  /axios\.[a-z]+\(['"`](\/api\/v1\/[^'"` ]+)['"`]/g,
  // API client calls: apiClient.get('/api/v1/alerts')
  /apiClient\.[a-z]+\(['"`](\/api\/v1\/[^'"` ]+)['"`]/g
];

// Function call patterns that might contain API endpoints
const FUNCTION_PATTERNS = [
  // useSWR, useQuery, etc.
  /use(SWR|Query|Mutation)\s*\(['"`](\/api\/v1\/[^'"` ]+)['"`]/g,
  // Custom hooks
  /use[A-Z]\w*\s*\(['"`](\/api\/v1\/[^'"` ]+)['"`]/g
];

class FrontendAPIScanner {
  constructor(frontendDir = './siem_ui/src') {
    this.frontendDir = frontendDir;
    this.apiUsage = new Map();
    this.componentMap = new Map();
    this.hookMap = new Map();
    this.serviceMap = new Map();
  }

  /**
   * Scan a single file for API endpoint usage
   */
  scanFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relativePath = path.relative(process.cwd(), filePath);
      const fileType = this.categorizeFile(relativePath);
      
      const endpoints = new Set();
      
      // Apply all regex patterns
      [...API_PATTERNS, ...FUNCTION_PATTERNS].forEach(pattern => {
        let match;
        const regex = new RegExp(pattern.source, pattern.flags);
        
        while ((match = regex.exec(content)) !== null) {
          const endpoint = match[1] || match[2]; // Handle different capture groups
          if (endpoint && endpoint.startsWith('/api/v1/')) {
            endpoints.add(endpoint);
          }
        }
      });
      
      // Store results
      endpoints.forEach(endpoint => {
        if (!this.apiUsage.has(endpoint)) {
          this.apiUsage.set(endpoint, []);
        }
        
        const usage = {
          file: relativePath,
          type: fileType,
          context: this.extractContext(content, endpoint)
        };
        
        this.apiUsage.get(endpoint).push(usage);
        
        // Categorize by file type
        switch (fileType) {
          case 'component':
            this.addToMap(this.componentMap, endpoint, usage);
            break;
          case 'hook':
            this.addToMap(this.hookMap, endpoint, usage);
            break;
          case 'service':
            this.addToMap(this.serviceMap, endpoint, usage);
            break;
        }
      });
      
    } catch (error) {
      console.warn(`Warning: Could not scan ${filePath}: ${error.message}`);
    }
  }

  /**
   * Categorize file type based on path and naming conventions
   */
  categorizeFile(filePath) {
    if (filePath.includes('/hooks/') || filePath.startsWith('use') || filePath.includes('use')) {
      return 'hook';
    }
    if (filePath.includes('/services/') || filePath.includes('/api/') || filePath.includes('api.ts')) {
      return 'service';
    }
    if (filePath.includes('/components/') || filePath.includes('/pages/') || filePath.endsWith('.tsx')) {
      return 'component';
    }
    if (filePath.includes('/stores/') || filePath.includes('/store/')) {
      return 'store';
    }
    if (filePath.includes('/types/') || filePath.includes('/schemas/')) {
      return 'types';
    }
    return 'other';
  }

  /**
   * Extract context around API endpoint usage
   */
  extractContext(content, endpoint) {
    const lines = content.split('\n');
    const contexts = [];
    
    lines.forEach((line, index) => {
      if (line.includes(endpoint)) {
        // Get surrounding context (2 lines before and after)
        const start = Math.max(0, index - 2);
        const end = Math.min(lines.length, index + 3);
        const context = lines.slice(start, end).join('\n');
        
        contexts.push({
          line: index + 1,
          context: context.trim()
        });
      }
    });
    
    return contexts;
  }

  /**
   * Helper to add items to categorized maps
   */
  addToMap(map, endpoint, usage) {
    if (!map.has(endpoint)) {
      map.set(endpoint, []);
    }
    map.get(endpoint).push(usage);
  }

  /**
   * Recursively scan directory
   */
  scanDirectory(dir = this.frontendDir) {
    if (!fs.existsSync(dir)) {
      console.error(`❌ Frontend directory not found: ${dir}`);
      return;
    }

    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Skip node_modules and build directories
        if (!['node_modules', 'dist', 'build', '.git'].includes(item)) {
          this.scanDirectory(fullPath);
        }
      } else if (this.isRelevantFile(fullPath)) {
        this.scanFile(fullPath);
      }
    }
  }

  /**
   * Check if file should be scanned
   */
  isRelevantFile(filePath) {
    const ext = path.extname(filePath);
    return ['.ts', '.tsx', '.js', '.jsx'].includes(ext);
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    const report = {
      summary: {
        totalEndpoints: this.apiUsage.size,
        totalUsages: Array.from(this.apiUsage.values()).reduce((sum, usages) => sum + usages.length, 0),
        componentUsages: Array.from(this.componentMap.values()).reduce((sum, usages) => sum + usages.length, 0),
        hookUsages: Array.from(this.hookMap.values()).reduce((sum, usages) => sum + usages.length, 0),
        serviceUsages: Array.from(this.serviceMap.values()).reduce((sum, usages) => sum + usages.length, 0)
      },
      endpoints: {},
      byCategory: {
        components: Object.fromEntries(this.componentMap),
        hooks: Object.fromEntries(this.hookMap),
        services: Object.fromEntries(this.serviceMap)
      }
    };

    // Convert Map to Object for JSON serialization
    this.apiUsage.forEach((usages, endpoint) => {
      report.endpoints[endpoint] = usages;
    });

    return report;
  }

  /**
   * Print formatted results to console
   */
  printResults() {
    console.log('\n[🔗 API Endpoints Used in Frontend]');
    console.log('=' .repeat(80));
    
    if (this.apiUsage.size === 0) {
      console.log('❌ No /api/v1/* endpoints found in frontend code.');
      return;
    }

    // Sort endpoints alphabetically
    const sortedEndpoints = Array.from(this.apiUsage.keys()).sort();
    
    sortedEndpoints.forEach(endpoint => {
      const usages = this.apiUsage.get(endpoint);
      console.log(`\n📍 ${endpoint} (${usages.length} usage${usages.length > 1 ? 's' : ''}):`);
      
      // Group by file type
      const byType = {};
      usages.forEach(usage => {
        if (!byType[usage.type]) byType[usage.type] = [];
        byType[usage.type].push(usage);
      });
      
      Object.entries(byType).forEach(([type, typeUsages]) => {
        console.log(`  ${type.toUpperCase()}:`);
        typeUsages.forEach(usage => {
          console.log(`    - ${usage.file}`);
        });
      });
    });

    // Print summary
    const report = this.generateReport();
    console.log('\n[📊 Frontend API Usage Summary]');
    console.log('=' .repeat(40));
    console.log(`Total endpoints: ${report.summary.totalEndpoints}`);
    console.log(`Total usages: ${report.summary.totalUsages}`);
    console.log(`Components: ${report.summary.componentUsages}`);
    console.log(`Hooks: ${report.summary.hookUsages}`);
    console.log(`Services: ${report.summary.serviceUsages}`);
  }

  /**
   * Save results to JSON file
   */
  saveResults(filename = 'frontend_api_usage.json') {
    const report = this.generateReport();
    
    fs.writeFileSync(filename, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n✅ Frontend API usage saved to ${filename}`);
  }
}

// Main execution
function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let outputFile = 'frontend_api_usage.json';
  let quiet = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && i + 1 < args.length) {
      outputFile = args[i + 1];
      i++; // Skip next argument as it's the value
    } else if (args[i] === '--quiet') {
      quiet = true;
    }
  }
  
  if (!quiet) {
    console.log('🔍 Scanning frontend code for /api/v1/* usage...\n');
  }
  
  const scanner = new FrontendAPIScanner();
  scanner.scanDirectory();
  
  if (!quiet) {
    scanner.printResults();
  }
  
  scanner.saveResults(outputFile);
  
  if (!quiet) {
    console.log('\n💡 Next step: Run the route mapper to combine backend and frontend analysis.');
  }
}

if (require.main === module) {
  main();
}

module.exports = FrontendAPIScanner;