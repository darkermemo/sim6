#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the audit report
const auditReportPath = path.join(__dirname, 'codebase_audit_report.json');

if (!fs.existsSync(auditReportPath)) {
  console.error('Error: codebase_audit_report.json not found');
  process.exit(1);
}

const auditReport = JSON.parse(fs.readFileSync(auditReportPath, 'utf8'));

// Extract queries from all sources
const clickhouseQueries = auditReport.queries?.clickhouse_queries || [];
const generalQueries = auditReport.queries?.general_sql_patterns || [];
const allQueries = [...clickhouseQueries, ...generalQueries];

// Normalize query structure
const queries = allQueries.map(query => ({
  type: query.type || 'Unknown',
  description: query.mapped_action || query.description || 'Untitled Query',
  file: query.file || '',
  line_number: query.line || query.line_number || '',
  query: query.query || '',
  usage: query.usage || query.mapped_action || ''
}));

// Generate Markdown content
function generateMarkdown() {
  let markdown = `# SIEM Query Inventory\n\n`;
  markdown += `Generated on: ${new Date().toISOString()}\n\n`;
  markdown += `Total Queries: ${queries.length}\n\n`;
  
  // Summary by type
  const queryTypes = {};
  queries.forEach(query => {
    const type = query.type || 'Unknown';
    queryTypes[type] = (queryTypes[type] || 0) + 1;
  });
  
  markdown += `## Query Types Summary\n\n`;
  Object.entries(queryTypes).forEach(([type, count]) => {
    markdown += `- **${type}**: ${count} queries\n`;
  });
  
  markdown += `\n## Detailed Query List\n\n`;
  
  queries.forEach((query, index) => {
    markdown += `### ${index + 1}. ${query.description || 'Untitled Query'}\n\n`;
    markdown += `**Type:** ${query.type || 'Unknown'}\n\n`;
    markdown += `**File:** \`${query.file}\`\n\n`;
    if (query.line_number) {
      markdown += `**Line:** ${query.line_number}\n\n`;
    }
    markdown += `**Query:**\n\`\`\`sql\n${query.query}\n\`\`\`\n\n`;
    if (query.usage) {
      markdown += `**Usage:** ${query.usage}\n\n`;
    }
    markdown += `---\n\n`;
  });
  
  return markdown;
}

// Generate CSV content
function generateCSV() {
  const headers = ['Index', 'Type', 'Description', 'File', 'Line', 'Query', 'Usage'];
  let csv = headers.join(',') + '\n';
  
  queries.forEach((query, index) => {
    const row = [
      index + 1,
      escapeCSV(query.type || 'Unknown'),
      escapeCSV(query.description || 'Untitled Query'),
      escapeCSV(query.file || ''),
      query.line_number || '',
      escapeCSV(query.query || ''),
      escapeCSV(query.usage || '')
    ];
    csv += row.join(',') + '\n';
  });
  
  return csv;
}

// Escape CSV fields
function escapeCSV(field) {
  if (typeof field !== 'string') {
    field = String(field);
  }
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return '"' + field.replace(/"/g, '""') + '"';
  }
  return field;
}

// Write files
const markdownContent = generateMarkdown();
const csvContent = generateCSV();

const markdownPath = path.join(__dirname, 'query_inventory.md');
const csvPath = path.join(__dirname, 'query_inventory.csv');

fs.writeFileSync(markdownPath, markdownContent, 'utf8');
fs.writeFileSync(csvPath, csvContent, 'utf8');

console.log(`✅ Query inventory exported successfully:`);
console.log(`📄 Markdown: ${markdownPath}`);
console.log(`📊 CSV: ${csvPath}`);
console.log(`📈 Total queries: ${queries.length}`);