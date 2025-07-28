# SIEM Query Inventory

Generated on: 2025-07-28T22:40:48.818Z

Total Queries: 8

## Query Types Summary

- **SELECT**: 4 queries
- **CREATE**: 2 queries
- **DROP**: 1 queries
- **INSERT**: 1 queries

## Detailed Query List

### 1. Database existence check

**Type:** SELECT

**File:** `siem_clickhouse_ingestion/src/clickhouse.rs`

**Line:** 45

**Query:**
```sql
SELECT name FROM system.databases WHERE name = ?
```

**Usage:** Database existence check

---

### 2. Database creation

**Type:** CREATE

**File:** `siem_clickhouse_ingestion/src/clickhouse.rs`

**Line:** 67

**Query:**
```sql
CREATE DATABASE IF NOT EXISTS ?
```

**Usage:** Database creation

---

### 3. Table cleanup

**Type:** DROP

**File:** `siem_clickhouse_ingestion/src/clickhouse.rs`

**Line:** 89

**Query:**
```sql
DROP TABLE IF EXISTS ?
```

**Usage:** Table cleanup

---

### 4. Event count verification

**Type:** SELECT

**File:** `test_stateful_rule_engine_direct.sh`

**Line:** 23

**Query:**
```sql
SELECT count(*) FROM events WHERE event_category = 'Authentication'
```

**Usage:** Event count verification

---

### 5. Test event insertion

**Type:** INSERT

**File:** `test_stateful_rule_engine_direct.sh`

**Line:** 45

**Query:**
```sql
INSERT INTO events (event_timestamp, event_category, source_ip, user) VALUES
```

**Usage:** Test event insertion

---

### 6. Table discovery for backup

**Type:** SELECT

**File:** `siem_backup_manager/src/clickhouse.rs`

**Line:** 156

**Query:**
```sql
SELECT name FROM system.tables WHERE database = ? AND name LIKE 'events_%'
```

**Usage:** Table discovery for backup

---

### 7. Initial schema setup

**Type:** CREATE

**File:** `database_migrations/V001__initial_core_tables.sql`

**Line:** 1

**Query:**
```sql
CREATE TABLE IF NOT EXISTS events (...)
```

**Usage:** Initial schema setup

---

### 8. SPL to ClickHouse query translation

**Type:** SELECT

**File:** `siem_ui/src/services/queryTranspiler.ts`

**Line:** 165

**Query:**
```sql
SELECT count(*) as count, dest_ip FROM events GROUP BY dest_ip
```

**Usage:** SPL to ClickHouse query translation

---

