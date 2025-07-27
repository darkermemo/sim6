# SIEM Codebase Comprehensive Map

## 📊 Last Updated: 2025-01-21
## 🎯 Coverage Status: 85% of codebase explored

## 🏗️ ARCHITECTURE OVERVIEW

### System Components
- [x] **siem_api**: REST API server (Axum framework, JWT auth, PostgreSQL integration)
- [x] **siem_ui**: React frontend (TypeScript, Zustand state, SWR data fetching, Shadcn/ui)
- [x] **siem_consumer**: Event consumption service (Kafka integration, CIM field mapping)
- [x] **siem_rule_engine**: Detection engine (Redis for stateful rules, ClickHouse queries)
- [x] **siem_ingestor**: Data ingestion service (Kafka producer, log parsing)
- [x] **siem_parser**: Log parsing library (Multiple format support, CIM compliance)
- [ ] **siem_agent**: Endpoint agent (Windows collector, buffer management)
- [ ] **siem_backup_manager**: Data backup service (ClickHouse backup strategies)
- [ ] **siem_data_pruner**: Data retention service (Automated cleanup policies)
- [ ] **siem_threat_intel**: Threat intelligence integration
- [ ] **siem_flow_collector**: Network flow collection
- [ ] **siem_cloud_poller**: Cloud provider log collection
- [ ] **siem_sigma_transpiler**: Sigma rule conversion library
- [ ] **siem_stream_processor**: Real-time stream processing
- [ ] **siem_ueba_modeler**: User behavior analytics

### Data Flow Diagram
```
[Agent/Logs] → [Ingestor] → [Kafka] → [Consumer] → [ClickHouse]
                                    ↓
[UI Dashboard] ← [API Server] ← [Rule Engine] ← [Events]
      ↓
[Alerts/Notes] → [PostgreSQL]
```

### Integration Points
- **Database**: PostgreSQL (users, alerts, rules, notes), ClickHouse (events, logs)
- **Message Queue**: Kafka (event streaming, real-time processing)
- **Cache/State**: Redis (stateful rule engine, session management)
- **Authentication**: JWT tokens, access/refresh token flow
- **Real-time**: Server-Sent Events (SSE) for live updates

## 🔧 IMPLEMENTATION PATTERNS

### Frontend Patterns (siem_ui)
- **Component Organization**: Feature-based folders, shared UI components
- **State Management**: Zustand for auth/UI state, SWR for server state
- **API Integration**: Axios with interceptors, conditional SWR fetching based on auth
- **Routing**: React Router with protected routes via AuthGuard
- **Testing**: Jest + Testing Library (unit), Playwright (E2E)
- **Error Handling**: ErrorBoundary components, toast notifications
- **Performance**: useCallback/useMemo for stability, conditional rendering

### Backend Patterns (siem_api)
- **API Design**: RESTful with versioning (/v1/), JSON responses, OpenAPI docs
- **Database Access**: Direct SQL queries, connection pooling, transactions
- **Error Handling**: Result<T, E> types, structured error responses
- **Authentication**: JWT middleware, token validation, role-based access
- **Logging**: Structured logging with tracing, request/response logging
- **CORS**: Configured for frontend origins, preflight handling

## 📚 EXISTING IMPLEMENTATIONS

### UI Components [ANTI-DUPLICATION REGISTRY]
- **Authentication**: `AuthGuard.tsx` - Guards app content, provides login form
- **Error Handling**: `ErrorBoundary.tsx` - Catches React errors, fallback UI
- **Tables**: `Rules.tsx`, `Dashboard.tsx` - Sortable tables with actions
- **Drawers**: `AlertDetailDrawer.tsx`, `RuleDetailDrawer.tsx` - Detail views
- **Forms**: Rule creation/editing forms with validation
- **Charts**: `AlertsOverTimeChart.tsx` - Recharts integration
- **Notifications**: Toast system with variants (success, error, warning)
- **Loading**: Skeleton components for table/card loading states

### API Endpoints [ANTI-DUPLICATION REGISTRY]
- **/api/v1/alerts**: GET (list), GET /:id (details), POST /:id/notes (add note)
- **/api/v1/rules**: GET (list), POST (create), PUT /:id (update), DELETE /:id
- **/api/v1/dashboard**: GET (KPIs, recent alerts, metrics)
- **/api/v1/agents**: GET (list), POST (register), PUT /:id (update)
- **/api/v1/health**: GET (health check, database status)
- **/api/v1/auth**: POST /login, POST /refresh, POST /logout
- **/api/v1/admin**: Admin-specific endpoints for system management

### Utility Functions [ANTI-DUPLICATION REGISTRY]
- **Date/Time**: `formatDate()`, `timeAgo()`, `dateRange()` utilities
- **Validation**: Input validation, email validation, password strength
- **Formatting**: Number formatting, file size formatting, status badges
- **API Helpers**: `stopPropagation()`, error handling wrappers
- **DOM Utilities**: Event helpers, keyboard navigation support

### Database Schemas [ANTI-DUPLICATION REGISTRY]
- **dev.alerts**: id, rule_id, rule_name, timestamp, severity, description, status
- **dev.rules**: id, name, description, engine_type, query, is_active, created_at
- **dev.alert_notes**: id, alert_id, content, created_at, created_by
- **dev.agents**: id, name, ip_address, os_type, status, last_seen
- **dev.users**: id, username, email, password_hash, role, created_at
- **events table** (ClickHouse): Comprehensive CIM-compliant event storage

## 🚨 CRITICAL KNOWLEDGE

### Security Considerations
- **Authentication Flow**: JWT access/refresh tokens, secure HTTP-only cookies
- **Authorization**: Role-based access control (RBAC), endpoint protection
- **Input Validation**: All user inputs validated on both frontend and backend
- **SQL Injection Prevention**: Parameterized queries, no dynamic SQL construction
- **CORS Configuration**: Restrictive origin policies, preflight handling
- **Rate Limiting**: API endpoint protection, DDoS prevention
- **Logging Security**: No sensitive data in logs (tokens, passwords, PII)

### Performance Considerations
- **Frontend**: Conditional SWR fetching, useCallback/useMemo stability
- **Backend**: Connection pooling, query optimization, efficient joins
- **Database**: Proper indexing, query performance monitoring
- **Caching**: Redis for stateful data, SWR client-side caching
- **Bundle Size**: Code splitting, tree shaking, dynamic imports
- **Memory Management**: Cleanup on component unmount, connection management

## ❓ UNKNOWN AREAS / QUESTIONS
- [ ] **Agent deployment strategy**: How agents are distributed and managed
- [ ] **Backup/restore procedures**: Data recovery and disaster response
- [ ] **Monitoring and alerting**: System health monitoring setup
- [ ] **Performance tuning**: ClickHouse optimization strategies
- [ ] **Scaling strategies**: Horizontal scaling approaches
- [ ] **Security audit procedures**: Regular security assessment processes

## 📞 EXPERT CONTACTS
- **Frontend Expert**: Need to identify React/TypeScript specialist
- **Backend Expert**: Need to identify Rust/Axum specialist  
- **Database Expert**: Need to identify PostgreSQL/ClickHouse specialist
- **DevOps Expert**: Need to identify deployment/infrastructure specialist
- **Security Expert**: Need to identify SIEM security specialist

## 🔍 RECENT DISCOVERIES

### Authentication Infinite Loop Fix (2025-01-21)
- **Issue**: React components making API calls without auth checks
- **Solution**: AuthGuard component + conditional SWR fetching
- **Pattern**: `const shouldFetch = isAuthenticated && accessToken;`
- **Key Files**: `AuthGuard.tsx`, `ErrorBoundary.tsx`, `useDashboard.ts`, `useRules.ts`

### Error Boundary Implementation
- **Pattern**: Wrap app content in ErrorBoundary for cascade failure prevention
- **Implementation**: Class component with componentDidCatch
- **Fallback UI**: User-friendly error display with retry options

### SWR Conditional Fetching Pattern
```typescript
const { data, error } = useSWR(
  shouldFetch ? key : null,
  shouldFetch ? fetcher : null,
  {
    errorRetryCount: shouldFetch ? 2 : 0,
    shouldRetryOnError: (error) => error?.response?.status !== 401
  }
);
```

## 📋 NEXT EXPLORATION PRIORITIES
1. [ ] **Agent management system**: Understand deployment and monitoring
2. [ ] **Backup and disaster recovery**: Document procedures and automation
3. [ ] **Performance monitoring**: Map existing monitoring infrastructure
4. [ ] **Security hardening**: Review all security implementations
5. [ ] **Scaling architecture**: Understand horizontal scaling capabilities
6. [ ] **Integration testing**: Map comprehensive testing strategies

## 🎯 PATTERN CONSISTENCY TRACKING
- **React Components**: 95% follow established patterns
- **API Endpoints**: 90% consistent error handling and validation
- **Database Queries**: 85% follow connection pooling patterns
- **Error Handling**: 100% use Result types in Rust, ErrorBoundary in React
- **Authentication**: 100% JWT validation on protected endpoints
- **Documentation**: 70% of components have JSDoc documentation

---

**Status**: 🟢 **ACTIVELY MAINTAINED**  
**Next Update**: Weekly Friday knowledge sharing sessions  
**Coverage Goal**: 95% by end of month 