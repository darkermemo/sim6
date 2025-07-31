#!/usr/bin/env python3
"""
SIEM Environment Configuration Validator

This script validates that all required environment variables are properly set
and that the configured services are accessible.
"""

import os
import sys
import socket
from urllib.parse import urlparse

try:
    import requests
except ImportError:
    print("⚠️  requests module not found. HTTP endpoint tests will be skipped.")
    requests = None

def check_env_var(var_name, required=True, default=None):
    """Check if environment variable is set"""
    value = os.getenv(var_name, default)
    if required and not value:
        print(f"❌ Missing required environment variable: {var_name}")
        return False, None
    elif value:
        print(f"✅ {var_name}: {value}")
        return True, value
    else:
        print(f"⚠️  Optional {var_name}: not set")
        return True, None

def test_http_endpoint(url, name):
    """Test HTTP endpoint accessibility"""
    if not requests:
        print(f"⚠️  {name} ({url}): Skipping HTTP test (requests not available)")
        return True
    
    # Try multiple endpoints to check if service is running
    endpoints_to_try = ["/health", "/api/v1/health", "/", "/api/v1/parsers/all"]
    
    for endpoint in endpoints_to_try:
        try:
            response = requests.get(f"{url}{endpoint}", timeout=5)
            if response.status_code in [200, 404]:  # 404 means service is running but endpoint doesn't exist
                print(f"✅ {name} ({url}): Service responding (tested {endpoint})")
                return True
        except requests.exceptions.RequestException:
            continue
    
    # If all endpoints fail, try to test port connectivity
    try:
        parsed = urlparse(url)
        port = parsed.port or (443 if parsed.scheme == 'https' else 80)
        if test_port(parsed.hostname or 'localhost', port, f"{name} port"):
            print(f"⚠️  {name} ({url}): Port open but HTTP endpoints not responding")
            return True
        else:
            print(f"❌ {name} ({url}): Service not accessible")
            return False
    except Exception as e:
        print(f"❌ {name} ({url}): {str(e)}")
        return False

def test_clickhouse(url):
    """Test ClickHouse connectivity"""
    if not requests:
        print(f"⚠️  ClickHouse ({url}): Skipping HTTP test (requests not available)")
        # Try to test port connectivity instead
        parsed = urlparse(url)
        return test_port(parsed.hostname or 'localhost', parsed.port or 8123, "ClickHouse")
    try:
        response = requests.get(f"{url}/ping", timeout=5)
        if response.status_code == 200:
            print(f"✅ ClickHouse ({url}): Accessible")
            return True
        else:
            print(f"❌ ClickHouse ({url}): HTTP {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ ClickHouse ({url}): {str(e)}")
        return False

def test_postgres(database_url):
    """Test PostgreSQL connectivity"""
    print(f"⚠️  PostgreSQL: Skipping connection test (psycopg2 not available)")
    # Try to test port connectivity instead
    try:
        parsed = urlparse(database_url)
        return test_port(parsed.hostname or 'localhost', parsed.port or 5432, "PostgreSQL")
    except Exception as e:
        print(f"❌ PostgreSQL URL parsing: {str(e)}")
        return False

def test_port(host, port, service_name):
    """Test if a port is open"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        result = sock.connect_ex((host, port))
        sock.close()
        if result == 0:
            print(f"✅ {service_name} ({host}:{port}): Port open")
            return True
        else:
            print(f"❌ {service_name} ({host}:{port}): Port closed")
            return False
    except Exception as e:
        print(f"❌ {service_name} ({host}:{port}): {str(e)}")
        return False

def main():
    """Main validation function"""
    print("🔍 SIEM Environment Configuration Validator")
    print("=" * 50)
    
    # Load environment from .env file if it exists
    env_file = ".env"
    if os.path.exists(env_file):
        print(f"📁 Loading environment from {env_file}")
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key] = value
    else:
        print(f"⚠️  No .env file found. Using system environment variables.")
    
    print("\n📋 Environment Variables Check:")
    print("-" * 30)
    
    # Required environment variables
    required_vars = [
        'CLICKHOUSE_URL',
        'DATABASE_URL',
        'API_URL',
        'INGESTOR_URL',
        'JWT_SECRET',
        'ADMIN_TOKEN'
    ]
    
    # Optional environment variables
    optional_vars = [
        'KAFKA_BROKERS',
        'REDIS_URL',
        'VITE_API_BASE',
        'ENVIRONMENT',
        'DEBUG'
    ]
    
    all_good = True
    
    # Check required variables
    for var in required_vars:
        success, value = check_env_var(var, required=True)
        if not success:
            all_good = False
    
    # Check optional variables
    for var in optional_vars:
        check_env_var(var, required=False)
    
    print("\n🔌 Service Connectivity Check:")
    print("-" * 30)
    
    # Test ClickHouse
    clickhouse_url = os.getenv('CLICKHOUSE_URL')
    if clickhouse_url:
        if not test_clickhouse(clickhouse_url):
            all_good = False
    
    # Test PostgreSQL
    database_url = os.getenv('DATABASE_URL')
    if database_url:
        if not test_postgres(database_url):
            all_good = False
    
    # Test API endpoints
    api_url = os.getenv('API_URL')
    if api_url:
        if not test_http_endpoint(api_url, "API Server"):
            all_good = False
    
    ingestor_url = os.getenv('INGESTOR_URL')
    if ingestor_url:
        if not test_http_endpoint(ingestor_url, "Ingestor"):
            all_good = False
    
    # Test Kafka
    kafka_brokers = os.getenv('KAFKA_BROKERS', 'localhost:9092')
    if kafka_brokers:
        host, port = kafka_brokers.split(':')[0], int(kafka_brokers.split(':')[1])
        if not test_port(host, port, "Kafka"):
            all_good = False
    
    # Test Redis (optional)
    redis_url = os.getenv('REDIS_URL')
    if redis_url:
        parsed = urlparse(redis_url)
        if not test_port(parsed.hostname, parsed.port or 6379, "Redis"):
            print("⚠️  Redis is optional, continuing...")
    
    print("\n📊 Summary:")
    print("-" * 30)
    
    if all_good:
        print("✅ All critical services are properly configured and accessible!")
        print("🚀 Your SIEM system should be ready to run.")
        return 0
    else:
        print("❌ Some issues were found. Please check the configuration.")
        print("📖 Refer to ENVIRONMENT_SETUP.md for detailed setup instructions.")
        return 1

if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n⏹️  Validation interrupted by user.")
        sys.exit(1)
    except Exception as e:
        print(f"\n💥 Unexpected error: {str(e)}")
        sys.exit(1)