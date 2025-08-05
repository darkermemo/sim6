#!/usr/bin/env bash
# Report assembler for SIEM full-stack health reporting
# Generates comprehensive HTML and PDF reports from audit results

set -eu
OUT=target/audit

# Colors for output
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
BLUE='\033[34m'
RESET='\033[0m'

# Function to log messages
log_info() {
    echo -e "${BLUE}[REPORT]${RESET} $1"
}

log_success() {
    echo -e "${GREEN}[REPORT]${RESET} $1"
}

log_warning() {
    echo -e "${YELLOW}[REPORT]${RESET} $1"
}

log_error() {
    echo -e "${RED}[REPORT]${RESET} $1" >&2
}

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

log_info "Generating SIEM full-stack health report..."

# Run deep audit first
log_info "Running deep audit..."
scripts/deep_audit.sh

# Function to safely read file content with fallback
safe_cat() {
    local file="$1"
    local fallback="${2:-File not found or empty}"
    
    if [[ -f "$file" ]] && [[ -s "$file" ]]; then
        cat "$file"
    else
        echo "$fallback"
    fi
}

# Function to get file status emoji
get_status_emoji() {
    local file="$1"
    
    if [[ ! -f "$file" ]]; then
        echo "❌"
    elif [[ -s "$file" ]] && grep -q -i "error\|fail\|warning" "$file" 2>/dev/null; then
        echo "⚠️"
    else
        echo "✅"
    fi
}

# Function to truncate content if too long
truncate_content() {
    local content="$1"
    local max_lines="${2:-100}"
    
    echo "$content" | head -n "$max_lines"
    local line_count
    line_count=$(echo "$content" | wc -l)
    
    if [[ "$line_count" -gt "$max_lines" ]]; then
        echo ""
        echo "... (truncated, showing first $max_lines of $line_count lines)"
    fi
}

# Generate the main report
log_info "Assembling report content..."
cat >$OUT/report.md <<EOF
# 🛡️ SIEM Full-Stack Health Report

**Generated:** $(date)  
**Project:** SIEM Security Platform  
**Audit Location:** \`$OUT\`

## 📊 Executive Summary

| Component | Status | Details |
|-----------|--------|----------|
| Rust Code Quality | $(get_status_emoji "$OUT/clippy.txt") | Clippy linting results |
| Test Coverage | $(get_status_emoji "$OUT/test.txt") | Unit and integration tests |
| Security Audit | $(get_status_emoji "$OUT/audit.txt") | Vulnerability scanning |
| Dependencies | $(get_status_emoji "$OUT/udeps.txt") | Unused dependency check |
| Vector Config | $(get_status_emoji "$OUT/vector.txt") | Log pipeline validation |
| Kafka Integration | $(get_status_emoji "$OUT/kafka.txt") | Message queue connectivity |
| ClickHouse Schema | $(get_status_emoji "$OUT/ch_indices.txt") | Database index optimization |
| OpenAPI Spec | $(get_status_emoji "$OUT/openapi.txt") | API contract validation |
| Frontend Quality | $(get_status_emoji "$OUT/frontend_lint.txt") | UI code quality |

---

## 🦀 Rust Code Quality

### Clippy Linting Results
\`\`\`
$(safe_cat "$OUT/clippy.txt" "No clippy output available" | truncate_content)
\`\`\`

### Unsafe Code Analysis
\`\`\`
$(safe_cat "$OUT/unsafe.txt" "No unsafe code analysis available" | truncate_content)
\`\`\`

---

## 🧪 Test Results

### Unit and Integration Tests
\`\`\`
$(safe_cat "$OUT/test.txt" "No test output available" | truncate_content)
\`\`\`

---

## 🔒 Security Analysis

### Vulnerability Audit
\`\`\`
$(safe_cat "$OUT/audit.txt" "No security audit results available" | truncate_content)
\`\`\`

### Unused Dependencies
\`\`\`
$(safe_cat "$OUT/udeps.txt" "No unused dependency analysis available" | truncate_content)
\`\`\`

---

## 🚰 Data Pipeline Health

### Vector Configuration Validation
\`\`\`
$(safe_cat "$OUT/vector.txt" "No Vector validation results available" | truncate_content)
\`\`\`

### Kafka Connectivity
\`\`\`
$(safe_cat "$OUT/kafka.txt" "No Kafka connectivity test results available" | truncate_content)
\`\`\`

---

## 🗄️ Database Health

### ClickHouse Indices
\`\`\`
$(safe_cat "$OUT/ch_indices.txt" "No ClickHouse index information available" | truncate_content)
\`\`\`

---

## 🌐 API & Frontend

### OpenAPI Specification Validation
\`\`\`
$(safe_cat "$OUT/openapi.txt" "No OpenAPI validation results available" | truncate_content)
\`\`\`

### Frontend Code Quality
\`\`\`
$(safe_cat "$OUT/frontend_lint.txt" "No frontend linting results available" | truncate_content)
\`\`\`

### TypeScript Type Checking
\`\`\`
$(safe_cat "$OUT/frontend_typecheck.txt" "No TypeScript checking results available" | truncate_content)
\`\`\`

---

## 📈 Architecture Visualization

EOF

# Add image references if files exist
if [[ -f "$OUT/crate-graph.png" ]]; then
    echo "### Crate Dependency Graph" >>$OUT/report.md
    echo "![Crate Dependency Graph](crate-graph.png)" >>$OUT/report.md
    echo "" >>$OUT/report.md
fi

if [[ -f "$OUT/handlers-tree.png" ]]; then
    echo "### Handlers Module Tree" >>$OUT/report.md
    echo "![Handlers Module Tree](handlers-tree.png)" >>$OUT/report.md
    echo "" >>$OUT/report.md
fi

# Add footer
cat >>$OUT/report.md <<EOF

---

## 📋 Audit Artifacts

All detailed audit results are available in the following files:

- \`clippy.txt\` - Rust code linting results
- \`test.txt\` - Test execution results
- \`audit.txt\` - Security vulnerability scan
- \`udeps.txt\` - Unused dependency analysis
- \`unsafe.txt\` - Unsafe code usage report
- \`vector.txt\` - Vector configuration validation
- \`kafka.txt\` - Kafka connectivity test
- \`ch_indices.txt\` - ClickHouse index information
- \`openapi.txt\` - OpenAPI specification validation
- \`frontend_lint.txt\` - Frontend linting results
- \`frontend_typecheck.txt\` - TypeScript type checking
- \`crate-graph.png\` - Visual dependency graph
- \`handlers-tree.png\` - Module structure visualization

**Report generated by:** SIEM Deep Audit System  
**Timestamp:** $(date -u '+%Y-%m-%d %H:%M:%S UTC')
EOF

log_success "Report content generated"

# Generate HTML version
log_info "Converting to HTML..."
if command -v pandoc >/dev/null 2>&1; then
    pandoc $OUT/report.md -o $OUT/report.html \
        --standalone \
        --css=<(echo "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; } pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; } table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #ddd; padding: 8px; text-align: left; } th { background-color: #f2f2f2; }") \
        --metadata title="SIEM Full-Stack Health Report" 2>/dev/null || {
        log_warning "Failed to generate HTML with pandoc, creating basic HTML"
        
        # Fallback: create basic HTML
        cat >$OUT/report.html <<HTML_EOF
<!DOCTYPE html>
<html>
<head>
    <title>SIEM Full-Stack Health Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
        pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .status-ok { color: green; }
        .status-warning { color: orange; }
        .status-error { color: red; }
    </style>
</head>
<body>
    <h1>🛡️ SIEM Full-Stack Health Report</h1>
    <p><strong>Generated:</strong> $(date)</p>
    <p><strong>Status:</strong> Report generated successfully</p>
    <p>For detailed results, please check the individual audit files in the target/audit directory.</p>
</body>
</html>
HTML_EOF
    }
    log_success "HTML report generated: $OUT/report.html"
else
    log_warning "pandoc not installed - skipping HTML generation (install with: brew install pandoc)"
fi

# Display report content
log_info "\n📋 SIEM Full-Stack Health Report:\n"
echo "==========================================="
cat $OUT/report.md
echo "\n==========================================="
log_success "Report content displayed above and saved to $OUT/report.html"

# Generate JSON summary for CI
log_info "Generating JSON summary..."
cat >$OUT/summary.json <<JSON_EOF
{
  "timestamp": "$(date -u '+%Y-%m-%d %H:%M:%S UTC')",
  "project": "SIEM Security Platform",
  "audit_location": "$OUT",
  "components": {
    "rust_quality": {
      "status": "$(if [[ -f "$OUT/clippy.txt" ]] && ! grep -q -i "error" "$OUT/clippy.txt" 2>/dev/null; then echo "pass"; else echo "warning"; fi)",
      "file": "clippy.txt"
    },
    "tests": {
      "status": "$(if [[ -f "$OUT/test.txt" ]] && ! grep -q -i "failed" "$OUT/test.txt" 2>/dev/null; then echo "pass"; else echo "warning"; fi)",
      "file": "test.txt"
    },
    "security": {
      "status": "$(if [[ -f "$OUT/audit.txt" ]] && ! grep -q -i "vulnerability" "$OUT/audit.txt" 2>/dev/null; then echo "pass"; else echo "warning"; fi)",
      "file": "audit.txt"
    },
    "dependencies": {
      "status": "$(if [[ -f "$OUT/udeps.txt" ]] && ! grep -q -i "unused" "$OUT/udeps.txt" 2>/dev/null; then echo "pass"; else echo "info"; fi)",
      "file": "udeps.txt"
    }
  },
  "artifacts": {
    "markdown": "report.md",
    "html": "$(if [[ -f "$OUT/report.html" ]]; then echo "report.html"; else echo "null"; fi)",
    "pdf": "$(if [[ -f "$OUT/siem_full_report.pdf" ]]; then echo "siem_full_report.pdf"; else echo "null"; fi)"
  }
}
JSON_EOF

log_success "JSON summary generated: $OUT/summary.json"

# Final summary
log_success "🎉 SIEM health report generation completed!"
log_info "📁 All artifacts available in: $OUT/"
log_info "📋 Markdown report: $OUT/report.md"
if [[ -f "$OUT/report.html" ]]; then
    log_info "🌐 HTML report: $OUT/report.html"
fi
if [[ -f "$OUT/siem_full_report.pdf" ]]; then
    log_info "📄 PDF report: $OUT/siem_full_report.pdf"
fi
log_info "📊 JSON summary: $OUT/summary.json"