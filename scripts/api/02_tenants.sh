#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "$0")/00_env.sh"

TENANT="${1:-demo_tenant}"

note "create tenant $TENANT"
api /api/v2/admin/tenants "$(jq -n --arg id "$TENANT" '{tenant_id:$id}')" | tee "$ART_DIR/tenants_create.json" >/dev/null

note "set limits"
api "/api/v2/admin/tenants/$TENANT/limits" \
  "$(jq -n '{eps_limit:50, burst_limit:200, retention_days:30}')" | tee "$ART_DIR/tenant_limits.json" >/dev/null

note "get tenant"
api "/api/v2/admin/tenants/$TENANT" | tee "$ART_DIR/tenant_get.json" >/dev/null

note "list tenants"
api /api/v2/admin/tenants | tee "$ART_DIR/tenants_list.json" >/dev/null


