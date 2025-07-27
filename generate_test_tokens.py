#!/usr/bin/env python3

import jwt
import datetime

# Secret key (must match the one in siem_api)
SECRET_KEY = "this-is-a-very-long-secure-random-string-for-jwt-signing-do-not-use-in-production"

def generate_token(subject, tenant_id, roles, hours=24):
    """Generate a JWT token with specified claims"""
    expiry = datetime.datetime.utcnow() + datetime.timedelta(hours=hours)
    
    payload = {
        "sub": subject,
        "tid": tenant_id,
        "roles": roles,
        "exp": int(expiry.timestamp())
    }
    
    token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")
    return token

def main():
    print("=== REGRESSION TEST TOKENS ===")
    print()
    
    # SuperAdmin token (can do everything across all tenants)
    superadmin_token = generate_token("superadmin-user", "tenant-A", ["Admin", "SuperAdmin"])
    print("1. SuperAdmin Token:")
    print(superadmin_token)
    print()
    
    # Admin token for tenant-A (can manage tenant-A)
    admin_a_token = generate_token("admin-a-user", "tenant-A", ["Admin"])
    print("2. Admin (tenant-A) Token:")
    print(admin_a_token)
    print()
    
    # Analyst token for tenant-B (limited permissions in tenant-B)
    analyst_b_token = generate_token("analyst-b-user", "tenant-B", ["Analyst"])
    print("3. Analyst (tenant-B) Token:")
    print(analyst_b_token)
    print()
    
    # Save tokens to files for easy access during tests
    with open("superadmin_token.txt", "w") as f:
        f.write(superadmin_token)
    
    with open("admin_a_token.txt", "w") as f:
        f.write(admin_a_token)
    
    with open("analyst_b_token.txt", "w") as f:
        f.write(analyst_b_token)
    
    print("✅ Tokens saved to files:")
    print("   - superadmin_token.txt")
    print("   - admin_a_token.txt") 
    print("   - analyst_b_token.txt")

if __name__ == "__main__":
    main()