# Rust Code Issues Tracking and Fixes

## Critical Issues Found (Priority 1 - Security)

### 1. SQL Injection Vulnerabilities
**File:** `src/dev_events_handler.rs`
**Lines:** 306-450
**Issue:** Using string formatting to build SQL queries instead of parameterized queries
**Risk:** High - Can lead to data breaches and unauthorized access
**Status:** 🔴 NEEDS IMMEDIATE FIX

**Details:**
- `format!` macro used to build WHERE clauses and main query
- `query_params` HashMap built but never used
- Both main query and count query vulnerable

### 2. Schema Mismatch
**File:** `src/dev_events_handler.rs`
**Lines:** 81-150 (DevEvent struct) vs 350-365 (SQL query)
**Issue:** DevEvent struct has 40+ fields but SQL query only selects 7
**Risk:** Medium - Runtime errors and data inconsistency
**Status:** 🔴 NEEDS FIX

**Details:**
- DevEvent struct: 40+ fields including network, endpoint, web, device, geographic, security, auth, app, email fields
- SQL query: Only selects event_id, tenant_id, event_timestamp, source_ip, source_type, message, severity
- Most fields explicitly set to None

## High Priority Issues (Priority 2)

### 3. Hardcoded Database Names
**Files:** Multiple
**Issue:** Hardcoded 'dev.' prefix and database names
**Risk:** Medium - Prevents proper deployment and configuration
**Status:** 🟡 NEEDS FIX

**Details:**
- `dev.events` hardcoded in queries
- No environment variable configuration for database/schema names

### 4. Inconsistent Error Handling
**Files:** Multiple Rust files
**Issue:** Mixed error handling patterns across modules
**Risk:** Medium - Poor debugging and user experience
**Status:** 🟡 NEEDS FIX

### 5. Mixed Database Technologies
**Files:** `siem_clickhouse_search/src/database.rs`, `siem_unified_pipeline/src/database.rs`
**Issue:** Both ClickHouse and PostgreSQL without proper connection management
**Risk:** Medium - Resource leaks and connection issues
**Status:** 🟡 NEEDS FIX

## Medium Priority Issues (Priority 3)

### 6. Unsafe Type Conversions
**Files:** Multiple
**Issue:** Missing validation and unsafe unwraps
**Risk:** Low-Medium - Runtime panics
**Status:** 🟡 NEEDS FIX

### 7. Frontend-Backend Naming Mismatches
**Issue:** snake_case in Rust vs expected camelCase in frontend
**Risk:** Low-Medium - API integration issues
**Status:** 🟡 NEEDS FIX

### 8. Missing Unit Tests
**Files:** All Rust modules
**Issue:** No comprehensive test coverage
**Risk:** Low-Medium - Regression bugs
**Status:** 🟡 NEEDS FIX

### 9. No Runtime Schema Validation
**Issue:** No validation that database schema matches struct definitions
**Risk:** Low-Medium - Silent data corruption
**Status:** 🟡 NEEDS FIX

### 10. Missing Indexing Strategy
**Issue:** No evidence of proper database indexing
**Risk:** Low - Performance issues
**Status:** 🟡 NEEDS FIX

## Fix Implementation Plan

### Phase 1: Critical Security Fixes (IMMEDIATE)
- [ ] Fix SQL injection in dev_events_handler.rs
- [ ] Add input validation and sanitization
- [ ] Implement parameterized queries

### Phase 2: Schema Alignment (HIGH PRIORITY)
- [ ] Align DevEvent struct with actual database schema
- [ ] Add runtime schema validation
- [ ] Fix field mapping issues

### Phase 3: Configuration Management (HIGH PRIORITY)
- [ ] Replace hardcoded values with environment variables
- [ ] Create proper configuration structs
- [ ] Ensure consistent naming conventions

### Phase 4: Error Handling & Testing (MEDIUM PRIORITY)
- [ ] Standardize error handling across modules
- [ ] Add comprehensive unit tests
- [ ] Create integration tests for database operations
- [ ] Add proper logging and monitoring

### Phase 5: Performance & Optimization (LOW PRIORITY)
- [ ] Implement proper connection pooling
- [ ] Add database indexing strategy
- [ ] Optimize query performance

## Issues Status

### Critical Priority (Security & Data Integrity)
1. **SQL Injection Vulnerabilities** - ✅ FIXED
   - Location: `dev_events_handler.rs:query_dev_events_internal()`
   - Issue: String formatting used for WHERE clauses
   - Risk: Complete database compromise
   - Fix: ✅ Implemented parameterized queries with input validation
   - Tests: ✅ Added comprehensive SQL injection prevention tests

2. **Schema Mismatch** - ✅ FIXED
   - Location: `DevEvent` struct vs SQL query
   - Issue: Struct has 40+ fields, query selects only 7
   - Risk: Runtime errors, data inconsistency
   - Fix: ✅ Created `DevEventCore` struct with only queried fields
   - Backward compatibility: ✅ Maintained with `DevEventsResponseLegacy`

### High Priority (System Reliability)
3. **Hardcoded Database Names** - ✅ FIXED
   - Location: Multiple files with 'dev.' prefix
   - Issue: Deployment inflexibility
   - Risk: Environment-specific failures
   - Fix: ✅ Replaced with environment variables (`CLICKHOUSE_DATABASE`, `EVENTS_TABLE_NAME`)
   - Validation: ✅ Added environment variable validation in config

4. **Additional SQL Injection Vulnerabilities** - ✅ FIXED
   - Location: `siem_clickhouse_search/src/database.rs:765,767,847` ✅
   - Location: `siem_unified_pipeline/src/storage.rs:214-240` ✅
   - Location: `siem_clickhouse_ingestion/src/clickhouse.rs:164-180` ✅
   - Issue: Using `format!` macro for table names in SQL queries
   - Risk: High - SQL injection through table name manipulation
   - Fix: ✅ Added table name validation with regex pattern, length limits, and SQL keyword blacklisting
   - Details: `get_table_name()` now properly validates tenant_id and sanitizes table names

5. **Inconsistent Error Handling** - ✅ FIXED
   - Location: Multiple files using different error types
   - Issue: Mixed `anyhow::Error`, `Box<dyn Error>`, custom errors
   - Risk: Poor debugging, inconsistent API responses
   - Solution: ✅ Created standardized `SiemError` enum in `error_handling.rs`
   - Fix: ✅ Implemented unified error handling with proper HTTP status mapping and context helpers

6. **Mixed Database Connection Management** - ✅ FIXED
   - Location: Multiple files creating ClickHouse clients directly
   - Issue: No connection pooling, resource leaks
   - Risk: Performance degradation, connection exhaustion
   - Solution: ✅ Created `DatabaseManager` in `database_manager.rs`
   - Fix: ✅ Implemented connection pooling, health monitoring, and connection statistics

## Progress Tracking

**Total Issues:** 10
**Critical:** 2
**High Priority:** 3
**Medium Priority:** 5

**Status:**
- 🟢 Fixed: 3 issues
- 🟡 Needs Fix: 5 issues
- 🔴 Critical/Immediate: 2 issues

## Next Steps
1. Start with SQL injection fix in dev_events_handler.rs
2. Implement proper parameterized queries
3. Add comprehensive input validation
4. Fix schema alignment issues
5. Replace hardcoded values with configuration