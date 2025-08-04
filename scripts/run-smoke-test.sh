#!/bin/bash

# Run smoke test with Docker services
set -e

echo "🚀 Starting smoke test..."

# Start Docker services
echo "📦 Starting ClickHouse and Kafka..."
docker-compose -f scripts/docker-test.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Run the smoke test
echo "🧪 Running smoke test..."
cd smoke
cargo run

# Cleanup
echo "🧹 Cleaning up..."
cd ..
docker-compose -f scripts/docker-test.yml down

echo "✅ Smoke test completed!"