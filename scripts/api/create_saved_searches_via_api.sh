#!/usr/bin/env bash
set -euo pipefail

API="http://localhost:9999/api/v2/search/saved"
WORKDIR="$(mktemp -d)"

cat >"$WORKDIR/list.json" <<'JSON'
[
  {"name":"AD - Critical","q":"source:active_directory AND severity:critical"},
  {"name":"Auth Failures","q":"event_type:auth AND outcome:fail"},
  {"name":"Firewall Deny","q":"event_type:firewall AND outcome:deny"},
  {"name":"Web 500s","q":"event_type:web AND status:500"},
  {"name":"MFA Denied Spree","q":"event_type:mfa AND outcome:denied"},
  {"name":"High Volume by IP","q":"roll(count()>100, within=5m, by={source_ip})"},
  {"name":"Password Spray","q":"ratio(fail:success > 20, within=10m, by={src_ip})"},
  {"name":"Beacon Low Jitter","q":"beacon(count≥20, jitter<0.2, within=1h, by={src_ip,dest_ip})"},
  {"name":"Spike Auth Fail","q":"spike(auth_fail, z≥3, within=5m, history=30d, by={user})"},
  {"name":"Linux sudo","q":"event_type:process AND message:/sudo/"},
  {"name":"DNS exfil","q":"event_type:dns AND qname:/[A-Za-z0-9]{40,}/"},
  {"name":"Large Download","q":"event_type:http AND bytes_out>100000000"},
  {"name":"Suspicious Admin","q":"user:admin AND NOT source_ip:10.*"},
  {"name":"Failed Then Success","q":"seq(fail[x10] -> success, within=3m, by={user,src_ip}, strict=strict_once)"},
  {"name":"Brute Source","q":"event_type:auth AND src_ip:/^\\d+\\.\\d+\\.\\d+\\.\\d+$/"},
  {"name":"Error Logs","q":"level:error OR log_level:error OR severity:high"},
  {"name":"Public Cloud Errors","q":"vendor:azure OR vendor:aws AND severity:high"},
  {"name":"SSH Logins","q":"event_type:ssh AND outcome:success"},
  {"name":"Windows Logons","q":"event_type:windows_logon"},
  {"name":"Office Logons","q":"event_type:office365 AND outcome:success"}
]
JSON

echo "Seeding 20 saved searches via $API"
idx=0
total=$(jq -r 'length' "$WORKDIR/list.json")
while [ "$idx" -lt "$total" ]; do
  row=$(jq -r ".[$idx]" "$WORKDIR/list.json")
  name=$(jq -r '.name' <<<"$row")
  q=$(jq -r '.q' <<<"$row")
  cat >"$WORKDIR/body.json" <<JSON
{
  "tenant_id": "all",
  "name": "${name}",
  "q": "${q}",
  "time_last_seconds": 2592000,
  "pinned": 0
}
JSON
  status=$(curl -s -o "$WORKDIR/resp.json" -w '%{http_code}' -X POST "$API" -H 'Content-Type: application/json' --data-binary @"$WORKDIR/body.json")
  echo "[$idx] $status $(jq -r '.id // .error // ""' "$WORKDIR/resp.json")"
  idx=$((idx+1))
done

echo "Done. Verify with: curl -s 'http://localhost:9999/api/v2/search/saved?tenant_id=all' | jq -r '.saved | length'"


