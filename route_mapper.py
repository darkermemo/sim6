#!/usr/bin/env python3
"""
API Route Mapper
Combines Rust backend route extraction with frontend usage analysis
Generates comprehensive API mapping report with coverage analysis
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional

class APIRouteMapper:
    def __init__(self, project_root: str = "."):
        self.project_root = Path(project_root)
        self.backend_routes = []
        self.frontend_usage = {}
        self.combined_analysis = {}
        
    def extract_rust_routes(self) -> List[Dict[str, Any]]:
        """
        Extract API routes from Rust backend code
        """
        print("🔍 Extracting Rust API routes...")
        
        try:
            # Run the Rust route extractor
            result = subprocess.run(
                [sys.executable, "rust_route_extractor.py"],
                cwd=self.project_root,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                # Load the generated JSON file
                routes_file = self.project_root / "rust_routes.json"
                if routes_file.exists():
                    with open(routes_file, 'r') as f:
                        data = json.load(f)
                        self.backend_routes = data.get('routes', [])
                        print(f"✅ Found {len(self.backend_routes)} backend routes")
                else:
                    print("⚠️  rust_routes.json not found, running extractor inline...")
                    self._extract_routes_inline()
            else:
                print(f"⚠️  Rust extractor failed: {result.stderr}")
                self._extract_routes_inline()
                
        except Exception as e:
            print(f"⚠️  Error running Rust extractor: {e}")
            self._extract_routes_inline()
            
        return self.backend_routes
    
    def _extract_routes_inline(self):
        """
        Fallback inline route extraction
        """
        import re
        
        route_regex = re.compile(r'#\[(get|post|put|delete|patch)\("(/api/v1/[^\"]+)"')
        function_regex = re.compile(r'async fn (\w+)\s*\(')
        
        for file_path in self.project_root.rglob("*.rs"):
            try:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    lines = f.readlines()
                
                for i, line in enumerate(lines):
                    match = route_regex.search(line)
                    if match:
                        method, path = match.groups()
                        handler = "unknown"
                        
                        # Look for function name in next few lines
                        for j in range(i + 1, min(i + 10, len(lines))):
                            func_match = function_regex.search(lines[j])
                            if func_match:
                                handler = func_match.group(1)
                                break
                        
                        self.backend_routes.append({
                            "method": method.upper(),
                            "path": path,
                            "handler": handler,
                            "file": str(file_path.relative_to(self.project_root)),
                            "line": i + 1,
                        })
            except Exception as e:
                continue
    
    def extract_frontend_usage(self) -> Dict[str, Any]:
        """
        Extract frontend API usage
        """
        print("🔍 Extracting frontend API usage...")
        
        try:
            # Run the frontend scanner
            result = subprocess.run(
                ["node", "frontend_api_scanner.js"],
                cwd=self.project_root,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                # Load the generated JSON file
                usage_file = self.project_root / "frontend_api_usage.json"
                if usage_file.exists():
                    with open(usage_file, 'r') as f:
                        self.frontend_usage = json.load(f)
                        endpoint_count = len(self.frontend_usage.get('endpoints', {}))
                        print(f"✅ Found {endpoint_count} frontend API usages")
                else:
                    print("⚠️  frontend_api_usage.json not found")
            else:
                print(f"⚠️  Frontend scanner failed: {result.stderr}")
                
        except Exception as e:
            print(f"⚠️  Error running frontend scanner: {e}")
            
        return self.frontend_usage
    
    def analyze_coverage(self) -> Dict[str, Any]:
        """
        Analyze API coverage between backend and frontend
        """
        print("📊 Analyzing API coverage...")
        
        backend_paths = {route['path'] for route in self.backend_routes}
        frontend_paths = set(self.frontend_usage.get('endpoints', {}).keys())
        
        # Normalize paths for comparison (handle dynamic segments)
        def normalize_path(path: str) -> str:
            # Convert {id} to :id for comparison
            import re
            return re.sub(r'\{([^}]+)\}', r':\1', path)
        
        normalized_backend = {normalize_path(path): path for path in backend_paths}
        normalized_frontend = {normalize_path(path): path for path in frontend_paths}
        
        # Find matches, missing, and orphaned endpoints
        matched = set(normalized_backend.keys()) & set(normalized_frontend.keys())
        backend_only = set(normalized_backend.keys()) - set(normalized_frontend.keys())
        frontend_only = set(normalized_frontend.keys()) - set(normalized_backend.keys())
        
        coverage_analysis = {
            "total_backend_routes": len(backend_paths),
            "total_frontend_usage": len(frontend_paths),
            "matched_endpoints": len(matched),
            "coverage_percentage": (len(matched) / len(backend_paths) * 100) if backend_paths else 0,
            "matched": list(matched),
            "backend_only": list(backend_only),
            "frontend_only": list(frontend_only)
        }
        
        return coverage_analysis
    
    def generate_route_details(self) -> List[Dict[str, Any]]:
        """
        Generate detailed route information combining backend and frontend data
        """
        route_details = []
        
        for route in self.backend_routes:
            path = route['path']
            
            # Find corresponding frontend usage
            frontend_data = self.frontend_usage.get('endpoints', {}).get(path, [])
            
            detail = {
                "path": path,
                "method": route['method'],
                "handler": route['handler'],
                "backend_file": route['file'],
                "backend_line": route['line'],
                "frontend_usage": frontend_data,
                "is_used_in_frontend": len(frontend_data) > 0,
                "usage_count": len(frontend_data),
                "used_in_components": len([u for u in frontend_data if u.get('type') == 'component']),
                "used_in_hooks": len([u for u in frontend_data if u.get('type') == 'hook']),
                "used_in_services": len([u for u in frontend_data if u.get('type') == 'service'])
            }
            
            route_details.append(detail)
        
        return route_details
    
    def generate_comprehensive_report(self) -> Dict[str, Any]:
        """
        Generate comprehensive API mapping report
        """
        coverage = self.analyze_coverage()
        route_details = self.generate_route_details()
        
        # Find orphaned frontend endpoints
        orphaned_endpoints = []
        for endpoint in self.frontend_usage.get('endpoints', {}):
            if not any(route['path'] == endpoint for route in self.backend_routes):
                orphaned_endpoints.append({
                    "path": endpoint,
                    "usage": self.frontend_usage['endpoints'][endpoint]
                })
        
        report = {
            "metadata": {
                "generated_at": __import__('datetime').datetime.now().isoformat(),
                "project_root": str(self.project_root),
                "backend_routes_count": len(self.backend_routes),
                "frontend_endpoints_count": len(self.frontend_usage.get('endpoints', {}))
            },
            "coverage_analysis": coverage,
            "route_details": route_details,
            "orphaned_frontend_endpoints": orphaned_endpoints,
            "backend_routes": self.backend_routes,
            "frontend_usage": self.frontend_usage
        }
        
        return report
    
    def load_backend_routes(self, file_path: str):
        """
        Load backend routes from external JSON file
        """
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
                self.backend_routes = data.get('routes', []) if isinstance(data, dict) else data
                print(f"✅ Loaded {len(self.backend_routes)} backend routes from {file_path}")
        except Exception as e:
            print(f"❌ Failed to load backend routes from {file_path}: {e}")
            sys.exit(1)
    
    def load_frontend_usage(self, file_path: str):
        """
        Load frontend usage from external JSON file
        """
        try:
            with open(file_path, 'r') as f:
                self.frontend_usage = json.load(f)
                endpoint_count = len(self.frontend_usage.get('endpoints', []))
                print(f"✅ Loaded {endpoint_count} frontend endpoints from {file_path}")
        except Exception as e:
            print(f"❌ Failed to load frontend usage from {file_path}: {e}")
            sys.exit(1)
    
    def print_summary(self, report: Dict[str, Any]):
        """
        Print a formatted summary of the analysis
        """
        print("\n" + "=" * 80)
        print("🎯 API ROUTE MAPPING SUMMARY")
        print("=" * 80)
        
        coverage = report['coverage_analysis']
        print(f"\n📊 Coverage Statistics:")
        print(f"   Backend routes: {coverage['total_backend_routes']}")
        print(f"   Frontend usage: {coverage['total_frontend_usage']}")
        print(f"   Matched endpoints: {coverage['matched_endpoints']}")
        print(f"   Coverage: {coverage['coverage_percentage']:.1f}%")
        
        print(f"\n✅ Matched Endpoints ({len(coverage['matched'])}):")
        for endpoint in sorted(coverage['matched']):
            print(f"   ✓ {endpoint}")
        
        if coverage['backend_only']:
            print(f"\n🔴 Backend-only endpoints ({len(coverage['backend_only'])}):")
            for endpoint in sorted(coverage['backend_only']):
                print(f"   ⚠️  {endpoint} (not used in frontend)")
        
        if coverage['frontend_only']:
            print(f"\n🟡 Frontend-only endpoints ({len(coverage['frontend_only'])}):")
            for endpoint in sorted(coverage['frontend_only']):
                print(f"   ❓ {endpoint} (no backend implementation found)")
        
        # Show most used endpoints
        route_details = report['route_details']
        used_routes = [r for r in route_details if r['is_used_in_frontend']]
        if used_routes:
            used_routes.sort(key=lambda x: x['usage_count'], reverse=True)
            print(f"\n🔥 Most Used Endpoints:")
            for route in used_routes[:5]:
                print(f"   {route['usage_count']}x {route['method']} {route['path']}")
    
    def save_report(self, report: Dict[str, Any], filename: str = "api_route_map.json"):
        """
        Save the comprehensive report to JSON file
        """
        output_path = self.project_root / filename
        with open(output_path, 'w') as f:
            json.dump(report, f, indent=2, default=str)
        
        print(f"\n💾 Comprehensive API mapping saved to {output_path}")
    
    def run_full_analysis(self):
        """
        Run the complete API mapping analysis
        """
        print("🚀 Starting comprehensive API route mapping...\n")
        
        # Extract data from both backend and frontend
        self.extract_rust_routes()
        self.extract_frontend_usage()
        
        # Generate comprehensive report
        report = self.generate_comprehensive_report()
        
        # Display results
        self.print_summary(report)
        
        # Save to file
        self.save_report(report)
        
        print("\n✨ API route mapping analysis complete!")
        print("\n💡 Next steps:")
        print("   1. Review orphaned frontend endpoints")
        print("   2. Implement missing backend routes")
        print("   3. Add frontend usage for unused backend routes")
        print("   4. Consider generating a dashboard to visualize this data")
        
        return report

def main():
    """
    Main execution function with command line argument support
    """
    parser = argparse.ArgumentParser(description='API Route Mapper - Analyze backend/frontend API alignment')
    parser.add_argument('--backend', help='Path to backend routes JSON file')
    parser.add_argument('--frontend', help='Path to frontend endpoints JSON file')
    parser.add_argument('--fail-unmatched', action='store_true', help='Exit with error code if unmatched routes found')
    parser.add_argument('--out', help='Output file path for the mapping report')
    
    args = parser.parse_args()
    
    mapper = APIRouteMapper()
    
    # Load external files if provided
    if args.backend:
        mapper.load_backend_routes(args.backend)
    else:
        mapper.extract_rust_routes()
        
    if args.frontend:
        mapper.load_frontend_usage(args.frontend)
    else:
        mapper.extract_frontend_usage()
    
    # Generate comprehensive report
    report = mapper.generate_comprehensive_report()
    
    # Display results
    mapper.print_summary(report)
    
    # Save to file
    output_file = args.out if args.out else "api_route_map.json"
    mapper.save_report(report, output_file)
    
    # Check for unmatched routes if --fail-unmatched is set
    if args.fail_unmatched:
        coverage = report.get('coverage_analysis', {})
        orphaned_frontend = coverage.get('frontend_only', [])
        unused_backend = coverage.get('backend_only', [])
        
        if orphaned_frontend or unused_backend:
            print(f"\n❌ API contract validation failed:")
            if orphaned_frontend:
                print(f"   - {len(orphaned_frontend)} orphaned frontend endpoints")
            if unused_backend:
                print(f"   - {len(unused_backend)} unused backend routes")
            sys.exit(1)
    
    print("\n✨ API route mapping analysis complete!")
    if not args.fail_unmatched:
        print("\n💡 Next steps:")
        print("   1. Review orphaned frontend endpoints")
        print("   2. Implement missing backend routes")
        print("   3. Add frontend usage for unused backend routes")
        print("   4. Consider generating a dashboard to visualize this data")

if __name__ == "__main__":
    main()