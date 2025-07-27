#!/bin/bash

# Create comprehensive real-time rules for malicious dataset detection

echo "Creating real-time malware detection rule..."
curl -X POST "http://localhost:8080/v1/rules" \
  -H "Content-Type: application/json" \
  -d '{
    "rule_name": "Real-time Malware Detection",
    "rule_description": "Detects malware indicators in real-time",
    "rule_query": "malware",
    "engine_type": "real-time",
    "is_active": true,
    "is_stateful": false
  }'

echo "\nCreating real-time threat detection rule..."
curl -X POST "http://localhost:8080/v1/rules" \
  -H "Content-Type: application/json" \
  -d '{
    "rule_name": "Real-time Threat Detection",
    "rule_description": "Detects threat indicators in real-time",
    "rule_query": "threat",
    "engine_type": "real-time",
    "is_active": true,
    "is_stateful": false
  }'

echo "\nCreating real-time attack detection rule..."
curl -X POST "http://localhost:8080/v1/rules" \
  -H "Content-Type: application/json" \
  -d '{
    "rule_name": "Real-time Attack Detection",
    "rule_description": "Detects attack indicators in real-time",
    "rule_query": "attack",
    "engine_type": "real-time",
    "is_active": true,
    "is_stateful": false
  }'

echo "\nCreating real-time virus detection rule..."
curl -X POST "http://localhost:8080/v1/rules" \
  -H "Content-Type: application/json" \
  -d '{
    "rule_name": "Real-time Virus Detection",
    "rule_description": "Detects virus indicators in real-time",
    "rule_query": "virus",
    "engine_type": "real-time",
    "is_active": true,
    "is_stateful": false
  }'

echo "\nCreating real-time blocked activity detection rule..."
curl -X POST "http://localhost:8080/v1/rules" \
  -H "Content-Type: application/json" \
  -d '{
    "rule_name": "Real-time Blocked Activity Detection",
    "rule_description": "Detects blocked activities in real-time",
    "rule_query": "blocked",
    "engine_type": "real-time",
    "is_active": true,
    "is_stateful": false
  }'

echo "\nCreating real-time denied access detection rule..."
curl -X POST "http://localhost:8080/v1/rules" \
  -H "Content-Type: application/json" \
  -d '{
    "rule_name": "Real-time Denied Access Detection",
    "rule_description": "Detects denied access attempts in real-time",
    "rule_query": "denied",
    "engine_type": "real-time",
    "is_active": true,
    "is_stateful": false
  }'

echo "\nCreating real-time error detection rule..."
curl -X POST "http://localhost:8080/v1/rules" \
  -H "Content-Type: application/json" \
  -d '{
    "rule_name": "Real-time Error Detection",
    "rule_description": "Detects error conditions in real-time",
    "rule_query": "error",
    "engine_type": "real-time",
    "is_active": true,
    "is_stateful": false
  }'

echo "\nCreating real-time failed activity detection rule..."
curl -X POST "http://localhost:8080/v1/rules" \
  -H "Content-Type: application/json" \
  -d '{
    "rule_name": "Real-time Failed Activity Detection",
    "rule_description": "Detects failed activities in real-time",
    "rule_query": "failed",
    "engine_type": "real-time",
    "is_active": true,
    "is_stateful": false
  }'

echo "\nAll real-time rules created successfully!"
