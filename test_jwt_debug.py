#!/usr/bin/env python3
import requests
import json
import jwt
import datetime
from uuid import uuid4

# JWT secret from config (should match the one in config.toml)
JWT_SECRET = "your-super-secret-jwt-key-here-change-this-in-production"

def generate_test_token():
    """Generate a test JWT token with debug info"""
    now = datetime.datetime.now(datetime.timezone.utc)
    exp = now + datetime.timedelta(hours=1)
    
    payload = {
        'sub': 'test-user',
        'tenant_id': 'test-tenant',
        'roles': ['admin'],
        'iat': int(now.timestamp()),
        'exp': int(exp.timestamp()),
        'iss': 'siem-auth',
        'aud': 'siem-search',
        'jti': str(uuid4())
    }
    
    print(f"Payload: {json.dumps(payload, indent=2)}")
    print(f"Secret length: {len(JWT_SECRET)}")
    
    token = jwt.encode(payload, JWT_SECRET, algorithm='HS256')
    print(f"Generated token: {token[:50]}...")
    
    # Try to decode it immediately to verify
    try:
        decoded = jwt.decode(token, JWT_SECRET, algorithms=['HS256'], audience='siem-search', issuer='siem-auth')
        print(f"Token validation successful: {json.dumps(decoded, indent=2, default=str)}")
    except Exception as e:
        print(f"Token validation failed: {e}")
    
    return token

def test_dashboard():
    """Test the dashboard endpoint with authentication"""
    token = generate_test_token()
    
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    
    try:
        print("\nTesting dashboard endpoint...")
        response = requests.get('http://localhost:8084/api/v1/dashboard', headers=headers)
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        
        if response.text:
            try:
                data = response.json()
                print(f"Response Data: {json.dumps(data, indent=2)}")
            except json.JSONDecodeError:
                print(f"Response Text: {response.text}")
        else:
            print("No response body")
            
    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")

if __name__ == '__main__':
    test_dashboard()