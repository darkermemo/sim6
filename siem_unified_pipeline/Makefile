# SIEM Production Makefile

.PHONY: build test smoke-test run clean lint format check-all

# Build the SIEM application
build:
	@echo "🔨 Building SIEM unified pipeline..."
	cargo build --release

# Run all tests
test:
	@echo "🧪 Running unit tests..."
	cargo test

# Run production smoke test
smoke-test:
	@echo "🚀 Running production smoke test..."
	bash scripts/smoke_test.sh

# Run the SIEM server
run:
	@echo "🚀 Starting SIEM server..."
	cargo run --release

# Clean build artifacts  
clean:
	@echo "🧹 Cleaning build artifacts..."
	cargo clean

# Lint the code
lint:
	@echo "🔍 Linting code..."
	cargo clippy --workspace --all-targets --all-features -- -D warnings

# Format the code
format:
	@echo "✨ Formatting code..."
	cargo fmt --all -- --check

# Run all quality checks
check-all: format lint test
	@echo "✅ All quality checks passed"

# Development setup
dev-setup:
	@echo "🔧 Setting up development environment..."
	@echo "Installing pre-commit hooks..."
	bash scripts/setup-pre-commit-hook.sh

# Production deployment check
production-ready: check-all smoke-test
	@echo "🎉 System is production-ready!"

# Help
help:
	@echo "Available targets:"
	@echo "  build          - Build the application"
	@echo "  test           - Run unit tests" 
	@echo "  smoke-test     - Run production smoke test"
	@echo "  run            - Start the SIEM server"
	@echo "  clean          - Clean build artifacts"
	@echo "  lint           - Lint the code"
	@echo "  format         - Format the code"
	@echo "  check-all      - Run all quality checks"
	@echo "  production-ready - Full production readiness check"
	@echo "  help           - Show this help"