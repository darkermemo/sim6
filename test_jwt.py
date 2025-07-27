#!/usr/bin/env python3
import jwt
import time
import requests

# Same secret as the API uses
secret = "your-secret-key"

# Create service token
payload = {
    "sub": "rule-engine-service",
    "tid": "system",
    "roles": ["Service"],
    "exp": int(time.time()) + 3600  # 1 hour from now
}

token = jwt.encode(payload, secret, algorithm="HS256")
print(f"Generated token: {token}")

# Test the endpoint
headers = {"Authorization": f"Bearer {token}"}
response = requests.get("http://localhost:8080/api/v1/service/tenants", headers=headers)

print(f"Status: {response.status_code}")
print(f"Response: {response.text}")