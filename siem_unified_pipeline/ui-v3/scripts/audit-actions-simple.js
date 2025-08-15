#!/usr/bin/env node
// scripts/audit-actions-simple.js
// Simple regex-based UI action audit

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Simple UI Action Audit');
console.log('==========================');

// Find all TSX/JSX files, excluding wrapper components that are part of the audit system
const srcFiles = execSync('find src -name "*.tsx" -o -name "*.jsx"', { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(f => f)
  .filter(f => !f.includes('ActionButton.tsx') && !f.includes('ActionMenuItem.tsx'));

const report = [];
const actionTags = ['Button', 'DropdownMenuItem', 'AlertDialogAction', 'CommandItem', 'button', 'a', 'Link'];

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    
    // Look for actionable JSX elements
    for (const tag of actionTags) {
      const tagPattern = new RegExp(`<${tag}(?:\\s|>|/>)`, 'gi');
      if (tagPattern.test(line)) {
        const issues = [];
        
        // Check for missing onClick/onSelect/href handlers
        const hasOnClick = /onClick\s*=/.test(line);
        const hasOnSelect = /onSelect\s*=/.test(line);
        const hasHref = /href\s*=/.test(line);
        const hasTypeSubmit = /type\s*=\s*["']submit["']/.test(line);
        const hasDataAction = /data-action\s*=/.test(line);
        const hasDataIntent = /data-intent\s*=/.test(line);
        const hasDataEndpoint = /data-endpoint\s*=/.test(line);
        
        // Check for empty handlers
        const emptyOnClick = /onClick\s*=\s*\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/.test(line);
        const noopHandler = /onClick\s*=\s*\{\s*(noop|void\s+0|return;)\s*\}/.test(line);
        
        const hasHandler = hasOnClick || hasOnSelect || hasHref || hasTypeSubmit;
        const isActionable = ['Button', 'DropdownMenuItem', 'CommandItem', 'button', 'a'].includes(tag);
        
        if (isActionable && !hasHandler) {
          issues.push('missing handler/nav');
        }
        
        if (emptyOnClick || noopHandler) {
          issues.push('no-op handler');
        }
        
        if (!hasDataAction && isActionable) {
          issues.push('missing data-action');
        }
        
        // Check for API intent without endpoint
        const apiIntentMatch = line.match(/data-intent\s*=\s*["']api["']/);
        if (apiIntentMatch && !hasDataEndpoint) {
          issues.push('api intent missing endpoint');
        }
        
        if (issues.length > 0) {
          report.push({
            file: filePath,
            line: lineNum,
            tag,
            issues: issues.join(', '),
            lineContent: line.trim(),
            hasOnClick,
            hasDataAction,
            hasDataIntent
          });
        }
      }
    }
  });
}

// Analyze all files
srcFiles.forEach(analyzeFile);

// Generate reports
const jsonOutput = JSON.stringify(report, null, 2);
fs.writeFileSync('action-audit-simple.json', jsonOutput);

const markdown = [
  '# Simple Action Audit Report',
  '',
  `**Total issues found: ${report.length}**`,
  '',
  '## Summary by Issue Type',
  `- Missing handlers: ${report.filter(r => r.issues.includes('missing handler')).length}`,
  `- No-op handlers: ${report.filter(r => r.issues.includes('no-op')).length}`,
  `- Missing data-action: ${report.filter(r => r.issues.includes('missing data-action')).length}`,
  `- API intent missing endpoint: ${report.filter(r => r.issues.includes('missing endpoint')).length}`,
  '',
  '## Detailed Findings',
  '',
  '| File | Line | Tag | Issues | Has onClick | Has data-action |',
  '|------|------|-----|--------|-------------|-----------------|',
  ...report.map(r => 
    `| ${r.file} | ${r.line} | ${r.tag} | ${r.issues} | ${r.hasOnClick ? '✅' : '❌'} | ${r.hasDataAction ? '✅' : '❌'} |`
  ),
  '',
  '## Lines to Review',
  '',
  ...report.slice(0, 20).map(r => 
    `**${r.file}:${r.line}** (${r.tag}) - ${r.issues}\n\`\`\`tsx\n${r.lineContent}\n\`\`\`\n`
  ),
  ''
].join('\n');

fs.writeFileSync('action-audit-simple.md', markdown);

console.log(`✔ Generated action-audit-simple.json and action-audit-simple.md`);
console.log(`📊 Found ${report.length} total issues to review`);

if (report.length > 0) {
  console.log('\n🔴 Top 5 Issues:');
  report.slice(0, 5).forEach((r, i) => {
    console.log(`${i + 1}. ${r.file}:${r.line} - ${r.tag} (${r.issues})`);
  });
  
  console.log('\n📋 Next Steps:');
  console.log('1. Review each flagged element in the markdown report');
  console.log('2. Add missing onClick/onSelect handlers or mark as disabled');
  console.log('3. Add data-action attributes for testing/audit tracking');
  console.log('4. Run "npm run cypress:run" to test actual UI interactions');
  
  process.exit(1);
} else {
  console.log('🎉 No issues found! All UI actions appear properly wired.');
  process.exit(0);
}
