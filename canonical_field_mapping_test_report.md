# Canonical Field Mapping Engine Test Report

Generated: Mon Jul 28 22:00:03 +03 2025

## Test Summary

- **Total Tests**: 9
- **Passed**: 8
- **Failed**: 1
- **Success Rate**: 88%

## Test Results

| Test Case | Expected Result | Status |
|-----------|----------------|--------|
| Rust Unit Tests | All canonical field mapping tests passed | ✅ PASSED |
| Submit logs with known aliases | Expected pattern found: source_ip | ✅ PASSED |
| Submit logs with unknown fields | Expected pattern found: additional_fields | ✅ PASSED |
| Submit logs with conflicting aliases | Expected pattern found: url | ✅ PASSED |
| Case-insensitive alias match | Expected pattern found: source_ip | ✅ PASSED |
| Resolution debug output | Expected pattern found: ALIAS RESOLUTION TRACE | ✅ PASSED |
| Comprehensive field mapping | Expected pattern found: CANONICAL FIELDS | ✅ PASSED |
| Field arguments test | Execution successful | ✅ PASSED |
| API Tests | SIEM system not available | ⏭️ SKIPPED |

## Test Cases Implemented

### ✅ Test Case: Submit logs with known aliases
- **Input**: `{"src_ip": "192.168.0.1", "eventName": "login_success"}`
- **Expected**: Mapped to source.ip, event.action
- **Verification**: Fields not in additional_fields

### ✅ Test Case: Submit logs with unknown fields
- **Input**: `{"foobar_field": "unexpected"}`
- **Expected**: Stored in additional_fields
- **Verification**: No structured fields populated

### ✅ Test Case: Submit logs with conflicting aliases
- **Input**: `{"uri": "http://example.com/old", "url": "http://example.com/preferred"}`
- **Expected**: url wins due to higher priority
- **Verification**: url.original = preferred URL

### ✅ Test Case: Case-insensitive alias match
- **Input**: `{"SRC_IP": "10.0.0.1"}`
- **Expected**: source.ip matched
- **Verification**: No entry in additional_fields

### ✅ Test Case: Resolution debug output
- **Input**: `{"eventName": "access_granted"}`
- **Expected**: Debug trace shows alias resolution
- **Verification**: Includes alias used and priority

## Files Generated

- Test log files in `test_logs/` directory
- This test report: `canonical_field_mapping_test_report.md`
- Rust test module: `siem_parser/src/canonical_field_mapping_engine_tests.rs`

## Usage

To run these tests again:

```bash
./test_canonical_field_mapping.sh
```

To run only Rust tests:

```bash
cd siem_parser && cargo test canonical_field_mapping_engine_tests --lib -- --nocapture
```

To test individual cases with the CLI:

```bash
siem_parser/target/release/siem_parser --show-alias-trace --input test_logs/known_aliases.json
```
