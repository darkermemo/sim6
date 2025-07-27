# SIEM Project Cursor Rules

This directory contains comprehensive development rules for the SIEM project. These rules enforce coding standards, testing requirements, and development workflows.

## Available Rules

### 1. **UI Architecture Rules** (`ui-architecture.mdc`)
**4-Phase Backend-First Development Process**
- 🔍 **DISCOVER**: Route discovery from Rust backend
- 🎨 **DESIGN**: UI mapping and data flow decisions  
- 🛠️ **GENERATE**: TypeScript interfaces and React components
- 🧪 **TEST**: Unit and E2E test implementation

**Usage**: For ANY React component development
**Key Requirement**: Always start by examining `siem_api/src/*.rs` files first

### 2. **Rust Backend Compilation** (`rust-backend-compilation.mdc`)
**Zero-Tolerance Compilation Requirements**
- ✅ Full workspace compilation verification
- ❌ Zero compilation errors/warnings tolerated
- 🧪 Comprehensive testing mandate
- 🔒 Security audit requirements

**Usage**: Before claiming ANY Rust component "works"
**Key Requirement**: `cargo build --release --all` must pass with zero errors

### 3. **UI Testing & Verification** (`ui-testing-verification.mdc`)
**Comprehensive Frontend Testing Protocol**
- 🔍 Runtime error verification (browser console)
- 🔄 Backend-frontend alignment verification
- 🧪 Functional testing protocol
- 📝 Documentation requirements

**Usage**: Before claiming ANY UI component "complete"
**Key Requirement**: Zero browser console errors tolerated

### 4. **Critical Quality Gates** (`critical-quality-gates.mdc`) 🚨 **CRITICAL**
**10 Essential Rules for Production Excellence**
- 🔒 **Regression Prevention Protocol**: Mandatory before/after change verification
- 🔐 **API Schema Immutability**: Zero-tolerance for breaking changes
- ⚡ **Infinite Loop Prevention**: React anti-pattern detection
- 🛡️ **Security-First Development**: SIEM-specific security requirements
- 🚀 **Performance Guarantee**: Strict performance budgets
- 🚨 **Comprehensive Error Boundary**: Bulletproof error handling
- 📡 **Real-Time Reliability**: SSE/WebSocket best practices
- 💾 **Data Integrity Guarantee**: Database consistency requirements
- ♿ **Accessibility Compliance**: Legal and UX requirements
- 📚 **Documentation-Driven Development**: Comprehensive docs mandate

**Usage**: MANDATORY for EVERY prompt, commit, and deployment
**Key Requirement**: ALL 10 rules must be followed - ZERO TOLERANCE for violations

### 5. **Lessons Learned & Regression Prevention** (`lessons-learned-regression-prevention.mdc`) 🎓 **NEW & CRITICAL**
**Systematic Learning from Failures Protocol**
- 📋 **Mandatory Lessons Process**: 5 Whys root cause analysis
- 🔍 **Comprehensive Issue Analysis**: Impact assessment and contributing factors
- 📝 **Structured Documentation**: Required lessons learned templates
- 🔄 **Systematic Prevention**: Code/architecture/process level safeguards
- 📚 **Knowledge Management**: Searchable lessons database
- 🎯 **Team Learning**: Weekly sessions and knowledge sharing
- 🔍 **Continuous Improvement**: KPIs and success metrics
- 🚨 **Enforcement**: Zero tolerance for skipping lessons learned

**Usage**: MANDATORY for ALL major issues, bugs, and failures
**Key Requirement**: Every critical incident MUST produce documented lessons and prevention measures

## How to Use These Rules

### In Cursor Chat:
```
@rules critical-quality-gates
# References the 10 critical quality gates (USE FOR EVERY PROMPT)

@rules lessons-learned-regression-prevention
# References the lessons learned protocol (USE FOR ALL MAJOR ISSUES)

@rules ui-architecture
# References the UI architecture rules

@rules rust-backend-compilation  
# References the Rust compilation rules

@rules ui-testing-verification
# References the UI testing rules
```

### For New Component Development:
1. **Start with**: `@rules critical-quality-gates` (MANDATORY)
2. **Then**: `@rules ui-architecture`
3. **During Rust work**: `@rules rust-backend-compilation`
4. **Before completion**: `@rules ui-testing-verification`
5. **After any issues**: `@rules lessons-learned-regression-prevention`

### Quality Gates:
- 🚫 **No React component** without following 4-phase process
- 🚫 **No Rust code** without zero-error compilation
- 🚫 **No feature complete** without comprehensive testing
- 🚫 **No deployment** without passing ALL 10 critical quality gates
- 🚫 **No major issue** without lessons learned documentation

## Rule Priority Hierarchy

### **TIER 1: CRITICAL (ZERO TOLERANCE)**
1. **Critical Quality Gates** - MANDATORY for every prompt
2. **Lessons Learned Protocol** - MANDATORY for every major issue
3. **Security vulnerabilities** - IMMEDIATE fix required
4. **Data corruption risks** - IMMEDIATE investigation
5. **Infinite loops/performance** - BLOCK deployment

### **TIER 2: ESSENTIAL (MUST FIX)**
1. **UI Architecture compliance** - Backend-first development
2. **Rust compilation requirements** - Zero errors/warnings
3. **Testing verification** - Comprehensive coverage

### **TIER 3: IMPORTANT (SHOULD FIX)**
1. **Documentation updates** - Keep current
2. **Code style consistency** - Follow patterns
3. **Performance optimizations** - Continuous improvement

## Enforcement

### **AUTOMATIC BLOCKS:**
- Security vulnerabilities detected
- Infinite loops/performance regressions
- API breaking changes without versioning
- Missing error handling
- Accessibility violations
- Test failures
- **Major issues without lessons learned documentation**

### **MANUAL REVIEWS REQUIRED:**
- Architecture changes
- Database schema modifications
- Authentication/authorization changes
- Real-time feature additions
- New API endpoints
- **Any incident requiring root cause analysis**

### **DEPLOYMENT GATES:**
```bash
# ALL must pass before production deployment:
✅ Zero console errors/warnings
✅ All tests passing (unit + integration + E2E)
✅ Performance budget met
✅ Security audit clean
✅ Accessibility compliance verified
✅ Documentation updated and validated
✅ Regression testing completed
✅ Code review approved by 2+ developers
✅ Staging environment validated
✅ Rollback plan documented
✅ Lessons learned from past issues applied
```

## Emergency Procedures

### **Critical Bug Response:**
1. 🚨 **IMMEDIATE**: Stop all deployments
2. 🔍 **INVESTIGATE**: Root cause analysis
3. 🔧 **FIX**: Implement solution with tests
4. 🧪 **VERIFY**: Comprehensive regression testing
5. 📝 **DOCUMENT**: Update prevention measures
6. 🚀 **DEPLOY**: With additional monitoring
7. 🎓 **LEARN**: Complete lessons learned documentation

### **Security Incident Response:**
1. 🛡️ **IMMEDIATE**: Patch critical vulnerabilities
2. 🔒 **ASSESS**: Impact and data exposure
3. 📊 **AUDIT**: All related code paths
4. 🧪 **TEST**: Security scenarios comprehensively
5. 📝 **REPORT**: Security review documentation
6. 🔄 **IMPROVE**: Enhanced security measures
7. 🎓 **LEARN**: Document security lessons for future prevention

## Lessons Learned Integration

### **Weekly Protocol:**
- **Every Friday 3:00 PM**: Lessons learned session (30 min)
- **Review week's incidents**: Document and discuss
- **Share insights**: Cross-team knowledge transfer
- **Plan prevention**: Implement safeguards

### **Monthly Protocol:**
- **Last Friday of month**: Deep dive session (60 min)
- **Pattern recognition**: Identify recurring issues
- **Architecture review**: System-wide improvements
- **Process enhancement**: Workflow optimizations

### **Critical Incident Protocol:**
- **Within 24 hours**: Complete lessons learned documentation
- **Within 1 week**: Implement prevention measures
- **Within 1 month**: Verify prevention effectiveness
- **Quarterly**: Review all lessons for patterns

These rules are **MANDATORY** and enforce:
- Perfect backend-frontend alignment
- Zero compilation errors/warnings
- Comprehensive testing coverage
- Production-ready code quality
- **CRITICAL SECURITY REQUIREMENTS**
- **SYSTEMATIC LEARNING FROM FAILURES**
- **ZERO REPEAT INCIDENTS**

**Remember**: This is a critical security SIEM system. Every error could mean missing security threats. Every lesson learned could prevent future breaches. **EXCELLENCE AND CONTINUOUS LEARNING ARE MANDATORY.** 