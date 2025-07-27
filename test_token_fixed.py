import requests
import json
import base64
import hmac
import hashlib
import time

def base64url_encode(data):
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')

def test_token():
    # Create a token with correct secret from .env file
    header = {"typ": "JWT", "alg": "HS256"}
    payload = {
        "sub": "admin-user", 
        "tid": "tenant-A",
        "roles": ["Admin"],
        "exp": int(time.time() + 3600)
    }
    
    # Use the actual secret from .env file
    secret = "this-is-a-very-long-secure-random-string-for-jwt-signing-do-not-use-in-production"
    
    header_b64 = base64url_encode(json.dumps(header, separators=(',', ':')).encode())
    payload_b64 = base64url_encode(json.dumps(payload, separators=(',', ':')).encode())
    
    message = f"{header_b64}.{payload_b64}"
    signature = hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()
    signature_b64 = base64url_encode(signature)
    
    token = f"{header_b64}.{payload_b64}.{signature_b64}"
    print("Token:", token[:50] + "...")
    
    # Test token
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get("http://localhost:8080/v1/roles", headers=headers, timeout=5)
        print("Status:", resp.status_code)
        print("Response:", resp.text[:100])
        return token if resp.status_code == 200 else None
    except Exception as e:
        print("Error:", e)
        return None

if __name__ == "__main__":
    token = test_token()
    if token:
        with open("admin_token.txt", "w") as f:
            f.write(token)
        print("Token saved!")
    else:
        print("Token test failed!")
