#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-http://127.0.0.1:9999}"
OUT="siem_unified_pipeline/target/test-artifacts/final_reportv1.md"
mkdir -p "$(dirname "$OUT")"
TS="$(date -u +%FT%TZ)"
# Seed events with co-occurring entities
clickhouse client -q "INSERT INTO dev.events (event_id,event_timestamp,tenant_id,event_category,event_action,event_outcome,source_ip,destination_ip,user_id,user_name,severity,message,raw_event,metadata,source_type,created_at)
VALUES
('g1',toUInt32(now())-10,'default','auth','login','failure','10.1.1.1','10.2.2.2',NULL,'alice','HIGH','fail','{}','{}','app',toUInt32(now())),
('g2',toUInt32(now())-9,'default','auth','login','failure','10.1.1.1','10.2.2.3',NULL,'alice','HIGH','fail','{}','{}','app',toUInt32(now())),
('g3',toUInt32(now())-8,'default','auth','login','failure','10.1.1.2','10.2.2.2',NULL,'bob','HIGH','fail','{}','{}','app',toUInt32(now()))"

cat > /tmp/graph_req.json <<'JSON'
{ "tenant_ids":["default"], "time": {"last_minutes": 15}, "seed_entities": [{"type":"user","value":"alice"}], "max_nodes": 100, "max_edges": 300 }
JSON
G=$(curl -sS -X POST "$BASE/api/v2/investigate/graph" -H 'content-type: application/json' --data-binary @/tmp/graph_req.json)
TN=$(echo "$G" | jq -r '.nodes|length')
TE=$(echo "$G" | jq -r '.edges|length')

# Timeline for latest incident
INC=$(curl -sS "$BASE/api/v2/incidents?tenant_id=default&limit=1" | jq -r '.incidents[0].incident_id // empty')
TL="{}"; [ -n "$INC" ] && TL=$(curl -sS "$BASE/api/v2/incidents/$INC/timeline?tenant_id=default")

{
  echo ""; echo "### V2 Graph & Timeline Proof ($TS)"
  echo ""; echo "**Graph request:**"; echo '```json'; cat /tmp/graph_req.json; echo '```'
  echo ""; echo "**Graph summary:** nodes=$TN edges=$TE"; echo '```json'; echo "$G" | jq -c '.nodes[0:5],.edges[0:5]'; echo '```'
  echo ""; echo "**Timeline sample:**"; echo '```json'; echo "$TL" | jq -c '.'; echo '```'
} >>"$OUT"
echo OK


