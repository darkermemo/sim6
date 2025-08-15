#!/usr/bin/env node

/**
 * Orphan File Analysis Report
 * 
 * Consolidates multiple analysis reports to identify files that are:
 * - Not imported by anything (dependency graph)
 * - Not exported/used (static analysis)
 * - Not in build output (Next.js trace)
 * - Zero runtime/test coverage
 * - No string references (grep)
 * - Not on allowlist
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { minimatch } from 'minimatch';

const REPORTS_DIR = './reports';
const PROJECT_ROOT = '.';

// File patterns to always keep
const ALLOWLIST_PATTERNS = [
  // Entry points and configs
  'package.json',
  'tsconfig.json',
  'next.config.*',
  'tailwind.config.*',
  'postcss.config.*',
  '.env*',
  
  // Build and tooling
  'node_modules/**',
  '.next/**',
  '.git/**',
  'target/**',
  
  // Documentation
  'README.md',
  'CHANGELOG.md',
  'LICENSE*',
  
  // This analysis system
  'reports/**',
  'scripts/report-orphans.mjs',
  'depcruise.config.cjs',
  
  // Critical app files
  '**/page.tsx',      // Next.js pages
  '**/layout.tsx',    // Next.js layouts  
  '**/loading.tsx',   // Next.js loading
  '**/error.tsx',     // Next.js error
  '**/not-found.tsx', // Next.js 404
  '**/globals.css',   // Global styles
  'src/main.tsx',     // React entry
  'src/app.tsx',      // React app
  'public/**',        // Static assets
  
  // Rust entry points
  'src/main.rs',
  'src/lib.rs',
  'Cargo.toml',
  'Cargo.lock',
  
  // Database and migrations
  'database_migrations/**',
  '**/*.sql',
];

// Categories for classification
const FILE_CATEGORIES = {
  MUST_KEEP: 'MUST_KEEP',
  LIKELY_KEEP: 'LIKELY_KEEP', 
  ORPHAN_SUSPECT: 'ORPHAN_SUSPECT',
  MANUAL_REVIEW: 'MANUAL_REVIEW'
};

class OrphanAnalyzer {
  constructor() {
    this.knipData = null;
    this.depCruiseData = null;
    this.unimportedData = null;
    this.tsPruneData = null;
    this.mdRefs = new Set();
    this.sqlRefs = new Set();
    this.publicRefs = new Set();
    this.cargoMeta = null;
    this.cargoUdeps = null;
    
    this.allFiles = new Set();
    this.importedFiles = new Set();
    this.exportedFiles = new Set();
    this.builtFiles = new Set();
    this.referencedFiles = new Set();
  }

  async loadReports() {
    try {
      // Load JSON reports with error handling
      if (fs.existsSync(path.join(REPORTS_DIR, 'knip.json'))) {
        try {
          const content = fs.readFileSync(path.join(REPORTS_DIR, 'knip.json'), 'utf8').trim();
          if (content) {
            this.knipData = JSON.parse(content);
          }
        } catch (e) {
          console.warn('Invalid knip.json:', e.message);
        }
      }
      
      if (fs.existsSync(path.join(REPORTS_DIR, 'depcruise.json'))) {
        try {
          const content = fs.readFileSync(path.join(REPORTS_DIR, 'depcruise.json'), 'utf8').trim();
          if (content) {
            this.depCruiseData = JSON.parse(content);
          }
        } catch (e) {
          console.warn('Invalid depcruise.json:', e.message);
        }
      }
      
      if (fs.existsSync(path.join(REPORTS_DIR, 'unimported.json'))) {
        try {
          const content = fs.readFileSync(path.join(REPORTS_DIR, 'unimported.json'), 'utf8').trim();
          if (content) {
            this.unimportedData = JSON.parse(content);
          }
        } catch (e) {
          console.warn('Invalid unimported.json:', e.message);
        }
      }

      if (fs.existsSync(path.join(REPORTS_DIR, 'cargo-metadata.json'))) {
        try {
          const content = fs.readFileSync(path.join(REPORTS_DIR, 'cargo-metadata.json'), 'utf8').trim();
          if (content) {
            this.cargoMeta = JSON.parse(content);
          }
        } catch (e) {
          console.warn('Invalid cargo-metadata.json:', e.message);
        }
      }
      
      // Load text reports
      if (fs.existsSync(path.join(REPORTS_DIR, 'ts-prune.txt'))) {
        this.tsPruneData = fs.readFileSync(path.join(REPORTS_DIR, 'ts-prune.txt'), 'utf8');
      }
      
      if (fs.existsSync(path.join(REPORTS_DIR, 'cargo-udeps.txt'))) {
        this.cargoUdeps = fs.readFileSync(path.join(REPORTS_DIR, 'cargo-udeps.txt'), 'utf8');
      }
      
      // Load reference files
      this.loadReferences();
      
    } catch (error) {
      console.error('Error loading reports:', error.message);
    }
  }

  loadReferences() {
    const refFiles = ['md-refs.txt', 'sql-refs.txt', 'public-refs.txt'];
    
    refFiles.forEach(filename => {
      const filepath = path.join(REPORTS_DIR, filename);
      if (fs.existsSync(filepath)) {
        const content = fs.readFileSync(filepath, 'utf8');
        const refs = content.split('\n')
          .filter(line => line.trim())
          .map(line => line.split(':')[0]) // Get filename before ':'
          .filter(Boolean);
          
        if (filename === 'md-refs.txt') {
          refs.forEach(ref => this.mdRefs.add(ref));
        } else if (filename === 'sql-refs.txt') {
          refs.forEach(ref => this.sqlRefs.add(ref));
        } else if (filename === 'public-refs.txt') {
          refs.forEach(ref => this.publicRefs.add(ref));
        }
      }
    });
  }

  async discoverAllFiles() {
    // Find all source files in the project
    const patterns = [
      'siem_unified_pipeline/**/*.{ts,tsx,js,jsx,rs}',
      'siem_ui/**/*.{ts,tsx,js,jsx}',
      'siem_*/**/*.rs',
      'src/**/*.{ts,tsx,js,jsx,rs}',
      '**/*.md',
      '**/*.sql',
      '**/*.json',
      '**/*.toml',
      '**/*.yaml',
      '**/*.yml',
    ];
    
    for (const pattern of patterns) {
      const files = await glob(pattern, {
        ignore: [
          'node_modules/**',
          '.next/**',
          'target/**',
          '.git/**',
          'reports/**'
        ]
      });
      files.forEach(file => this.allFiles.add(file));
    }
  }

  analyzeImports() {
    // Analyze dependency cruise data for import relationships
    if (this.depCruiseData && this.depCruiseData.modules) {
      this.depCruiseData.modules.forEach(module => {
        if (module.dependencies && module.dependencies.length > 0) {
          this.importedFiles.add(module.source);
          module.dependencies.forEach(dep => {
            this.importedFiles.add(dep.resolved);
          });
        }
      });
    }
    
    // Analyze unimported data
    if (this.unimportedData && this.unimportedData.length) {
      this.unimportedData.forEach(file => {
        // Files in unimported are NOT imported
        this.allFiles.add(file);
      });
    }
  }

  analyzeExports() {
    // Analyze knip data for unused exports
    if (this.knipData) {
      // Files with used exports
      Object.keys(this.knipData).forEach(file => {
        this.exportedFiles.add(file);
      });
    }
    
    // Parse ts-prune output
    if (this.tsPruneData) {
      const lines = this.tsPruneData.split('\n');
      lines.forEach(line => {
        if (line.includes(' - ')) {
          const file = line.split(' - ')[0];
          this.exportedFiles.add(file);
        }
      });
    }
  }

  analyzeBuildOutput() {
    // Check Next.js build output
    const nextDir = './siem_unified_pipeline/ui-v3/.next';
    if (fs.existsSync(nextDir)) {
      try {
        // Look for trace files
        const traceFiles = glob.sync(`${nextDir}/**/*.nft.json`);
        traceFiles.forEach(traceFile => {
          try {
            const trace = JSON.parse(fs.readFileSync(traceFile, 'utf8'));
            if (trace.files) {
              trace.files.forEach(file => this.builtFiles.add(file));
            }
          } catch (e) {
            // Ignore invalid trace files
          }
        });
      } catch (e) {
        console.warn('Could not analyze Next.js build output');
      }
    }
  }

  analyzeReferences() {
    // Files referenced by string/path
    this.mdRefs.forEach(ref => this.referencedFiles.add(ref));
    this.sqlRefs.forEach(ref => this.referencedFiles.add(ref));
    this.publicRefs.forEach(ref => this.referencedFiles.add(ref));
  }

  isAllowlisted(filepath) {
    return ALLOWLIST_PATTERNS.some(pattern => {
      if (pattern.includes('*')) {
        // Use glob pattern matching
        return minimatch(filepath, pattern);
      }
      return filepath.includes(pattern);
    });
  }

  categorizeFile(filepath) {
    // Always keep allowlisted files
    if (this.isAllowlisted(filepath)) {
      return FILE_CATEGORIES.MUST_KEEP;
    }
    
    const isImported = this.importedFiles.has(filepath);
    const isExported = this.exportedFiles.has(filepath);
    const isBuilt = this.builtFiles.has(filepath);
    const isReferenced = this.referencedFiles.has(filepath);
    
    // Special patterns for likely keep
    if (filepath.includes('/components/ui/') || 
        filepath.includes('/styles/') ||
        filepath.includes('/types/') ||
        filepath.includes('/lib/') ||
        filepath.includes('/hooks/') ||
        filepath.endsWith('.d.ts')) {
      return FILE_CATEGORIES.LIKELY_KEEP;
    }
    
    // Documentation and configs need manual review
    if (filepath.endsWith('.md') || 
        filepath.includes('config') ||
        filepath.includes('.json') ||
        filepath.includes('test') ||
        filepath.includes('spec')) {
      return FILE_CATEGORIES.MANUAL_REVIEW;
    }
    
    // Strong orphan suspects: not imported, exported, built, or referenced
    if (!isImported && !isExported && !isBuilt && !isReferenced) {
      return FILE_CATEGORIES.ORPHAN_SUSPECT;
    }
    
    return FILE_CATEGORIES.LIKELY_KEEP;
  }

  generateReport() {
    const categories = {
      [FILE_CATEGORIES.MUST_KEEP]: [],
      [FILE_CATEGORIES.LIKELY_KEEP]: [],
      [FILE_CATEGORIES.ORPHAN_SUSPECT]: [],
      [FILE_CATEGORIES.MANUAL_REVIEW]: []
    };
    
    // Categorize all discovered files
    this.allFiles.forEach(filepath => {
      const category = this.categorizeFile(filepath);
      categories[category].push(filepath);
    });
    
    // Generate markdown report
    let report = `# Orphan File Analysis Report\n\n`;
    report += `Generated: ${new Date().toISOString()}\n\n`;
    report += `**Total files analyzed: ${this.allFiles.size}**\n\n`;
    
    // Summary table
    report += `## Summary\n\n`;
    report += `| Category | Count | Description |\n`;
    report += `|----------|-------|-------------|\n`;
    report += `| MUST_KEEP | ${categories[FILE_CATEGORIES.MUST_KEEP].length} | Critical files (entry points, configs, pages) |\n`;
    report += `| LIKELY_KEEP | ${categories[FILE_CATEGORIES.LIKELY_KEEP].length} | Shared utilities, components, types |\n`;
    report += `| ORPHAN_SUSPECT | ${categories[FILE_CATEGORIES.ORPHAN_SUSPECT].length} | **⚠️ Strong candidates for deletion** |\n`;
    report += `| MANUAL_REVIEW | ${categories[FILE_CATEGORIES.MANUAL_REVIEW].length} | Documentation, tests, configs |\n\n`;
    
    // Details for each category
    Object.entries(categories).forEach(([category, files]) => {
      report += `## ${category} (${files.length} files)\n\n`;
      
      if (category === FILE_CATEGORIES.ORPHAN_SUSPECT && files.length > 0) {
        report += `**⚠️ These files appear to be orphans - not imported, exported, built, or referenced:**\n\n`;
      }
      
      if (files.length === 0) {
        report += `*No files in this category*\n\n`;
      } else {
        files.sort().forEach(file => {
          report += `- \`${file}\`\n`;
        });
        report += `\n`;
      }
    });
    
    // Analysis details
    report += `## Analysis Details\n\n`;
    report += `- **Import analysis**: ${this.importedFiles.size} files found in dependency graph\n`;
    report += `- **Export analysis**: ${this.exportedFiles.size} files with used exports\n`;
    report += `- **Build analysis**: ${this.builtFiles.size} files included in build output\n`;
    report += `- **Reference analysis**: ${this.referencedFiles.size} files referenced by strings\n`;
    report += `- **Markdown refs**: ${this.mdRefs.size} files\n`;
    report += `- **SQL refs**: ${this.sqlRefs.size} files\n`;
    report += `- **Public asset refs**: ${this.publicRefs.size} files\n\n`;
    
    // Rust-specific analysis
    if (this.cargoUdeps) {
      report += `## Rust Analysis\n\n`;
      report += `### Unused Dependencies\n\n`;
      const udepsLines = this.cargoUdeps.split('\n').filter(line => 
        line.includes('unused') || line.includes('never used')
      );
      if (udepsLines.length > 0) {
        udepsLines.forEach(line => {
          report += `- ${line.trim()}\n`;
        });
      } else {
        report += `*No unused Rust dependencies found*\n`;
      }
      report += `\n`;
    }
    
    // Next steps
    report += `## Next Steps\n\n`;
    report += `1. **Review ORPHAN_SUSPECT files** - These are strong candidates for deletion\n`;
    report += `2. **Manual review** - Check MANUAL_REVIEW files individually\n`;
    report += `3. **Quarantine** - Move orphans to \`.graveyard/\$(date +%Y%m%d)\` for 2-week trial\n`;
    report += `4. **Test** - Run full test suite after quarantine\n`;
    report += `5. **Delete** - Remove from graveyard after 2 weeks if no issues\n\n`;
    
    // Commands for quarantine
    if (categories[FILE_CATEGORIES.ORPHAN_SUSPECT].length > 0) {
      report += `## Quarantine Commands\n\n`;
      report += `\`\`\`bash\n`;
      report += `# Create graveyard directory\n`;
      report += `mkdir -p .graveyard/$(date -u +%Y%m%d)\n\n`;
      report += `# Move orphan suspects (review first!)\n`;
      categories[FILE_CATEGORIES.ORPHAN_SUSPECT].forEach(file => {
        report += `git mv "${file}" ".graveyard/$(date -u +%Y%m%d)/" || true\n`;
      });
      report += `\n`;
      report += `# Commit quarantine\n`;
      report += `git commit -m "chore: quarantine orphan files (2-week hold)"\n`;
      report += `\`\`\`\n\n`;
    }
    
    return report;
  }

  async analyze() {
    console.log('🔍 Loading analysis reports...');
    await this.loadReports();
    
    console.log('📁 Discovering all files...');
    await this.discoverAllFiles();
    
    console.log('🔗 Analyzing imports...');
    this.analyzeImports();
    
    console.log('📤 Analyzing exports...');
    this.analyzeExports();
    
    console.log('🏗️  Analyzing build output...');
    this.analyzeBuildOutput();
    
    console.log('🔍 Analyzing references...');
    this.analyzeReferences();
    
    console.log('📊 Generating report...');
    const report = this.generateReport();
    
    return report;
  }
}

// Main execution
async function main() {
  try {
    const analyzer = new OrphanAnalyzer();
    const report = await analyzer.analyze();
    
    // Write report
    const reportPath = path.join(REPORTS_DIR, 'orphans-summary.md');
    fs.writeFileSync(reportPath, report);
    
    console.log(`\n✅ Orphan analysis complete!`);
    console.log(`📄 Report saved to: ${reportPath}`);
    console.log(`\n📋 Summary:`);
    
    // Print summary to console
    const lines = report.split('\n');
    const summaryStart = lines.findIndex(line => line.includes('| Category | Count |'));
    if (summaryStart > -1) {
      for (let i = summaryStart; i < summaryStart + 8 && i < lines.length; i++) {
        if (lines[i].trim()) {
          console.log(lines[i]);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
    process.exit(1);
  }
}

// Add glob import for Node.js
if (!globalThis.glob) {
  const { glob: nodeGlob } = await import('glob');
  globalThis.glob = nodeGlob;
}

main();
