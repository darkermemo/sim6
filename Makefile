# SIEM Integration Test Makefile
# Provides convenient targets for running integration tests

.PHONY: help test test-all test-isolated test-e2e test-clickhouse test-kafka test-redis test-vector test-health test-eps test-ui test-sse test-pipeline clean-test-artifacts

# Default target
help:
	@echo "SIEM Integration Test Targets:"
	@echo ""
	@echo "  test-all          - Run all integration tests in sequence"
	@echo "  test-isolated     - Run isolated connectivity tests only"
	@echo "  test-e2e          - Run end-to-end pipeline tests only"
	@echo ""
	@echo "Individual Component Tests:"
	@echo "  test-clickhouse   - Test ClickHouse connectivity and schema"
	@echo "  test-kafka        - Test Kafka connectivity and message flow"
	@echo "  test-redis        - Test Redis connectivity and operations"
	@echo "  test-vector       - Test Vector health and metrics (optional)"
	@echo "  test-health       - Test health and metrics endpoints"
	@echo "  test-eps          - Test EPS calculation endpoint"
	@echo "  test-ui           - Test Dev UI smoke tests"
	@echo "  test-sse          - Test SSE streaming functionality"
	@echo "  test-pipeline     - Test full end-to-end pipeline"
	@echo ""
	@echo "Utility Targets:"
	@echo "  clean-test-artifacts - Clean up test artifacts and temp files"
	@echo "  test-env          - Show test environment configuration"
	@echo ""
	@echo "Usage Examples:"
	@echo "  make test-all                    # Run complete test suite"
	@echo "  make test-isolated               # Quick connectivity checks"
	@echo "  make test-clickhouse test-kafka  # Test specific components"

# Run all tests
test-all: test
test:
	@echo "Running complete SIEM integration test suite..."
	./scripts/run_all_tests.sh --auto

# Run isolated connectivity tests only
test-isolated:
	@echo "Running isolated connectivity tests..."
	@echo "Testing ClickHouse..."
	./scripts/test_clickhouse.sh
	@echo "Testing Kafka..."
	./scripts/test_kafka.sh
	@echo "Testing Redis..."
	./scripts/test_redis.sh
	@echo "Testing Vector (optional)..."
	-./scripts/test_vector.sh
	@echo "Isolated tests completed."

# Run end-to-end tests only
test-e2e:
	@echo "Running end-to-end tests..."
	@echo "Testing SSE streaming..."
	./scripts/test_sse.sh
	@echo "Testing full pipeline..."
	./scripts/test_full_pipeline.sh
	@echo "End-to-end tests completed."

# Individual component tests
test-clickhouse:
	@echo "Testing ClickHouse connectivity and schema..."
	./scripts/test_clickhouse.sh

test-kafka:
	@echo "Testing Kafka connectivity and message flow..."
	./scripts/test_kafka.sh

test-redis:
	@echo "Testing Redis connectivity and operations..."
	./scripts/test_redis.sh

test-vector:
	@echo "Testing Vector health and metrics..."
	./scripts/test_vector.sh

test-health:
	@echo "Testing health and metrics endpoints..."
	./scripts/test_health_and_metrics.sh

test-eps:
	@echo "Testing EPS calculation endpoint..."
	./scripts/test_eps.sh

test-ui:
	@echo "Testing Dev UI smoke tests..."
	./scripts/test_dev_ui.sh

test-sse:
	@echo "Testing SSE streaming functionality..."
	./scripts/test_sse.sh

test-pipeline:
	@echo "Testing full end-to-end pipeline..."
	./scripts/test_full_pipeline.sh

# Utility targets
clean-test-artifacts:
	@echo "Cleaning up test artifacts..."
	@rm -f scripts/.*.test_passed
	@rm -f /tmp/siem_test_*
	@echo "Test artifacts cleaned."

test-env:
	@echo "Test Environment Configuration:"
	@echo "=============================="
	@if [ -f .env ]; then \
		echo "Environment file: .env (found)"; \
		echo "Key variables:"; \
		grep -E '^(CLICKHOUSE_|KAFKA_|REDIS_|VECTOR_|SIEM_)' .env | head -10; \
	else \
		echo "Environment file: .env (not found)"; \
	fi
	@echo ""
	@if [ -f siem_unified_pipeline/config.toml ]; then \
		echo "Config file: siem_unified_pipeline/config.toml (found)"; \
	else \
		echo "Config file: siem_unified_pipeline/config.toml (not found)"; \
	fi
	@echo ""
	@echo "Test scripts available:"
	@ls -la scripts/test_*.sh 2>/dev/null || echo "No test scripts found"

# Development targets
dev-setup:
	@echo "Setting up development environment..."
	@if [ ! -f .env ]; then \
		echo "Creating .env from .env.example..."; \
		cp .env.example .env; \
		echo "Please edit .env with your configuration"; \
	else \
		echo ".env already exists"; \
	fi
	@echo "Making test scripts executable..."
	@chmod +x scripts/*.sh
	@echo "Development setup completed."

# Quick health check
health-check:
	@echo "Quick health check..."
	@echo "Testing basic connectivity to all services:"
	@./scripts/test_clickhouse.sh | grep -E '(✅|❌|HTTP Status)' || echo "ClickHouse test failed"
	@./scripts/test_kafka.sh | grep -E '(✅|❌|Brokers)' || echo "Kafka test failed"
	@./scripts/test_redis.sh | grep -E '(✅|❌|PING)' || echo "Redis test failed"
	@echo "Health check completed."

# Continuous integration target
ci-test:
	@echo "Running CI test suite..."
	@echo "Environment: CI"
	@./scripts/run_all_tests.sh --auto
	@if [ $$? -eq 0 ]; then \
		echo "CI tests passed"; \
	else \
		echo "CI tests failed"; \
		exit 1; \
	fi

# Performance test (subset of tests focused on performance)
test-performance:
	@echo "Running performance-focused tests..."
	@./scripts/test_eps.sh
	@./scripts/test_health_and_metrics.sh
	@./scripts/test_sse.sh
	@echo "Performance tests completed."

# Security test (basic security checks)
test-security:
	@echo "Running basic security checks..."
	@echo "Checking for exposed credentials..."
	@if grep -r "password\|secret\|key" .env 2>/dev/null | grep -v "#"; then \
		echo "⚠️  Potential credentials found in .env"; \
	else \
		echo "✅ No obvious credentials in .env"; \
	fi
	@echo "Checking for HTTP endpoints (should be HTTPS in production)..."
	@if grep -r "http://" .env config.toml 2>/dev/null | grep -v "localhost\|127.0.0.1"; then \
		echo "⚠️  HTTP endpoints found (consider HTTPS for production)"; \
	else \
		echo "✅ No external HTTP endpoints found"; \
	fi
	@echo "Security checks completed."

# Documentation target
docs:
	@echo "Integration Test Documentation:"
	@echo "=============================="
	@if [ -f reports/integration_status.md ]; then \
		echo "Integration Status Report: reports/integration_status.md"; \
	else \
		echo "Integration Status Report: Not found"; \
	fi
	@if [ -f reports/integration_findings.json ]; then \
		echo "Integration Findings JSON: reports/integration_findings.json"; \
	else \
		echo "Integration Findings JSON: Not found"; \
	fi
	@echo ""
	@echo "Available test scripts:"
	@ls -1 scripts/test_*.sh 2>/dev/null | sed 's/^/  /' || echo "  No test scripts found"
	@echo ""
	@echo "For detailed help: make help"

# Final Report Generation
.PHONY: final-report
final-report:
	@bash scripts/make_final_report.sh

.PHONY: gen-all parse-validate load-all rules-seed rules-test report bench
gen-all:
	@bash scripts/gen-all.sh

parse-validate:
	@bash scripts/parse-validate.sh

load-all:
	@bash scripts/load-all.sh

rules-seed:
	@bash scripts/rules-seed2.sh

rules-test:
	@bash scripts/rules-run-now.sh

report:
	@bash scripts/final_report_append.sh

bench: gen-all parse-validate load-all rules-seed rules-test report

.PHONY: show-report-path
show-report-path:
	@echo "Report: $(PWD)/final_reportv1.md"