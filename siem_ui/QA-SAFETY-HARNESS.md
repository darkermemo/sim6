# 🛡️ SIEM Platform - Dev & QA Safety Harness

This document outlines the comprehensive quality assurance and development safety tools implemented for the SIEM platform frontend.

## 🎯 Overview

The QA Safety Harness prevents regressions and ensures code quality by automatically detecting:
- ❌ Missing or misconfigured API endpoints (403, 404, 401)
- 🔍 Schema mismatches in API responses
- 🚨 Bad usage patterns in React + TypeScript
- 🔄 Broken user flows (login, alert view, log ingestion)
- 🔐 Permission/auth/access errors

## 🛠️ Tools & Technologies

### 1. ESLint + TypeScript Support
**Purpose**: Static code analysis and style enforcement

**Configuration**: `.eslintrc.json`
- TypeScript support with `@typescript-eslint/parser`
- React best practices with `eslint-plugin-react`
- Accessibility checks with `eslint-plugin-jsx-a11y`
- React Hooks rules enforcement

**Usage**:
```bash
npm run lint          # Check for issues
npm run lint:fix      # Auto-fix issues
```

### 2. Vite Plugin Checker
**Purpose**: Real-time TypeScript and ESLint error checking during development

**Configuration**: `vite.config.ts`
- Integrated TypeScript compilation checking
- ESLint validation on file changes
- Real-time error overlay in development

### 3. Mock Service Worker (MSW)
**Purpose**: API mocking for development and testing

**Files**:
- `src/mocks/handlers.ts` - API endpoint handlers
- `src/mocks/browser.ts` - Browser worker setup
- `public/mockServiceWorker.js` - Service worker script

**Features**:
- Mock authentication endpoints
- Simulated SIEM data (tenants, alerts, logs, metrics)
- Error simulation for testing error handling
- Development-only activation

**Endpoints Mocked**:
- `POST /api/v1/auth/login` - Authentication
- `GET /api/v1/health` - Health check
- `GET /api/v1/tenants` - Tenant management
- `GET /api/v1/log_sources` - Log source data
- `GET /api/v1/alerts` - Security alerts
- `GET /api/v1/metrics` - System metrics
- `GET /api/v1/rules` - Detection rules
- `GET /api/v1/dashboard/kpis` - Dashboard KPIs

### 4. Zod Schema Validation
**Purpose**: Runtime API response validation

**Files**:
- `src/schemas/api.ts` - Zod schema definitions
- `src/services/validatedApi.ts` - API service with validation

**Features**:
- Type-safe API responses
- Runtime validation of API data
- Automatic error handling for schema mismatches
- Enhanced developer experience with detailed error messages

**Schemas Defined**:
- `AuthResponseSchema` - Authentication responses
- `TenantsResponseSchema` - Tenant data
- `LogSourcesResponseSchema` - Log source data
- `AlertsResponseSchema` - Security alerts
- `MetricsResponseSchema` - System metrics
- `RulesResponseSchema` - Detection rules
- `DashboardKPIsResponseSchema` - Dashboard data

### 5. Playwright E2E Testing
**Purpose**: End-to-end user flow testing

**Configuration**: `playwright.config.ts`
- Multi-browser testing (Chromium, Firefox, WebKit)
- Mobile viewport testing
- Automatic screenshot/video on failure
- Trace collection for debugging

**Test Files**:
- `e2e/log-source-management.spec.ts` - Log source management flows
- `e2e/comprehensive-siem-flows.spec.ts` - Complete SIEM workflows

**Test Coverage**:
- Authentication flows (login/logout)
- Dashboard navigation and loading
- Alerts management and filtering
- Log sources management
- Rules management
- API error handling
- Accessibility testing
- Performance validation

## 🚀 Quick Start

### Running Individual Tools

```bash
# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix

# Unit tests
npm run test
npm run test:watch
npm run test:coverage

# E2E tests
npm run test:e2e
npm run test:e2e:ui

# Build validation
npm run build
```

### Running Complete QA Suite

```bash
# Full comprehensive check
npm run qa

# Quick essential checks
npm run qa:quick
```

## 📋 QA Suite Details

The `npm run qa` command runs the comprehensive QA script (`scripts/run-qa-suite.sh`) which includes:

1. **TypeScript Compilation** - Ensures no type errors
2. **ESLint Validation** - Code quality and style checks
3. **Unit Tests** - Component and utility function tests
4. **Build Process** - Production build validation
5. **API Connectivity** - Backend health checks
6. **Schema Validation** - API response structure validation
7. **E2E Tests** - Complete user workflow testing
8. **Security Audit** - Dependency vulnerability scanning
9. **Bundle Size Check** - Performance optimization validation

## 🔧 Development Workflow

### Pre-commit Checklist
1. Run `npm run qa:quick` for essential checks
2. Fix any linting or type errors
3. Ensure all tests pass
4. Verify build completes successfully

### Pre-deployment Checklist
1. Run `npm run qa` for comprehensive validation
2. Review and address any warnings
3. Ensure E2E tests pass with real backend
4. Verify no security vulnerabilities
5. Check bundle size is reasonable

## 🐛 Troubleshooting

### Common Issues

**ESLint Errors**:
- Run `npm run lint:fix` to auto-fix common issues
- Check `.eslintrc.json` for rule configurations

**TypeScript Errors**:
- Run `npm run type-check` for detailed error messages
- Ensure all imports have proper type definitions

**MSW Not Working**:
- Verify `public/mockServiceWorker.js` exists
- Check browser console for MSW initialization messages
- Ensure development mode is active

**E2E Test Failures**:
- Verify UI server is running on port 3000
- Check if backend API is accessible
- Review Playwright configuration in `playwright.config.ts`

**Schema Validation Errors**:
- Check API response structure matches Zod schemas
- Update schemas in `src/schemas/api.ts` if API changes
- Verify mock data in MSW handlers matches schemas

## 📊 Metrics & Reporting

The QA suite provides detailed reporting:
- ✅ **Passed**: Critical checks that succeeded
- ⚠️ **Warnings**: Non-critical issues that should be reviewed
- ❌ **Failed**: Critical issues that must be fixed

### Exit Codes
- `0`: All checks passed or only warnings
- `1`: Critical failures detected

## 🔄 Continuous Integration

For CI/CD integration, use:

```bash
# In CI environment
npm ci
npm run qa
```

The QA script automatically detects CI environment and adjusts behavior accordingly.

## 📝 Maintenance

### Regular Tasks
1. Update dependencies monthly
2. Review and update ESLint rules quarterly
3. Expand E2E test coverage for new features
4. Update Zod schemas when API changes
5. Review and update MSW mock data

### Adding New Validations
1. Add new ESLint rules to `.eslintrc.json`
2. Create new Zod schemas in `src/schemas/api.ts`
3. Add new MSW handlers in `src/mocks/handlers.ts`
4. Write new E2E tests in `e2e/` directory
5. Update QA script if needed

---

**🎉 With this safety harness in place, you can develop and deploy with confidence, knowing that regressions will be caught early and code quality is maintained!**