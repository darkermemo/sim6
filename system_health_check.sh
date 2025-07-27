#!/bin/bash

# SIEM System Health Check Script
# Checks all components and their connectivity

echo "=== SIEM System Health Check ==="
echo "Timestamp: $(date)"
echo

# Check if all required processes are running
echo "1. Process Status:"
echo "   Kafka:" $(ps aux | grep -E 'kafka\.Kafka' | grep -v grep | wc -l | tr -d ' ') "processes"
echo "   ClickHouse:" $(ps aux | grep 'clickhouse server' | grep -v grep | wc -l | tr -d ' ') "processes"
echo "   SIEM Ingestor:" $(ps aux | grep 'siem_ingestor' | grep -v grep | wc -l | tr -d ' ') "processes"
echo "   SIEM Consumer:" $(ps aux | grep 'siem_consumer' | grep -v grep | wc -l | tr -d ' ') "processes"
echo "   SIEM API:" $(ps aux | grep 'siem_api' | grep -v grep | wc -l | tr -d ' ') "processes"
echo "   SIEM UI:" $(ps aux | grep -E '(vite|npm.*dev)' | grep -v grep | wc -l | tr -d ' ') "processes"
echo

# Check service connectivity
echo "2. Service Connectivity:"

# ClickHouse
echo -n "   ClickHouse (8123): "
if curl -s 'http://localhost:8123/' --data 'SELECT 1' > /dev/null 2>&1; then
    echo "✅ OK"
else
    echo "❌ FAILED"
fi

# Kafka
echo -n "   Kafka (9092): "
if timeout 5 bash -c '</dev/tcp/localhost/9092' > /dev/null 2>&1; then
    echo "✅ OK"
else
    echo "❌ FAILED"
fi

# SIEM API
echo -n "   SIEM API (8080): "
if curl -s 'http://localhost:8080/api/v1/health' > /dev/null 2>&1; then
    echo "✅ OK"
else
    echo "❌ FAILED"
fi

# SIEM UI
echo -n "   SIEM UI (3004): "
if curl -s 'http://localhost:3004/' > /dev/null 2>&1; then
    echo "✅ OK"
else
    echo "❌ FAILED"
fi

echo

# Check JWT token validity
echo "3. Authentication Status:"
if [ -f "/Users/yasseralmohammed/sim6/admin_token.txt" ]; then
    TOKEN=$(cat /Users/yasseralmohammed/sim6/admin_token.txt)
    echo -n "   JWT Token: "
    if curl -s -H "Authorization: Bearer $TOKEN" 'http://localhost:8080/api/v1/health' > /dev/null 2>&1; then
        echo "✅ VALID"
    else
        echo "❌ EXPIRED/INVALID"
        echo "   Run: ./generate_fresh_token.sh to fix"
    fi
else
    echo "   JWT Token: ❌ NOT FOUND"
fi

echo

# Check data flow
echo "4. Data Flow Status:"
echo -n "   Recent Events in DB: "
RECENT_COUNT=$(curl -s 'http://localhost:8123/' --data "SELECT COUNT(*) FROM dev.events WHERE event_timestamp > $(date -d '1 hour ago' +%s) FORMAT TSV" 2>/dev/null || echo "0")
echo "$RECENT_COUNT events in last hour"

echo -n "   Kafka Topic Messages: "
KAFKA_MESSAGES=$(kafka-run-class kafka.tools.GetOffsetShell --broker-list localhost:9092 --topic ingest-events 2>/dev/null | awk -F: '{sum+=$3} END {print sum}' || echo "unknown")
echo "$KAFKA_MESSAGES total messages"

echo
echo "=== Health Check Complete ==="