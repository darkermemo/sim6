#!/usr/bin/env python3
"""
Backend probe: calls every /api/v1/* route defined in rust_api_routes.json.
Prints PASS/FAIL with status code and short body.
"""
import json
import requests
import os
import sys
import time

BASE = "http://127.0.0.1:8080"  # Updated to match current backend port

# Load routes from rust_api_routes.json if it exists
try:
    with open("rust_api_routes.json") as f:
        routes = json.load(f)["routes"]
except FileNotFoundError:
    print("rust_api_routes.json not found, using basic route set")
    # Basic route set for testing
    routes = [
        {"method": "GET", "path": "/health"},
        {"method": "GET", "path": "/metrics"},
        {"method": "GET", "path": "/api/v1/version"},
        {"method": "POST", "path": "/api/v1/auth/login"},
        {"method": "GET", "path": "/api/v1/dashboard"},
        {"method": "GET", "path": "/api/v1/tenants"},
        {"method": "GET", "path": "/api/v1/events/search"},
        {"method": "GET", "path": "/api/v1/log-sources"},
        {"method": "GET", "path": "/api/v1/alerts"},
        {"method": "GET", "path": "/api/v1/rules"},
        {"method": "GET", "path": "/api/v1/cases"},
        {"method": "GET", "path": "/api/v1/agents"},
        {"method": "GET", "path": "/api/v1/admin/users"},
        {"method": "GET", "path": "/api/v1/fields/values"},
        {"method": "GET", "path": "/api/v1/taxonomy/mappings"},
        {"method": "GET", "path": "/api/v1/assets"},
        {"method": "GET", "path": "/api/v1/parsers"},
        {"method": "GET", "path": "/api/v1/retention/policies"},
        {"method": "GET", "path": "/api/v1/cloud-api/sources"},
        {"method": "GET", "path": "/api/v1/ueba/baselines"}
    ]

# Get JWT token from environment or try to login
jwt = os.getenv("API_JWT")
if not jwt:
    print("No API_JWT environment variable found, attempting login...")
    try:
        login_resp = requests.post(
            f"{BASE}/api/v1/auth/login",
            json={"email": "admin@example.com", "password": "admin123"},
            timeout=5
        )
        if login_resp.status_code == 200:
            jwt = login_resp.json().get("access_token")
            print(f"Login successful, got JWT token")
        else:
            print(f"Login failed: {login_resp.status_code} - {login_resp.text}")
    except Exception as e:
        print(f"Login attempt failed: {e}")

HDR = {"Authorization": f"Bearer {jwt}"} if jwt else {}

print(f"Testing backend at {BASE}")
print(f"Using JWT: {'Yes' if jwt else 'No'}")
print("-" * 80)

fail = 0
for r in routes:
    # Only test GET routes for safety (idempotent)
    if r["method"] not in ("GET",):
        continue
        
    url = BASE + r["path"]
    try:
        resp = requests.get(url, headers=HDR, timeout=5)
        ok = resp.status_code < 400
        
        # Special handling for some endpoints
        if resp.status_code == 404 and "not found" in resp.text.lower():
            status_msg = f"{resp.status_code} (Route not implemented)"
        elif resp.status_code == 401:
            status_msg = f"{resp.status_code} (Auth required)"
        elif resp.status_code == 403:
            status_msg = f"{resp.status_code} (Forbidden)"
        else:
            status_msg = str(resp.status_code)
            
    except requests.exceptions.ConnectionError:
        ok = False
        resp = None
        status_msg = "CONNECTION_REFUSED"
    except requests.exceptions.Timeout:
        ok = False
        resp = None
        status_msg = "TIMEOUT"
    except Exception as e:
        ok = False
        resp = None
        status_msg = f"ERROR: {str(e)[:30]}"
    
    status_color = "\033[92m" if ok else "\033[91m"  # Green or Red
    reset_color = "\033[0m"
    
    print(f"{status_color}{'PASS' if ok else 'FAIL'}{reset_color} {r['method']:>4} {r['path']:<35} → {status_msg}")
    
    if not ok:
        fail += 1
        # Print response body for failed requests (truncated)
        if resp and resp.text:
            body_preview = resp.text[:100].replace('\n', ' ')
            print(f"     Body: {body_preview}{'...' if len(resp.text) > 100 else ''}")

print("-" * 80)
if fail == 0:
    print("\033[92mSUMMARY: ALL GREEN - Backend is healthy!\033[0m")
else:
    print(f"\033[91mSUMMARY: {fail} failures detected\033[0m")
    print("\nNext steps:")
    print("1. Check if backend is running: pgrep -f siem_api")
    print("2. Verify backend port (should be 8080): netstat -tlnp | grep 8080")
    print("3. Check backend logs for errors")
    print("4. Ensure databases are running: ClickHouse, PostgreSQL, Redis")

sys.exit(1 if fail else 0)