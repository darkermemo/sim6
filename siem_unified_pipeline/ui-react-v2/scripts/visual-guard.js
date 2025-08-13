#!/usr/bin/env node

/**
 * Visual Guard - Ensures only visual changes are made during theme migration
 * 
 * This script checks git diff to ensure only approved file types and changes
 * are allowed during visual refresh. Prevents logic changes that could break
 * functionality.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

const ALLOWED_EXTENSIONS = [
  '.css',
  '.scss', 
  '.less',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.ico'
];

const ALLOWED_TSX_CHANGES = [
  'className',
  'style',
  'data-testid',
  'data-',
  'aria-',
  'role'
];

function getGitDiff() {
  try {
    return execSync('git diff --name-only HEAD~1 HEAD', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  } catch (error) {
    console.log('No git diff available (new branch or no commits), checking staged files...');
    try {
      return execSync('git diff --staged --name-only', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    } catch {
      console.log('No staged files, checking all modified files...');
      return execSync('git status --porcelain', { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => line.slice(3)); // Remove git status prefix
    }
  }
}

function isAllowedFile(filePath) {
  const ext = path.extname(filePath);
  return ALLOWED_EXTENSIONS.includes(ext);
}

function checkTsxChanges(filePath) {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) {
    return { valid: true, errors: [] };
  }

  try {
    const diff = execSync(`git diff HEAD~1 HEAD "${filePath}"`, { encoding: 'utf8' });
    const errors = [];

    // Check for dangerous patterns in additions
    const addedLines = diff
      .split('\n')
      .filter(line => line.startsWith('+') && !line.startsWith('+++'))
      .map(line => line.slice(1));

    for (const line of addedLines) {
      // Skip comments and whitespace
      if (line.trim().startsWith('//') || line.trim().startsWith('/*') || !line.trim()) {
        continue;
      }

      // Check for prop changes (dangerous)
      if (line.includes('props.') || line.includes('useState') || line.includes('useEffect')) {
        errors.push(`Potential logic change detected: ${line.trim()}`);
      }

      // Check for API calls or hooks
      if (line.includes('fetch(') || line.includes('axios') || line.includes('useSWR') || line.includes('useQuery')) {
        errors.push(`API/data fetching change detected: ${line.trim()}`);
      }

      // Check for route changes
      if (line.includes('Route ') || line.includes('Navigate') || line.includes('useNavigate')) {
        errors.push(`Routing change detected: ${line.trim()}`);
      }

      // Allow only specific attribute changes
      const hasAllowedChange = ALLOWED_TSX_CHANGES.some(allowed => 
        line.includes(`${allowed}=`) || 
        line.includes(`${allowed}:`) ||
        line.includes(`${allowed} `)
      );

      // If it's a JSX attribute change but not in allowed list
      if (line.includes('=') && line.includes('"') && !hasAllowedChange) {
        // Check if it's an import or type definition (allowed)
        if (!line.includes('import ') && !line.includes('interface ') && !line.includes('type ')) {
          errors.push(`Non-visual JSX change detected: ${line.trim()}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  } catch (error) {
    // File might be new or deleted
    console.log(`Could not check ${filePath}: ${error.message}`);
    return { valid: true, errors: [] };
  }
}

function main() {
  console.log('🛡️  Visual Guard - Checking for non-visual changes...\n');

  const changedFiles = getGitDiff();
  
  if (changedFiles.length === 0) {
    console.log('✅ No changed files to check');
    return;
  }

  console.log('Changed files:');
  changedFiles.forEach(file => console.log(`  - ${file}`));
  console.log('');

  let hasErrors = false;
  const errors = [];

  for (const file of changedFiles) {
    // Skip allowed file types
    if (isAllowedFile(file)) {
      console.log(`✅ ${file} (visual file)`);
      continue;
    }

    // Check TypeScript/React files for dangerous changes
    if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      const result = checkTsxChanges(file);
      
      if (result.valid) {
        console.log(`✅ ${file} (visual changes only)`);
      } else {
        console.log(`❌ ${file} (non-visual changes detected)`);
        hasErrors = true;
        errors.push(...result.errors.map(err => `  ${file}: ${err}`));
      }
      continue;
    }

    // Check for other file types that might be problematic
    if (file.includes('package.json') || file.includes('package-lock.json')) {
      console.log(`⚠️  ${file} (dependency change - review required)`);
      continue;
    }

    if (file.includes('.config.') || file.includes('vite.config') || file.includes('tsconfig')) {
      console.log(`⚠️  ${file} (config change - review required)`);
      continue;
    }

    // Unknown file type
    console.log(`⚠️  ${file} (unknown file type - review required)`);
  }

  if (hasErrors) {
    console.log('\n❌ Visual Guard Failed! Non-visual changes detected:');
    errors.forEach(error => console.log(error));
    console.log('\nOnly visual changes are allowed during theme migration.');
    console.log('Allowed changes in .tsx files:');
    ALLOWED_TSX_CHANGES.forEach(change => console.log(`  - ${change}`));
    process.exit(1);
  }

  console.log('\n✅ Visual Guard Passed! All changes appear to be visual-only.');
}

main();
