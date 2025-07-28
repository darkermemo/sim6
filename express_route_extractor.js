const fs = require('fs');
const path = require('path');

/**
 * Extracts Express routes from JavaScript files
 * This script parses Express route definitions and maps proxy paths back to Rust
 */

// Pattern to match Express route definitions
const routePattern = /app\.(get|post|put|delete|patch)\(['"\`]([^'"\`]+)['"\`]/g;

/**
 * Extract routes from a single file
 * @param {string} filePath - Path to the JavaScript file
 * @returns {Array} Array of route objects
 */
function extractRoutesFromFile(filePath) {
  const routes = [];
  const code = fs.readFileSync(filePath, 'utf8');
  let match;
  
  while ((match = routePattern.exec(code)) !== null) {
    routes.push({
      method: match[1].toUpperCase(),
      path: match[2],
      file: path.basename(filePath)
    });
  }
  
  return routes;
}

/**
 * Extract routes from all JavaScript files in a directory
 * @param {string} directory - Directory to scan for route files
 * @returns {Array} Array of all found routes
 */
function extractRoutesFromDirectory(directory) {
  const allRoutes = [];
  
  if (!fs.existsSync(directory)) {
    console.log(`⚠️  Directory ${directory} does not exist`);
    return allRoutes;
  }
  
  const files = fs.readdirSync(directory)
    .filter(f => f.endsWith('.js') || f.endsWith('.ts'))
    .map(f => path.join(directory, f));
  
  files.forEach(file => {
    const routes = extractRoutesFromFile(file);
    allRoutes.push(...routes);
  });
  
  return allRoutes;
}

// Main execution
function main() {
  const routes = [];
  
  // Check common Express route directories
  const commonDirs = [
    'proxy/src/routes',
    'src/routes',
    'routes',
    'api/routes',
    '.'
  ];
  
  commonDirs.forEach(dir => {
    const dirRoutes = extractRoutesFromDirectory(dir);
    routes.push(...dirRoutes);
  });
  
  // Also check for single route files
  const commonFiles = [
    'siem_ui_api_server.js',
    'server.js',
    'app.js',
    'index.js'
  ];
  
  commonFiles.forEach(file => {
    if (fs.existsSync(file)) {
      const fileRoutes = extractRoutesFromFile(file);
      routes.push(...fileRoutes);
    }
  });
  
  // Remove duplicates
  const uniqueRoutes = routes.filter((route, index, self) => 
    index === self.findIndex(r => r.method === route.method && r.path === route.path)
  );
  
  // Write results
  fs.writeFileSync('proxy_routes.json', JSON.stringify({
    total_routes: uniqueRoutes.length,
    routes: uniqueRoutes
  }, null, 2));
  
  console.log(`✅ Extracted ${uniqueRoutes.length} proxy routes to proxy_routes.json`);
  
  // Display summary
  const methodCounts = uniqueRoutes.reduce((acc, route) => {
    acc[route.method] = (acc[route.method] || 0) + 1;
    return acc;
  }, {});
  
  console.log('📊 Route summary:');
  Object.entries(methodCounts).forEach(([method, count]) => {
    console.log(`   ${method}: ${count} routes`);
  });
}

if (require.main === module) {
  main();
}

module.exports = { extractRoutesFromFile, extractRoutesFromDirectory };