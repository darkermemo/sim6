import json
import base64
import hmac
import hashlib
import time

def base64url_encode(data):
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')

def generate_jwt_token():
    # Header
    header = {
        "typ": "JWT",
        "alg": "HS256"
    }
    
    # Payload
    payload = {
        "sub": "admin-user",
        "tid": "tenant-A",
        "roles": ["Admin", "SuperAdmin"],
        "exp": int(time.time()) + 86400  # 24 hours
    }
    
    # Secret (same as in environment)
    secret = "this-is-a-very-long-secure-random-string-for-jwt-signing-do-not-use-in-production"
    
    # Encode header and payload
    header_encoded = base64url_encode(json.dumps(header, separators=(',', ':')).encode('utf-8'))
    payload_encoded = base64url_encode(json.dumps(payload, separators=(',', ':')).encode('utf-8'))
    
    # Create signature
    message = f"{header_encoded}.{payload_encoded}"
    signature = hmac.new(
        secret.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).digest()
    signature_encoded = base64url_encode(signature)
    
    # Combine all parts
    token = f"{header_encoded}.{payload_encoded}.{signature_encoded}"
    return token

if __name__ == "__main__":
    token = generate_jwt_token()
    print(token)
