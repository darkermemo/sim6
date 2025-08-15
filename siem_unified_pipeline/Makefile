# SIEM Hard-Gate Proof Framework
# Binary pass/fail testing with artifacts

.PHONY: proofs proofs-ci clean-proofs help

# Environment variables
TIMESTAMP := $(shell date -u +%Y%m%d-%H%MZ)
GIT_SHA := $(shell git rev-parse --short HEAD)
GIT_BRANCH := $(shell git rev-parse --abbrev-ref HEAD)
OPERATOR := $(or $(CI_OPERATOR),local)
PROOF_DIR := proofs/$(TIMESTAMP)-$(GIT_SHA)

# API endpoints
API_URL := http://127.0.0.1:9999
UI_URL := http://localhost:5183
CH_HOST := 127.0.0.1:9000

help: ## Show this help
	@echo "SIEM Proof Framework"
	@echo "==================="
	@echo ""
	@echo "Commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'

proofs: ## Run all proof stages locally (fail fast)
	@echo "🔬 Starting SIEM Proof Pack: $(PROOF_DIR)"
	@mkdir -p $(PROOF_DIR)
	@$(MAKE) _run_stages PROOF_DIR=$(PROOF_DIR)

proofs-ci: ## Run proofs in CI mode (strict exit codes)
	@echo "🚀 CI Proof Pack: $(PROOF_DIR)"
	@mkdir -p $(PROOF_DIR)
	@set -e; $(MAKE) _run_stages PROOF_DIR=$(PROOF_DIR) CI=1

_run_stages:
	@echo "📋 Generating manifest..."
	@./proofs/scripts/generate_manifest.sh $(PROOF_DIR) $(TIMESTAMP) $(GIT_SHA) $(GIT_BRANCH) $(OPERATOR)
	
	@echo "🔍 Stage 1: Environment Probe"
	@./proofs/scripts/01_env_probe.sh $(PROOF_DIR) $(API_URL) $(CH_HOST) || (echo "❌ FAIL: Environment" && exit 1)
	
	@echo "📥 Stage 2: Ingest Pipeline"
	@./proofs/scripts/02_ingest.sh $(PROOF_DIR) $(API_URL) || (echo "❌ FAIL: Ingest" && exit 1)
	
	@echo "🗄️  Stage 3: ClickHouse"
	@./proofs/scripts/03_clickhouse.sh $(PROOF_DIR) $(CH_HOST) || (echo "❌ FAIL: ClickHouse" && exit 1)
	
	@echo "🔌 Stage 4: API Contract"
	@./proofs/scripts/04_api.sh $(PROOF_DIR) $(API_URL) || (echo "❌ FAIL: API" && exit 1)
	
	@echo "🛡️  Stage 5: Detections"
	@./proofs/scripts/05_detections.sh $(PROOF_DIR) $(API_URL) || (echo "❌ FAIL: Detections" && exit 1)
	
	@echo "⚔️  Stage 6: Attack Simulations"
	@./proofs/scripts/06_sims.sh $(PROOF_DIR) $(API_URL) || (echo "❌ FAIL: Simulations" && exit 1)
	
	@echo "🖥️  Stage 7: UI Functional"
	@./proofs/scripts/07_ui.sh $(PROOF_DIR) $(UI_URL) || (echo "❌ FAIL: UI" && exit 1)
	
	@echo "🔒 Stage 8: Security & Tenancy"
	@./proofs/scripts/08_security.sh $(PROOF_DIR) $(API_URL) || (echo "❌ FAIL: Security" && exit 1)
	
	@echo "❤️  Stage 9: Health & Autofix"
	@./proofs/scripts/09_health.sh $(PROOF_DIR) $(API_URL) || (echo "❌ FAIL: Health" && exit 1)
	
	@echo "📊 Generating CI Report..."
	@./proofs/scripts/generate_report.sh $(PROOF_DIR)
	
	@echo "✅ ALL STAGES PASS - Proof pack: $(PROOF_DIR)"

clean-proofs: ## Remove old proof artifacts (keep last 5)
	@echo "🧹 Cleaning old proof artifacts..."
	@find proofs/ -maxdepth 1 -type d -name "*-*" | sort -r | tail -n +6 | xargs rm -rf || true

# Development helpers
check-deps: ## Check if required tools are installed
	@echo "🔍 Checking dependencies..."
	@command -v curl >/dev/null 2>&1 || (echo "❌ curl not found" && exit 1)
	@command -v jq >/dev/null 2>&1 || (echo "❌ jq not found" && exit 1)
	@command -v clickhouse >/dev/null 2>&1 || (echo "❌ clickhouse client not found" && exit 1)
	@command -v node >/dev/null 2>&1 || (echo "❌ node not found" && exit 1)
	@command -v npx >/dev/null 2>&1 || (echo "❌ npx not found" && exit 1)
	@echo "✅ All dependencies found"

# Quick individual stage testing
stage-env: ## Test environment probe only
	@mkdir -p test-$(TIMESTAMP)
	@./proofs/scripts/01_env_probe.sh test-$(TIMESTAMP) $(API_URL) $(CH_HOST)

stage-api: ## Test API contract only
	@mkdir -p test-$(TIMESTAMP)
	@./proofs/scripts/04_api.sh test-$(TIMESTAMP) $(API_URL)

stage-ui: ## Test UI functional only
	@mkdir -p test-$(TIMESTAMP)
	@./proofs/scripts/07_ui.sh test-$(TIMESTAMP) $(UI_URL)