#!/usr/bin/env python3
import requests
import time

INGESTOR_URL = "http://127.0.0.1:8081/ingest/raw"

def send_test_log():
    """Send a test log to the ingestor"""
    test_log = "<142>LEEF:1.0|Test|Generator|1.0|TEST_EVENT|devTime=Jul 24 2025 17:00:00 GMT+03:00 src=192.168.1.100 dst=10.1.1.1 msg=Test log from Python generator"
    
    try:
        headers = {
            'Content-Type': 'text/plain',
            'X-Forwarded-For': '192.168.1.100'
        }
        response = requests.post(INGESTOR_URL, data=test_log.encode('utf-8'), headers=headers, timeout=5)
        print(f"Response status: {response.status_code}")
        print(f"Response text: {response.text}")
        return response.status_code in [200, 202]
    except Exception as e:
        print(f"Error sending log: {e}")
        return False

if __name__ == "__main__":
    print("Testing log sender...")
    for i in range(5):
        print(f"Sending test log {i+1}...")
        success = send_test_log()
        print(f"Success: {success}")
        time.sleep(1)
    print("Test complete.")