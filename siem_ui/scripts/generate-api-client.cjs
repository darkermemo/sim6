#!/usr/bin/env node

/**
 * Script to generate TypeScript types from OpenAPI specification
 * This ensures type safety and consistency between frontend and backend
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  inputSpec: '../../openapi.json',
  outputDir: './src/generated',
  typesFile: 'api-types.ts'
};

// Ensure output directory exists
const outputDir = path.resolve(__dirname, '..', config.outputDir);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const outputFile = path.join(outputDir, config.typesFile);

console.log('🚀 Generating TypeScript types from OpenAPI specification...');
console.log(`📁 Output directory: ${config.outputDir}`);
console.log(`📋 Input spec: ${config.inputSpec}`);
console.log(`📄 Output file: ${config.typesFile}`);

try {
  // Generate TypeScript types using openapi-typescript
  const command = `npx openapi-typescript ${config.inputSpec} --output ${outputFile}`;
  
  execSync(command, { 
    stdio: 'inherit',
    cwd: path.dirname(__filename)
  });
  
  console.log('✅ TypeScript types generated successfully!');
  console.log(`📦 Generated file: ${outputFile}`);
  console.log('🔧 Next steps:');
  console.log('  1. Import types in your components');
  console.log('  2. Update existing API service to use generated types');
  console.log('  3. Test the integration');
  
} catch (error) {
  console.error('❌ Failed to generate TypeScript types:', error.message);
  process.exit(1);
}