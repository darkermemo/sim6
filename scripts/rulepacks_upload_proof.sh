#!/usr/bin/env bash
set -euo pipefail

# Rule Packs Upload Proof
# Demonstrates uploading a rule pack with mixed SIGMA and NATIVE rules

SCRIPT_DIR=$(dirname "$0")
source "$SCRIPT_DIR/api/00_env.sh"

echo "=== Rule Packs Upload Proof ==="
echo "Creating sample rule pack..."

# Create temporary directory for pack
PACK_DIR=$(mktemp -d)
trap "rm -rf $PACK_DIR" EXIT

# Create sample SIGMA rules
cat > "$PACK_DIR/rule_001_failed_login.yaml" <<'EOF'
title: Multiple Failed Login Attempts
id: rule_failed_login_attempts
status: production
description: Detects multiple failed login attempts from the same source
references:
  - https://attack.mitre.org/techniques/T1110/
logsource:
  category: authentication
  product: windows
detection:
  selection:
    EventID: 4625
    LogonType: 
      - 3
      - 10
  timeframe: 5m
  condition: selection | count() by Computer > 5
falsepositives:
  - Legitimate users mistyping passwords
  - Service accounts with wrong credentials
level: high
tags:
  - attack.credential_access
  - attack.t1110
EOF

cat > "$PACK_DIR/rule_002_admin_group.yaml" <<'EOF'
title: User Added to Admin Group
id: rule_admin_group_add
status: production
description: Detects when a user is added to administrative groups
logsource:
  product: windows
  service: security
detection:
  selection:
    EventID: 
      - 4728
      - 4732
      - 4756
    TargetUserName:
      - 'Administrators'
      - 'Domain Admins'
      - 'Enterprise Admins'
  condition: selection
level: high
tags:
  - attack.persistence
  - attack.t1098
EOF

# Create more SIGMA rules (8 more for total of 10)
for i in {3..10}; do
  cat > "$PACK_DIR/rule_$(printf "%03d" $i)_test.yaml" <<EOF
title: Test Rule $i
id: rule_test_$i
status: test
description: Test rule for pack validation
logsource:
  product: windows
detection:
  selection:
    EventID: $((4600 + i))
  condition: selection
level: medium
tags:
  - test
EOF
done

# Create NATIVE rules
cat > "$PACK_DIR/rule_011_ssh_brute.json" <<'EOF'
{
  "rule_id": "rule_ssh_brute_force",
  "name": "SSH Brute Force Detection",
  "kind": "NATIVE",
  "severity": "HIGH",
  "dsl": "event_type:ssh AND action:failure | stats count() by src_ip, dest_ip where count > 10",
  "description": "Detects SSH brute force attempts",
  "tags": ["ssh", "brute-force", "network"]
}
EOF

cat > "$PACK_DIR/rule_012_data_exfil.json" <<'EOF'
{
  "rule_id": "rule_data_exfiltration",
  "name": "Potential Data Exfiltration",
  "kind": "NATIVE",
  "severity": "CRITICAL",
  "dsl": "event_type:network AND direction:outbound | stats sum(bytes_out) as total_bytes by src_ip where total_bytes > 1000000000",
  "description": "Detects large outbound data transfers",
  "tags": ["exfiltration", "data-loss"]
}
EOF

# Create pack metadata
cat > "$PACK_DIR/pack.json" <<EOF
{
  "name": "Security Baseline Pack",
  "version": "1.0.0",
  "description": "Basic security monitoring rules",
  "author": "Security Team",
  "rules": $(ls -1 "$PACK_DIR"/*.{yaml,json} 2>/dev/null | grep -v pack.json | wc -l)
}
EOF

# Create zip file
cd "$PACK_DIR"
zip -q pack.zip *.yaml *.json

# Upload the pack
echo "Uploading rule pack..."

# Create upload request
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: multipart/form-data" \
  -F "file=@pack.zip;type=application/zip" \
  -F "name=Security Baseline Pack" \
  -F "version=1.0.0" \
  -F "source=manual" \
  -F "uploader=test_script" \
  "$BASE_URL/api/v2/rule-packs/upload")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "✓ Upload successful"
  echo "$BODY" | jq '.' > rp_upload.json
  
  # Extract pack_id for subsequent tests
  PACK_ID=$(echo "$BODY" | jq -r '.pack_id')
  echo "Pack ID: $PACK_ID"
  
  # Save for other scripts
  echo "$PACK_ID" > .last_pack_id
  
  # Display summary
  echo "$BODY" | jq -r '
    "Summary:",
    "  Pack ID: \(.pack_id)",
    "  Items: \(.items)",
    "  SHA256: \(.sha256)",
    "  Errors: \(.errors | length)"
  '
else
  echo "✗ Upload failed with status $HTTP_CODE"
  echo "$BODY"
  exit 1
fi

echo ""
echo "=== Results saved to rp_upload.json ==="
