#!/usr/bin/env bash
set -e

echo "Ingesting test data for all 50 rules into dev.events..."

count=0
for f in testdata/rule-*.json; do
    echo "Ingesting $(basename "$f")..."
    curl -s "http://localhost:8123/" \
        --data-binary @"$f" \
        --data-urlencode "query=INSERT INTO dev.events FORMAT JSONEachRow"
    count=$((count + 1))
done

echo "Successfully ingested test data from $count files."

# Verify total event count increased
total_events=$(curl -s "http://localhost:8123/" --data "SELECT COUNT(*) FROM dev.events")
echo "Total events in dev.events after ingestion: $total_events"

echo "Test data ingestion completed successfully."