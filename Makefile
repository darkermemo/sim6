# SIEM System Development Makefile
# Fail-fast, self-documenting development environment

.PHONY: dev-up clean test verify-config verify-deps verify-rust start-services verify-integration help
.DEFAULT_GOAL := help

# Configuration
PROJECT_ROOT := $(shell pwd)
LOGS_DIR := $(PROJECT_ROOT)/logs
CONFIG_DIR := $(PROJECT_ROOT)/config
SCRIPTS_DIR := $(PROJECT_ROOT)/scripts

# Colors for output
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
BLUE := \033[34m
RESET := \033[0m

# Main target: Complete development environment setup
dev-up: clean verify-config verify-deps verify-rust start-services verify-integration ## 🚀 Start complete SIEM development environment
	@echo "$(GREEN)✅ SIEM system is fully operational$(RESET)"
	@echo "$(BLUE)🌐 UI: http://localhost:3004$(RESET)"
	@echo "$(BLUE)🔌 API: http://localhost:8080$(RESET)"
	@echo "$(BLUE)🗄️  ClickHouse: http://localhost:8123$(RESET)"

help: ## 📖 Show this help message
	@echo "$(BLUE)SIEM Development Environment$(RESET)"
	@echo "$(YELLOW)Available targets:$(RESET)"
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ { printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

clean: ## 🧹 Stop all services and clean up
	@echo "$(YELLOW)🧹 Cleaning up existing processes...$(RESET)"
	@$(SCRIPTS_DIR)/cleanup.sh
	@mkdir -p $(LOGS_DIR)

verify-config: ## ⚙️  Verify configuration is complete and valid
	@echo "$(YELLOW)⚙️  Verifying configuration...$(RESET)"
	@$(SCRIPTS_DIR)/verify-config.sh
	@echo "$(GREEN)✅ Configuration verified$(RESET)"

verify-deps: ## 🔗 Verify external dependencies (ClickHouse, Kafka, Redis)
	@echo "$(YELLOW)🔗 Verifying external dependencies...$(RESET)"
	@$(SCRIPTS_DIR)/verify-deps.sh
	@echo "$(GREEN)✅ Dependencies verified$(RESET)"

verify-rust: ## 🦀 Verify all Rust components (compile, test, audit)
	@echo "$(YELLOW)🦀 Verifying Rust components...$(RESET)"
	@$(SCRIPTS_DIR)/verify-rust.sh
	@echo "$(GREEN)✅ Rust components verified$(RESET)"

smoke: ## 🧪 Run end-to-end smoke test
	@echo "$(YELLOW)🧪 Running smoke test...$(RESET)"
	docker compose -f scripts/docker-test.yml up -d --wait
	cargo run -p smoke
	docker compose -f scripts/docker-test.yml down -v
	@echo "$(GREEN)✅ Smoke test completed$(RESET)"

start-services: ## 🚀 Start all SIEM services in correct order
	@echo "$(YELLOW)🚀 Starting SIEM services...$(RESET)"
	@$(SCRIPTS_DIR)/start-services.sh
	@echo "$(GREEN)✅ Services started$(RESET)"

verify-integration: ## 🔍 Run integration tests to verify system works end-to-end
	@echo "$(YELLOW)🔍 Running integration tests...$(RESET)"
	@$(SCRIPTS_DIR)/verify-integration.sh
	@echo "$(GREEN)✅ Integration tests passed$(RESET)"

test: verify-rust ## 🧪 Run all tests
	@echo "$(GREEN)✅ All tests passed$(RESET)"

status: ## 📊 Show system status
	@echo "$(YELLOW)📊 System Status:$(RESET)"
	@$(SCRIPTS_DIR)/system-status.sh

stop: clean ## 🛑 Stop all services
	@echo "$(GREEN)✅ All services stopped$(RESET)"

logs: ## 📋 Show recent logs from all services
	@echo "$(YELLOW)📋 Recent logs:$(RESET)"
	@tail -n 20 $(LOGS_DIR)/*.log 2>/dev/null || echo "No logs found"

# Development helpers
dev-reset: clean dev-up ## 🔄 Complete reset and restart

quick-start: verify-config start-services ## ⚡ Quick start (skip verification)
	@echo "$(GREEN)✅ Quick start complete$(RESET)"