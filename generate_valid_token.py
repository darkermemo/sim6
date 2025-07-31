#!/usr/bin/env python3

import jwt
import time
import uuid
import os
from datetime import datetime, timedelta

# Configuration - read from environment variables or use defaults
JWT_SECRET = os.getenv("JWT_SECRET", "your-super-secret-jwt-key-here-change-this-in-production")
JWT_ISSUER = os.getenv("JWT_ISSUER", "siem-auth")
JWT_AUDIENCE = os.getenv("JWT_AUDIENCE", "siem-search")
JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", "24"))

def generate_token():
    """Generate a valid JWT token for testing"""
    
    # Current time
    now = int(time.time())
    
    # Token payload
    payload = {
        "sub": "test-user",
        "tenant_id": "default", 
        "roles": ["admin", "search_user"],
        "iat": now,
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "jti": str(uuid.uuid4())
    }
    
    # Add expiration only if JWT_EXPIRATION_HOURS > 0 (permanent tokens when 0)
    if JWT_EXPIRATION_HOURS > 0:
        payload["exp"] = now + (JWT_EXPIRATION_HOURS * 60 * 60)
        print(f"Token will expire in {JWT_EXPIRATION_HOURS} hours")
    else:
        print("Generating permanent token (no expiration)")
    
    # Generate token
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    
    return token

def verify_token(token):
    """Verify the generated token"""
    try:
        # For permanent tokens, we need to disable expiration verification
        options = {"verify_exp": JWT_EXPIRATION_HOURS > 0}
        
        decoded = jwt.decode(
            token, 
            JWT_SECRET, 
            algorithms=["HS256"],
            audience=JWT_AUDIENCE,
            issuer=JWT_ISSUER,
            options=options
        )
        print("Token verification successful!")
        print(f"Decoded payload: {decoded}")
        return True
    except jwt.InvalidTokenError as e:
        print(f"Token verification failed: {e}")
        return False

if __name__ == "__main__":
    print("Generating JWT token...")
    print(f"Using JWT_SECRET: {JWT_SECRET[:20]}...")
    print(f"JWT_EXPIRATION_HOURS: {JWT_EXPIRATION_HOURS}")
    token = generate_token()
    print(f"Generated token: {token}")
    print("\nVerifying token...")
    verify_token(token)