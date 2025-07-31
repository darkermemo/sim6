# API Contract Validation Guide

This document outlines the Contract-First API development workflow and validation process implemented in this project.

## Overview

Our Contract-First API approach ensures type safety, consistency, and reliability across the entire application stack by:

1. **Defining APIs first** using OpenAPI specifications
2. **Generating TypeScript types** automatically from the schema
3. **Validating contracts** in CI/CD pipelines
4. **Enforcing type safety** in frontend components

## Workflow

### 1. API Design Phase

- Define API endpoints in `openapi.json`
- Include request/response schemas, validation rules, and documentation
- Review and validate the schema before implementation

### 2. Code Generation

```bash
# Generate TypeScript types from OpenAPI schema
cd siem_ui
npm run generate-api
```

This generates:
- `src/generated/api-types.ts` - TypeScript interfaces and types
- Updates to `src/services/typedApi.ts` - Type-safe API client

### 3. Frontend Integration

- Use generated types in React components
- Leverage type-safe hooks like `useTypedLogSources`
- Ensure all API calls are properly typed

### 4. Validation

Validation happens at multiple levels:

#### Local Development
```bash
# Run full validation suite
./scripts/validate-api-contract.sh

# Quick schema validation
swagger-parser validate openapi.json
```

#### Pre-commit Hooks
```bash
# Install pre-commit hooks
pip install pre-commit
pre-commit install

# Hooks will run automatically on commit
git commit -m "Update API schema"
```

#### CI/CD Pipeline
GitHub Actions automatically validate:
- OpenAPI schema syntax and semantics
- TypeScript compilation
- Code linting and formatting
- API client integration tests
- Security scanning

## File Structure

```
├── openapi.json                           # OpenAPI specification
├── scripts/
│   └── validate-api-contract.sh           # Validation script
├── .github/workflows/
│   └── api-contract-validation.yml        # CI/CD validation
├── .pre-commit-config.yaml                # Pre-commit hooks
├── siem_ui/
│   ├── scripts/
│   │   └── generate-api-client.cjs         # Type generation script
│   ├── src/
│   │   ├── generated/
│   │   │   └── api-types.ts                # Generated TypeScript types
│   │   ├── services/
│   │   │   └── typedApi.ts                 # Type-safe API client
│   │   ├── hooks/api/
│   │   │   └── useTypedLogSources.ts       # Typed React hooks
│   │   └── components/
│   │       ├── TypedApiExample.tsx         # Demo component
│   │       ├── LogSourceManagement.tsx     # Updated component
│   │       └── ...
│   └── package.json
└── docs/
    └── API_CONTRACT_VALIDATION.md          # This document
```

## Validation Checks

### 1. Schema Validation
- **Syntax**: Valid JSON/YAML format
- **Structure**: Compliant with OpenAPI 3.0+ specification
- **Semantics**: Logical consistency of endpoints and schemas

### 2. Type Safety
- **Generation**: TypeScript types compile without errors
- **Integration**: API client uses generated types correctly
- **Components**: React components use typed hooks and interfaces

### 3. Code Quality
- **Linting**: ESLint rules for TypeScript and React
- **Formatting**: Prettier for consistent code style
- **Testing**: Unit tests for API client functionality

### 4. Security
- **Schema**: Security definitions and authentication
- **Dependencies**: Vulnerability scanning
- **Best Practices**: Secure coding patterns

## Best Practices

### API Design
1. **Consistent Naming**: Use snake_case for API fields, camelCase for TypeScript
2. **Comprehensive Schemas**: Define all request/response properties
3. **Validation Rules**: Include format, pattern, and constraint validations
4. **Documentation**: Provide clear descriptions and examples

### Frontend Integration
1. **Use Typed Hooks**: Prefer `useTypedLogSources` over raw fetch calls
2. **Handle Loading States**: Leverage built-in loading and error states
3. **Type Assertions**: Avoid `any` types, use proper interfaces
4. **Error Handling**: Implement consistent error handling patterns

### Development Workflow
1. **Schema First**: Update OpenAPI schema before implementation
2. **Generate Types**: Run generation script after schema changes
3. **Update Components**: Migrate existing components to typed APIs
4. **Test Thoroughly**: Validate both happy path and error scenarios

## Troubleshooting

### Common Issues

#### Schema Validation Errors
```bash
# Check schema syntax
swagger-parser validate openapi.json

# Lint for best practices
redocly lint openapi.json
```

#### TypeScript Compilation Errors
```bash
# Check TypeScript compilation
cd siem_ui
npx tsc --noEmit

# Regenerate types if needed
npm run generate-api
```

#### Pre-commit Hook Failures
```bash
# Run validation manually
./scripts/validate-api-contract.sh

# Skip hooks temporarily (not recommended)
git commit --no-verify
```

### Getting Help

1. **Check Logs**: Review validation script output for specific errors
2. **Verify Dependencies**: Ensure all required tools are installed
3. **Update Schema**: Make sure OpenAPI schema is valid and up-to-date
4. **Regenerate Types**: Run type generation after schema changes

## Migration Guide

### Updating Existing Components

1. **Identify API Calls**: Find components using raw fetch or axios
2. **Replace with Typed Hooks**: Use generated hooks like `useTypedLogSources`
3. **Update Interfaces**: Use generated TypeScript interfaces
4. **Test Integration**: Verify functionality with typed APIs

### Example Migration

**Before:**
```typescript
// Old untyped approach
const [logSources, setLogSources] = useState([]);

useEffect(() => {
  fetch('/api/log-sources')
    .then(res => res.json())
    .then(data => setLogSources(data));
}, []);
```

**After:**
```typescript
// New typed approach
import { useTypedLogSources } from '../hooks/api/useTypedLogSources';

const { data, isLoading, error } = useTypedLogSources();
const logSources = data?.log_sources || [];
```

## Continuous Improvement

- **Regular Reviews**: Periodically review and update API schemas
- **Performance Monitoring**: Track API response times and error rates
- **Developer Feedback**: Collect feedback on type safety and DX
- **Tool Updates**: Keep validation tools and dependencies current

This Contract-First approach ensures robust, maintainable, and type-safe API integration across the entire application.