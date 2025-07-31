#!/bin/bash

# SIEM Environment Configuration Validator (Shell Script Version)
# This script provides a quick validation of environment variables and service connectivity

set -e

echo "🔍 SIEM Environment Configuration Validator (Shell)"
echo "=================================================="

# Load .env file if it exists
if [ -f ".env" ]; then
    echo "📁 Loading environment from .env"
    export $(grep -v '^#' .env | xargs)
else
    echo "⚠️  No .env file found. Using system environment variables."
fi

echo ""
echo "📋 Environment Variables Check:"
echo "------------------------------"

# Function to check environment variable
check_env_var() {
    local var_name=$1
    local required=${2:-true}
    
    if [ -n "${!var_name}" ]; then
        echo "✅ $var_name: ${!var_name}"
        return 0
    elif [ "$required" = "true" ]; then
        echo "❌ Missing required environment variable: $var_name"
        return 1
    else
        echo "⚠️  Optional $var_name: not set"
        return 0
    fi
}

# Function to test port connectivity
test_port() {
    local host=$1
    local port=$2
    local service_name=$3
    
    if command -v nc >/dev/null 2>&1; then
        if nc -z "$host" "$port" 2>/dev/null; then
            echo "✅ $service_name ($host:$port): Port open"
            return 0
        else
            echo "❌ $service_name ($host:$port): Port closed"
            return 1
        fi
    elif command -v telnet >/dev/null 2>&1; then
        if timeout 5 telnet "$host" "$port" </dev/null >/dev/null 2>&1; then
            echo "✅ $service_name ($host:$port): Port open"
            return 0
        else
            echo "❌ $service_name ($host:$port): Port closed"
            return 1
        fi
    else
        echo "⚠️  $service_name ($host:$port): Cannot test (nc/telnet not available)"
        return 0
    fi
}

# Function to test HTTP endpoint
test_http_endpoint() {
    local url=$1
    local service_name=$2
    
    if command -v curl >/dev/null 2>&1; then
        # Try multiple endpoints
        for endpoint in "/health" "/api/v1/health" "/" "/api/v1/parsers/all"; do
            if curl -s -f "$url$endpoint" >/dev/null 2>&1; then
                echo "✅ $service_name ($url): Service responding (tested $endpoint)"
                return 0
            fi
        done
        
        # If HTTP fails, try port connectivity
        local host=$(echo "$url" | sed -E 's|^https?://([^:/]+).*|\1|')
        local port=$(echo "$url" | sed -E 's|^https?://[^:/]+:([0-9]+).*|\1|')
        
        # Default ports if not specified
        if [ "$port" = "$url" ]; then
            if [[ "$url" == https://* ]]; then
                port=443
            else
                port=80
            fi
        fi
        
        if test_port "$host" "$port" "$service_name port"; then
            echo "⚠️  $service_name ($url): Port open but HTTP endpoints not responding"
            return 0
        else
            echo "❌ $service_name ($url): Service not accessible"
            return 1
        fi
    else
        echo "⚠️  $service_name ($url): Cannot test HTTP (curl not available)"
        return 0
    fi
}

# Check required environment variables
all_good=true

required_vars=("CLICKHOUSE_URL" "DATABASE_URL" "API_URL" "INGESTOR_URL" "JWT_SECRET" "ADMIN_TOKEN")
for var in "${required_vars[@]}"; do
    if ! check_env_var "$var" true; then
        all_good=false
    fi
done

# Check optional environment variables
optional_vars=("KAFKA_BROKERS" "REDIS_URL" "VITE_API_BASE" "ENVIRONMENT" "DEBUG")
for var in "${optional_vars[@]}"; do
    check_env_var "$var" false
done

echo ""
echo "🔌 Service Connectivity Check:"
echo "------------------------------"

# Test ClickHouse
if [ -n "$CLICKHOUSE_URL" ]; then
    if ! test_http_endpoint "$CLICKHOUSE_URL" "ClickHouse"; then
        all_good=false
    fi
fi

# Test PostgreSQL
if [ -n "$DATABASE_URL" ]; then
    # Extract host and port from DATABASE_URL
    pg_host=$(echo "$DATABASE_URL" | sed -E 's|^postgres://[^@]+@([^:/]+).*|\1|')
    pg_port=$(echo "$DATABASE_URL" | sed -E 's|^postgres://[^@]+@[^:/]+:([0-9]+).*|\1|')
    
    # Default port if not specified
    if [ "$pg_port" = "$DATABASE_URL" ]; then
        pg_port=5432
    fi
    
    if ! test_port "$pg_host" "$pg_port" "PostgreSQL"; then
        all_good=false
    fi
fi

# Test API Server
if [ -n "$API_URL" ]; then
    if ! test_http_endpoint "$API_URL" "API Server"; then
        all_good=false
    fi
fi

# Test Ingestor
if [ -n "$INGESTOR_URL" ]; then
    if ! test_http_endpoint "$INGESTOR_URL" "Ingestor"; then
        all_good=false
    fi
fi

# Test Kafka
if [ -n "$KAFKA_BROKERS" ]; then
    kafka_host=$(echo "$KAFKA_BROKERS" | cut -d: -f1)
    kafka_port=$(echo "$KAFKA_BROKERS" | cut -d: -f2)
    if ! test_port "$kafka_host" "$kafka_port" "Kafka"; then
        all_good=false
    fi
fi

# Test Redis (optional)
if [ -n "$REDIS_URL" ]; then
    redis_host=$(echo "$REDIS_URL" | sed -E 's|^redis://([^:/]+).*|\1|')
    redis_port=$(echo "$REDIS_URL" | sed -E 's|^redis://[^:/]+:([0-9]+).*|\1|')
    
    # Default port if not specified
    if [ "$redis_port" = "$REDIS_URL" ]; then
        redis_port=6379
    fi
    
    if ! test_port "$redis_host" "$redis_port" "Redis"; then
        echo "⚠️  Redis is optional, continuing..."
    fi
fi

echo ""
echo "📊 Summary:"
echo "------------------------------"

if [ "$all_good" = true ]; then
    echo "✅ All critical services are properly configured and accessible!"
    echo "🚀 Your SIEM system should be ready to run."
    exit 0
else
    echo "❌ Some issues were found. Please check the configuration."
    echo "📖 Refer to ENVIRONMENT_SETUP.md for detailed setup instructions."
    exit 1
fi