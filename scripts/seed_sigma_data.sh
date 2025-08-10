#!/usr/bin/env bash
set -euo pipefail

TENANT="${1:-default}"

# Seed a few events that match typical Sigma rules in our curated set
clickhouse client -q "
INSERT INTO dev.events
(event_id,event_timestamp,tenant_id,event_category,event_action,event_outcome,
 source_ip,destination_ip,user_id,user_name,severity,message,raw_event,metadata,
 source_type,created_at)
VALUES
('sigma-seed-1',toUInt32(now())-10,'$TENANT','auth','login','failure','10.1.0.5','10.0.0.10',NULL,'user1','HIGH','login fail','{}','{}','app',toUInt32(now())),
('sigma-seed-2',toUInt32(now())-9,'$TENANT','auth','login','failure','10.1.0.6','10.0.0.10',NULL,'user2','HIGH','password fail','{}','{}','app',toUInt32(now())),
('sigma-seed-3',toUInt32(now())-8,'$TENANT','admin','priv_change',NULL,'10.2.0.6','10.0.0.10',NULL,'admin','CRITICAL','user added to admin','{}','{}','app',toUInt32(now()))
" || true

echo "Seeded Sigma sample data for tenant=$TENANT"


