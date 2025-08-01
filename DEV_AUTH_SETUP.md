# Development Authentication Setup Guide

This document provides a comprehensive guide for setting up and using the development authentication system with MCP (Model Context Protocol) flows.

## Overview

The SIEM system includes a development authentication feature (`dev-auth`) that provides simplified authentication for development and testing purposes. This feature should **NEVER** be used in production environments.

## Quick Setup

### 1. Automated Setup (Recommended)

```bash
# Run the automated setup script
./dev-setup.sh
```

This script will:
- Verify environment configuration
- Build with dev-auth feature
- Run authentication tests
- Provide usage instructions

### 2. Manual Setup

#### Environment Configuration

The `.env` file has been configured with the following dev-auth settings:

```bash
# Development Authentication
DEV_ADMIN_TOKEN=dev_admin_token_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0

# Feature Flags
ENABLE_DEV_AUTH=true
ENABLE_DEBUG=true
ENABLE_METRICS=true

# Development Environment
ENVIRONMENT=development
RUST_LOG=info
DEBUG=true

# Build Configuration
CARGO_DEFAULT_FEATURES=dev-auth,metrics
TEST_THREADS=1
```

#### Building the Search Service

```bash
cd siem_clickhouse_search
cargo build --features dev-auth
```

#### Running the Search Service

```bash
cd siem_clickhouse_search
cargo run --features dev-auth
```

#### Running Tests

```bash
# Run all tests with dev-auth feature
cargo test --features dev-auth -- --test-threads=1

# Run only dev_token tests
cargo test dev_token --features dev-auth -- --test-threads=1
```

## Authentication Flow

### Dev Token Authentication

When the `dev-auth` feature is enabled, the search service accepts requests with the `X-Admin-Token` header:

```bash
curl -H "X-Admin-Token: dev_admin_token_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0" \
     http://localhost:8084/api/search
```

### MCP Integration

The MCP (Model Context Protocol) flows are configured to work with the dev-auth system:

1. **Playwright MCP**: Can interact with the search API using dev tokens
2. **Redis MCP**: Uses the configured Redis settings from `.env`
3. **Sequential Thinking MCP**: Available for complex problem-solving workflows

## Configuration Files

### Main Environment File (`.env`)

Contains all environment variables including:
- Database connections (ClickHouse, PostgreSQL, Redis)
- API endpoints and ports
- Authentication tokens and secrets
- Feature flags
- Development settings

### Service-Specific Environment (siem_clickhouse_search/.env)

Contains service-specific settings:
```bash
# Service-specific dev token
DEV_ADMIN_TOKEN=dev_admin_token_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0
```

## Testing

### Test Configuration

Tests are configured to run sequentially to avoid environment variable interference:

```bash
# Set in .env
TEST_THREADS=1
```

### Available Tests

1. `test_dev_admin_valid_token` - Tests valid token authentication
2. `test_dev_admin_invalid_token` - Tests invalid token rejection
3. `test_dev_admin_missing_header` - Tests missing header handling
4. `test_dev_admin_missing_env_var` - Tests missing environment variable handling

### Running Tests

```bash
# All dev_token tests
cargo test dev_token --features dev-auth -- --test-threads=1

# Specific test
cargo test test_dev_admin_valid_token --features dev-auth -- --test-threads=1

# All tests with dev-auth
cargo test --features dev-auth -- --test-threads=1
```

## Security Considerations

### Development Only

⚠️ **CRITICAL**: The dev-auth feature is for development only and should NEVER be enabled in production.

### Token Security

- The `DEV_ADMIN_TOKEN` provides full admin access
- Token is stored in plain text in environment files
- No expiration or rotation mechanism
- No rate limiting or audit logging

### Production Migration

When moving to production:

1. Remove `dev-auth` from feature flags
2. Set `ENABLE_DEV_AUTH=false`
3. Use proper JWT authentication
4. Implement proper secret management
5. Enable TLS/SSL
6. Configure proper CORS settings

## Troubleshooting

### Common Issues

1. **Tests failing when run in parallel**
   - Solution: Use `--test-threads=1`
   - Reason: Environment variable interference

2. **DEV_ADMIN_TOKEN not found**
   - Check `.env` file exists and contains the token
   - Verify environment variables are loaded
   - Ensure the token matches exactly

3. **Build failures**
   - Ensure `dev-auth` feature is specified: `--features dev-auth`
   - Check Rust version compatibility
   - Verify all dependencies are available

4. **Authentication failures**
   - Verify token in request header: `X-Admin-Token`
   - Check token value matches `DEV_ADMIN_TOKEN`
   - Ensure service is built with `dev-auth` feature

### Debug Commands

```bash
# Check environment variables
env | grep DEV_ADMIN_TOKEN
env | grep ENABLE_DEV_AUTH

# Verify build features
cargo build --features dev-auth --verbose

# Run with debug logging
RUST_LOG=debug cargo run --features dev-auth

# Test specific authentication
cargo test test_dev_admin_valid_token --features dev-auth -- --test-threads=1 --nocapture
```

## File Structure

```
sim6/
├── .env                           # Main environment configuration
├── dev-setup.sh                   # Automated setup script
├── DEV_AUTH_SETUP.md             # This documentation
└── siem_clickhouse_search/
    ├── .env                       # Service-specific environment
    ├── Cargo.toml                 # Features configuration
    └── src/
        └── auth/
            ├── mod.rs             # Authentication module
            └── dev_token.rs       # Dev token implementation
```

## Next Steps

1. **For Development**: Use `./dev-setup.sh` for consistent setup
2. **For Testing**: Run tests with `--test-threads=1` flag
3. **For Production**: Disable dev-auth and implement proper authentication
4. **For CI/CD**: Integrate the setup script into build pipelines

## Support

For issues or questions:
1. Check this documentation
2. Review test cases in `src/auth/dev_token.rs`
3. Examine environment configuration in `.env`
4. Run the automated setup script for verification