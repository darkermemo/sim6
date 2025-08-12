#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "$0")/00_env.sh"

# Minimal Sigma YAML (HTTP UA example)
read -r -d '' YAML <<'YAML'
title: UA Mozilla
id: 11111111-2222-3333-4444-555555555555
status: experimental
logsource:
  product: webserver
detection:
  sel:
    http.user_agent|contains: "Mozilla"
  condition: sel
level: low
YAML

note "sigma compile"
api /api/v2/rules/sigma/compile "$(jq -n --arg y "$YAML" '{yaml:$y}')" \
  | tee "$ART_DIR/sigma_compile.json" >/dev/null

note "sigma create"
api /api/v2/rules/sigma "$(jq -n --arg y "$YAML" '{yaml:$y}')" \
  | tee "$ART_DIR/sigma_create.json" >/dev/null

note "list rules"
api /api/v2/rules | tee "$ART_DIR/rules_list.json" >/dev/null


