import requests
import json
import base64
import hmac
import hashlib
import time

def base64url_encode(data):
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')

def test_tenant_token():
    header = {"typ": "JWT", "alg": "HS256"}
    payload = {
        "sub": "rule-engine-tenant-A", 
        "tid": "tenant-A",
        "roles": ["Admin"],
        "exp": int(time.time() + 3600)
    }
    
    secret = "this-is-a-very-long-secure-random-string-for-jwt-signing-do-not-use-in-production"
    
    header_b64 = base64url_encode(json.dumps(header, separators=(',', ':')).encode())
    payload_b64 = base64url_encode(json.dumps(payload, separators=(',', ':')).encode())
    
    message = f"{header_b64}.{payload_b64}"
    signature = hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()
    signature_b64 = base64url_encode(signature)
    
    token = f"{header_b64}.{payload_b64}.{signature_b64}"
    
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get("http://localhost:8080/v1/rules", headers=headers, timeout=5)
        print("Status:", resp.status_code)
        print("Response:", resp.text[:500])
        if resp.status_code == 200:
            data = resp.json()
            print("Rules found:", data.get('data', []))
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    test_tenant_token()
