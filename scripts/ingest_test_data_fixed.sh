#!/usr/bin/env bash
set -e

echo "Ingesting test data for all 50 rules into dev.events (fixed)..."

count=0
success_count=0
for f in testdata/rule-*.json; do
    echo "Ingesting $(basename "$f")..."
    if curl -s -X POST "http://localhost:8123/" \
        -H "Content-Type: application/json" \
        --data-binary @"$f" \
        --get --data-urlencode "query=INSERT INTO dev.events FORMAT JSONEachRow"; then
        success_count=$((success_count + 1))
        echo "✓ Success"
    else
        echo "✗ Failed"
    fi
    count=$((count + 1))
done

echo "Successfully ingested test data from $success_count out of $count files."

# Verify total event count
total_events=$(curl -s "http://localhost:8123/" --data "SELECT COUNT(*) FROM dev.events")
echo "Total events in dev.events after ingestion: $total_events"

echo "Test data ingestion completed."