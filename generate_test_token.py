#!/usr/bin/env python3
"""
Generate a test JWT token for SIEM UI development
"""

import jwt
import datetime
import uuid
import sys

def generate_test_token():
    """Generate a test JWT token with all required claims"""
    claims = {
        'sub': 'test_user',
        'tenant_id': 'default',
        'roles': ['user'],
        'iat': int(datetime.datetime.now(datetime.timezone.utc).timestamp()),
        'exp': int((datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=24)).timestamp()),
        'iss': 'siem-auth',
        'aud': 'siem-search',
        'jti': str(uuid.uuid4())
    }
    
    secret = 'your-super-secret-jwt-key-here-change-this-in-production'
    token = jwt.encode(claims, secret, algorithm='HS256')
    return token

if __name__ == '__main__':
    token = generate_test_token()
    print(token)