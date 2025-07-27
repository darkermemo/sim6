#!/bin/bash

# Generate a fresh JWT token for the SIEM system
# This script generates a new token and updates both the admin_token.txt file and the UI AuthGuard component

echo "Generating fresh JWT token..."

# Generate new token using the API's token generator
cd /Users/yasseralmohammed/sim6/siem_api
TOKEN_OUTPUT=$(cargo run --example generate_token admin-user tenant-A Admin,SuperAdmin 2>/dev/null)
NEW_TOKEN=$(echo "$TOKEN_OUTPUT" | grep -E '^eyJ' | head -1)

if [ -z "$NEW_TOKEN" ]; then
    echo "Error: Failed to generate token"
    exit 1
fi

echo "Generated new token: $NEW_TOKEN"

# Update admin_token.txt
echo "$NEW_TOKEN" > /Users/yasseralmohammed/sim6/admin_token.txt
echo "Updated admin_token.txt"

# Update AuthGuard.tsx
AUTH_GUARD_FILE="/Users/yasseralmohammed/sim6/siem_ui/src/components/AuthGuard.tsx"
if [ -f "$AUTH_GUARD_FILE" ]; then
    # Use sed to replace the token in AuthGuard.tsx
    sed -i '' "s/const validToken = 'eyJ[^']*';/const validToken = '$NEW_TOKEN';/" "$AUTH_GUARD_FILE"
    echo "Updated AuthGuard.tsx with new token"
else
    echo "Warning: AuthGuard.tsx not found at $AUTH_GUARD_FILE"
fi

echo "Token refresh complete!"
echo "Please refresh your browser to use the new token."