#!/usr/bin/env python3
"""
Rust API Route Extractor
Automatically extracts all /api/v1/* routes from Rust source files
Supports Actix-web and Axum route patterns
"""

import os
import re
import json
from pathlib import Path
from typing import List, Dict, Any

# Regex patterns for different routing frameworks
route_patterns = [
    # Actix-web style: #[get("/api/v1/alerts")]
    re.compile(r'#\[(get|post|put|delete|patch|head|options)\("(/api/v1/[^"]+)"\)'),
    # Axum style: .route("/api/v1/alerts", get(handler))
    re.compile(r'\.route\("(/api/v1/[^"]+)",\s*(get|post|put|delete|patch|head|options)\('),
    # Alternative Axum: Router::new().route("/api/v1/alerts", get(handler))
    re.compile(r'Router::new\(\)\.route\("(/api/v1/[^"]+)",\s*(get|post|put|delete|patch|head|options)\('),
    # Axum chained routes: .route("/health", get(health_check))
    re.compile(r'\.route\("(/[^"]*)",\s*(get|post|put|delete|patch|head|options)\(([^)]+)\)'),
    # Direct route definitions: get("/api/v1/alerts")
    re.compile(r'(get|post|put|delete|patch|head|options)\("(/api/v1/[^"]+)"\)'),
    # Manual route definitions
    re.compile(r'Route::new\("(/api/v1/[^"]+)"\)\.(get|post|put|delete|patch|head|options)\(')
]

# Function name extraction
function_regex = re.compile(r'async fn (\w+)\s*\(')
handler_regex = re.compile(r'(\w+)\s*\)')

def extract_handler_name(lines: List[str], line_index: int, content: str) -> str:
    """Extract handler function name from context"""
    # Look for function definition in next few lines (Actix-web style)
    for j in range(line_index + 1, min(line_index + 10, len(lines))):
        func_match = function_regex.search(lines[j])
        if func_match:
            return func_match.group(1)
    
    # Look for handler in the same line (Axum style)
    current_line = lines[line_index] if line_index < len(lines) else ""
    handler_match = handler_regex.search(current_line)
    if handler_match:
        return handler_match.group(1)
    
    return "unknown"

def get_context_lines(lines: List[str], line_index: int, context_size: int = 2) -> List[str]:
    """Get context lines around the matched line"""
    start = max(0, line_index - context_size)
    end = min(len(lines), line_index + context_size + 1)
    return [line.strip() for line in lines[start:end]]

def extract_routes_from_file(file_path: Path) -> List[Dict[str, Any]]:
    """Extract API routes from a single Rust file"""
    routes = []
    
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
            lines = content.split('\n')
    except Exception as e:
        print(f"Warning: Could not read {file_path}: {e}")
        return routes

    for i, line in enumerate(lines):
        for pattern in route_patterns:
            matches = pattern.finditer(line)
            for match in matches:
                groups = match.groups()
                
                # Handle different pattern formats
                method = None
                path = None
                handler = None
                
                if len(groups) >= 2:
                    # Determine if first group is method or path
                    if groups[0].lower() in ['get', 'post', 'put', 'delete', 'patch', 'head', 'options']:
                        # Pattern: method, path, [handler]
                        method = groups[0]
                        path = groups[1]
                        if len(groups) > 2:
                            handler = groups[2]
                    elif groups[0].startswith('/'):
                        # Pattern: path, method, [handler]
                        path = groups[0]
                        method = groups[1]
                        if len(groups) > 2:
                            handler = groups[2]
                    
                    # Only include /api/v1/* routes or other interesting routes
                    if path and (path.startswith('/api/v1/') or path in ['/health', '/metrics']):
                        # Extract handler function name if not already found
                        if not handler:
                            handler = extract_handler_name(lines, i, content)
                        
                        try:
                            relative_path = str(file_path.relative_to(Path.cwd()))
                        except ValueError:
                            relative_path = str(file_path)
                        
                        route = {
                            "method": method.upper() if method else "UNKNOWN",
                            "path": path,
                            "handler": handler or "unknown",
                            "file": relative_path,
                            "line": i + 1,
                            "context": get_context_lines(lines, i)
                        }
                        
                        routes.append(route)

    return routes

def scan_rust_project(project_dir: Path = Path(".")) -> List[Dict[str, Any]]:
    """Scan entire Rust project for API routes"""
    all_routes = []
    
    # Look in common Rust project directories
    rust_dirs = [
        project_dir / "src",
        project_dir / "siem_clickhouse_ingestion" / "src",
        project_dir / "siem_rule_engine" / "src",
        project_dir / "siem_unified_pipeline" / "src",
        project_dir / "siem_consumer" / "src",
        project_dir / "siem_backup_manager" / "src",
        project_dir / "siem_threat_intel" / "src",
        project_dir / "siem_ueba_modeler" / "src",
        project_dir / "siem_data_pruner" / "src",
        project_dir / "siem_tools" / "src"
    ]
    
    for rust_dir in rust_dirs:
        if rust_dir.exists():
            print(f"Scanning {rust_dir}...")
            for file_path in rust_dir.rglob("*.rs"):
                routes = extract_routes_from_file(file_path)
                all_routes.extend(routes)
    
    return all_routes

def analyze_route_handlers(routes: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Analyze route handlers for response patterns"""
    analysis = {
        "total_routes": len(routes),
        "methods": {},
        "paths": {},
        "handlers": {},
        "files": {}
    }
    
    for route in routes:
        # Count by method
        method = route["method"]
        analysis["methods"][method] = analysis["methods"].get(method, 0) + 1
        
        # Count by path pattern
        path = route["path"]
        analysis["paths"][path] = analysis["paths"].get(path, 0) + 1
        
        # Count by handler
        handler = route["handler"]
        analysis["handlers"][handler] = analysis["handlers"].get(handler, 0) + 1
        
        # Count by file
        file = route["file"]
        analysis["files"][file] = analysis["files"].get(file, 0) + 1
    
    return analysis

def main():
    """Main execution function"""
    print("🔍 Scanning Rust project for /api/v1/* routes...\n")
    
    # Extract all routes
    routes = scan_rust_project()
    
    if not routes:
        print("❌ No /api/v1/* routes found in Rust source files.")
        return
    
    # Sort routes by path for better readability
    routes.sort(key=lambda x: (x["path"], x["method"]))
    
    print(f"\n[🧩 Extracted {len(routes)} Rust API Routes]")
    print("=" * 80)
    
    for route in routes:
        print(f'{route["method"]:6} {route["path"]:30} -> {route["handler"]:20} [{route["file"]}:{route["line"]}]')
    
    # Generate analysis
    analysis = analyze_route_handlers(routes)
    
    print("\n[📊 Route Analysis]")
    print("=" * 40)
    print(f"Total routes: {analysis['total_routes']}")
    print(f"HTTP methods: {', '.join(f'{k}({v})' for k, v in analysis['methods'].items())}")
    print(f"Unique handlers: {len(analysis['handlers'])}")
    print(f"Source files: {len(analysis['files'])}")
    
    # Save results to JSON
    output_data = {
        "routes": routes,
        "analysis": analysis,
        "generated_at": str(Path.cwd()),
        "scan_timestamp": "auto-generated"
    }
    
    output_file = Path("rust_api_routes.json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ Results saved to {output_file}")
    print(f"\n💡 Next step: Run the frontend scanner to map these routes to UI components.")

if __name__ == "__main__":
    main()