#!/usr/bin/env python3
"""
Simple script to check SIEM consumer status
"""

import requests
import json

def check_status():
    try:
        response = requests.get('http://localhost:9090/status', timeout=5)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            print("\n=== SIEM Consumer Status ===")
            print(json.dumps(data, indent=2))
            
            # Extract key metrics
            if 'processed' in data:
                print(f"\n📊 Processed: {data['processed']}")
            if 'parsed' in data:
                print(f"📊 Parsed: {data['parsed']}")
            if 'queued' in data:
                print(f"📊 Queued: {data['queued']}")
                
    except requests.exceptions.RequestException as e:
        print(f"❌ Error connecting to status endpoint: {e}")
    except json.JSONDecodeError as e:
        print(f"❌ Error parsing JSON response: {e}")
        print(f"Raw response: {response.text}")

if __name__ == '__main__':
    check_status()