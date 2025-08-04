# QA Safety Harness

This document outlines the quality assurance and testing infrastructure for the SIEM project.

## Vertical Slice Smoke Test

The vertical slice smoke test validates the complete ingestion pipeline from event ingestion through ClickHouse storage to dashboard display.

### Prerequisites

Before running the vertical slice tests, ensure the following services are running:

- **ClickHouse Server**: Version 23.8.* running on default port (8123/9000)
- **Redis Server**: Version 7.* running on default port (6379)

### Version Requirements

The system requires specific versions of tools and services. Use the version verification script to check:

```bash
./scripts/verify-versions.sh
```

Required versions:
- **Rust**: 1.79.0 with stable toolchain
- **Node.js**: v20.14.*
- **pnpm**: 9.*
- **ClickHouse**: 23.8.*

### Running the Smoke Test

The smoke test validates the complete ingestion pipeline:

```bash
./scripts/smoke-slice.sh
```

This script:
1. Starts the `siem_ingestor` service on port 8083
2. Posts a test event to the `demoTenant` endpoint
3. Waits for the event to be processed and stored in ClickHouse
4. Queries ClickHouse to verify the event was stored correctly
5. Cleans up the ingestor process

### End-to-End Testing with Playwright

The E2E tests validate the complete user workflow from frontend to backend:

```bash
cd siem_ui
pnpm exec playwright test --project=chromium ../e2e/runtime-slice.spec.ts
```

These tests verify:
1. Dashboard loads without console errors
2. Recent Alerts section displays data
3. `demoTenant` filter is automatically applied
4. Time range changes trigger data refresh
5. Alert drawer opens with valid alert details
6. State persistence after page refresh

### Local Development Workflow

1. **Start required services**:
   ```bash
   # Start ClickHouse (varies by installation method)
   clickhouse-server
   
   # Start Redis
   redis-server
   ```

2. **Verify environment**:
   ```bash
   ./scripts/verify-versions.sh
   ```

3. **Run smoke test**:
   ```bash
   ./scripts/smoke-slice.sh
   ```

4. **Start development servers**:
   ```bash
   # Terminal 1: Backend API
   cd siem_api
   cargo run
   
   # Terminal 2: Frontend dev server
   cd siem_ui
   pnpm dev
   ```

5. **Run E2E tests**:
   ```bash
   cd siem_ui
   pnpm exec playwright test --project=chromium ../e2e/runtime-slice.spec.ts
   ```

### Troubleshooting

#### Version Verification Failures
- Ensure all required tools are installed and in PATH
- Use `rustup` to manage Rust toolchain versions
- Use `nvm` or similar to manage Node.js versions
- Verify ClickHouse is accessible via `clickhouse client`

#### Smoke Test Failures
- Check that ClickHouse and Redis are running and accessible
- Verify no other services are using port 8083
- Check ClickHouse logs for ingestion errors
- Ensure the `demoTenant` database exists in ClickHouse

#### E2E Test Failures
- Verify both backend (port 8082) and frontend (port 5000) are running
- Check browser console for JavaScript errors
- Ensure test data exists in ClickHouse for the `demoTenant`
- Verify API authentication tokens are valid

### CI Integration

The vertical slice tests are integrated into the CI pipeline via `.github/workflows/ci.yml`. The pipeline:

1. Sets up the required environment (Rust 1.79.0, Node.js 20.14, pnpm 9)
2. Starts ClickHouse and Redis services
3. Runs version verification
4. Executes frontend linting and error detection
5. Builds Rust components
6. Runs the smoke test
7. Executes Playwright E2E tests

All tests must pass for the CI pipeline to succeed.