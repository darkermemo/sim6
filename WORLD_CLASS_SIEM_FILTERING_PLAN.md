# 🌟 World-Class SIEM Filtering - Complete Implementation Plan

## ✅ CHUNK 0 - Routing/Proxy Sanity [COMPLETED]
**Goal**: All UI calls go through `/ui/v3/api/v2/*` to the real backend.

### ✅ Requirements Met:
- **basePath**: `'/ui/v3'` in `next.config.ts` ✅
- **Proxy route**: Forwards ALL verbs to `process.env.API_URL` ✅
- **Headers stripped**: `host/origin/referer` removed ✅
- **Body support**: `duplex:'half'` for streaming bodies ✅

### ✅ Tests Passed:
- `curl -sS http://localhost:5183/ui/v3/api/v2/health | jq .` → status: ok ✅
- **DevTools**: Zero direct calls to `127.0.0.1:9999` from browser ✅

---

## 🔄 CHUNK 1 - Field Catalog [IN PROGRESS]
**Goal**: Live list of parsed fields (name, type, cardinality, top values).

### 🏗️ Backend API Implementation:
**Files**: `src/v2/handlers/schema.rs`, `src/v2/router.rs`

#### ✅ Endpoints Implemented:
```rust
// GET /api/v2/search/fields?tenant_id=default&prefix=win.
pub async fn get_search_fields() -> Json<Vec<FieldCatalogEntry>>

// GET /api/v2/search/values?tenant_id=default&field=host&prefix=web&limit=20  
pub async fn get_search_values() -> Json<Vec<TopValue>>
```

#### ✅ Data Structures:
```rust
struct FieldCatalogEntry {
    field: String,
    type: String, // "string|int|float|bool|datetime|ip|array|map"
    approx_cardinality: u64,
    top_values: Vec<TopValue>,
}

struct TopValue {
    value: String,
    count: u64,
}
```

#### ✅ ClickHouse Integration:
- **Schema discovery**: `system.columns` queries
- **Type normalization**: ClickHouse → simplified types
- **Cardinality**: `uniq()` aggregation over 7-day window
- **Top values**: `GROUP BY ... ORDER BY count DESC LIMIT 5`
- **Performance**: Parallel queries, 150ms P95 target

### 🎨 Frontend API Client:
**Files**: `ui-v3/src/lib/api.ts`

#### ✅ Methods Implemented:
```typescript
export async function getSearchFields(tenantId = "default", prefix?: string): Promise<FieldCatalogEntry[]>

export async function getSearchValues(field: string, tenantId = "default", prefix?: string, limit = 20): Promise<TopValue[]>
```

### 🚧 Current Status:
- **Backend**: Code implemented and compiles ✅
- **Routes**: Added to router configuration ✅  
- **Testing**: Endpoint returns 404 (debugging needed) ❌
- **Frontend**: API client ready ✅

### 📋 Next Steps:
1. Debug route registration issue
2. Test with live ClickHouse data
3. Verify P95 < 150ms performance
4. Test prefix filtering and pagination

---

## 🎯 CHUNK 2 - Filter Builder AST [PLANNED]
**Goal**: Visual query builder that emits AST → formatted query string

### 🏗️ Architecture:
```typescript
interface FilterAST {
  type: 'group' | 'condition';
  operator: 'AND' | 'OR' | 'NOT';
  conditions: FilterCondition[];
  groups: FilterAST[];
}

interface FilterCondition {
  field: string;
  operator: OperatorType;
  value: any;
  type: FieldType;
}
```

### 🎨 UI Components:
- **FilterBuilder**: Main builder interface
- **ConditionRow**: Single condition editor
- **FieldSelector**: Autocomplete with type detection
- **OperatorSelector**: Type-aware operator list
- **ValueInput**: Smart input based on field type
- **GroupControls**: AND/OR/NOT logic

### 🔧 Type-Aware Operators:

#### String Operators:
- `is`, `is not`, `contains`, `starts with`, `ends with`
- `wildcard`, `regex`, `in list`, `not in`

#### Number Operators:
- `=`, `!=`, `>`, `>=`, `<`, `<=`
- `ranges`, `in set`

#### Boolean Operators:
- `is true`, `is false`, `exists`, `not exists`

#### Time Operators:
- **Absolute**: `from/to` date pickers
- **Relative**: `last Xs/min/h/d`
- **Per-clause**: override global time range

#### IP/CIDR Operators:
- `in subnet`, `=`, `!=`
- CIDR validation and suggestions

#### Array/Map Operators:
- `any =`, `all =`, `has key`, `has value`
- JSON path selectors

### 🧠 Logic Features:
- **Nested groups**: `( ... )` with unlimited depth
- **Mixed operators**: `AND/OR/NOT` combinations
- **Validation**: Real-time syntax checking
- **Preview**: Live SQL compilation

---

## 🔄 CHUNK 3 - Sequence/Correlation [ADVANCED]
**Goal**: Investigation and detection patterns

### 🎯 Sequence Queries:
```
SEQUENCE(
  step1: event_type="login" AND outcome="success"
  THEN
  step2: event_type="file_access" AND file="/etc/passwd"  
  THEN
  step3: event_type="network" AND destination_ip="external"
) WITHIN 5m
BY user, source_ip
```

### 📊 Threshold Queries:
```
THRESHOLD count(failed_logins) BY user >= 5 WITHIN 1h
```

### 🏗️ Implementation:
- **AST extensions**: Sequence and threshold nodes
- **ClickHouse mapping**: Window functions, PARTITION BY
- **UI builder**: Timeline-based sequence designer
- **Entity correlation**: user/ip/host tracking

---

## 💾 CHUNK 4 - Saved Filters [TEMPLATES]
**Goal**: Save, share, and export filter configurations

### 🗂️ Filter Types:
1. **Search**: Quick filters for exploration
2. **Investigation**: Multi-step investigation templates
3. **Detection**: Rule-based detection patterns

### 📤 Export Formats:
- **Sigma**: Export to YAML for rule sharing
- **JSON**: Complete AST serialization
- **URL**: Shareable search links

### 🏗️ Storage:
- **Backend**: Database table for filter templates
- **Metadata**: name, description, tags, owner
- **Versioning**: Track filter evolution
- **Sharing**: Team/org visibility controls

---

## 🛡️ CHUNK 5 - MITRE & Sigma Integration [SECURITY]
**Goal**: Security-focused shortcuts and integrations

### 🎯 MITRE ATT&CK:
- **Tactic tags**: Initial Access, Execution, Persistence...
- **Technique mapping**: T1078, T1059, T1136...
- **Quick filters**: "Show all Credential Access events"
- **Coverage mapping**: Which techniques are detected

### 📜 Sigma Integration:
- **Import**: Parse Sigma YAML → Filter AST
- **Export**: Filter AST → Sigma YAML
- **Rule library**: Built-in detection templates
- **Validation**: Sigma syntax checking

### 🏗️ UI Features:
- **MITRE navigator**: Visual technique selection
- **Sigma editor**: Side-by-side YAML/visual editing
- **Rule testing**: Dry-run against sample data
- **Detection coverage**: Heatmap of monitored techniques

---

## 🔌 API Integration Strategy
**Goal**: Seamless integration with existing v2 APIs

### 🎯 Query Flow:
1. **User edits filter** → AST
2. **AST compilation** → `q = format(ast)`
3. **SQL preview** → `POST /search/compile` (catch errors early)
4. **Execute search** → `POST /search/execute` + `/aggs` + `/facets`
5. **Optional streaming** → `GET /search/tail` SSE

### 📡 Backend Compatibility:
- **Existing endpoints**: Keep using `/search/compile|execute|facets|aggs`
- **Query string format**: Enhanced but backward-compatible
- **Performance**: Optimized ClickHouse queries
- **Caching**: Smart field catalog caching

### 🎨 Frontend Architecture:
- **React components**: Modular, reusable filter pieces
- **State management**: Zustand for filter state
- **Real-time**: Live query preview and validation
- **Accessibility**: Full keyboard navigation, screen readers

---

## 📈 Performance & Scale Requirements

### ⚡ Response Times:
- **Field catalog**: P95 < 150ms
- **Value suggestions**: P95 < 100ms  
- **Query compilation**: P95 < 50ms
- **Search execution**: P95 < 2s
- **Streaming updates**: < 1s latency

### 📊 Capacity:
- **Field catalog**: Support 1000+ fields
- **Value suggestions**: Handle high-cardinality fields
- **Complex queries**: 10+ conditions, 3+ nested groups
- **Concurrent users**: 100+ simultaneous filter builders

### 🚀 Optimizations:
- **Intelligent caching**: Field metadata, common values
- **Query optimization**: ClickHouse-specific improvements
- **Lazy loading**: Progressive field discovery
- **Debounced updates**: Minimize API calls during typing

---

## 🧪 Testing Strategy

### 🔍 Unit Tests:
- AST generation and compilation
- Type-aware operator logic
- Field type normalization
- Query string formatting

### 🔗 Integration Tests:
- End-to-end filter building
- ClickHouse query execution
- Streaming updates
- Export/import functionality

### 🎭 E2E Tests:
- Complete user workflows
- Complex filter scenarios
- Performance under load
- Cross-browser compatibility

### 📊 Performance Tests:
- Field catalog loading times
- Large result set handling
- Concurrent user scenarios
- Memory usage patterns

---

## 🎯 Success Metrics

### 👥 User Experience:
- **Time to first filter**: < 30 seconds for new users
- **Complex query building**: < 5 minutes for 10+ conditions
- **Error rate**: < 1% failed searches
- **User satisfaction**: > 4.5/5 rating

### ⚡ Technical Performance:
- **API latency**: All P95 targets met
- **Frontend responsiveness**: < 100ms UI updates
- **Memory usage**: < 100MB frontend overhead
- **Backend CPU**: < 5% overhead for filtering

### 🔍 Detection Coverage:
- **MITRE coverage**: > 80% of relevant techniques
- **Alert quality**: < 5% false positive rate
- **Investigation speed**: 50% faster than manual queries
- **Rule sharing**: > 90% of teams using templates

---

## 📅 Implementation Timeline

### Phase 1 (Week 1-2): Foundation
- ✅ CHUNK 0: Routing/Proxy [DONE]
- 🔄 CHUNK 1: Field Catalog [IN PROGRESS]
- 🎯 Basic AST structure

### Phase 2 (Week 3-4): Core Filtering
- 🎨 Filter Builder UI
- 🔧 Type-aware operators
- 🔍 Real-time preview

### Phase 3 (Week 5-6): Advanced Features
- 🔄 Sequence/Correlation
- 💾 Saved filters
- 📤 Export/Import

### Phase 4 (Week 7-8): Security Integration
- 🛡️ MITRE ATT&CK mapping
- 📜 Sigma integration
- 🧪 Testing & optimization

### Phase 5 (Week 9-10): Polish & Launch
- 📊 Performance tuning
- 📚 Documentation
- 🚀 Production deployment

---

This plan delivers a **world-class SIEM filtering system** that rivals industry leaders like Splunk, Chronicle, and Elastic Security. The modular architecture ensures each chunk can be developed, tested, and deployed independently while building toward the complete vision.

## 🎯 Current Priority: Complete CHUNK 1 field catalog debugging and testing.
