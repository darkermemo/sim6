#!/usr/bin/env python3
"""
Test Harness for Improved SIEM Ingestion Pipeline

This module provides comprehensive test cases for validating the improved ingestion pipeline,
including various JSON formats, error scenarios, and edge cases.
"""

import json
import tempfile
import zipfile
import gzip
import os
import time
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime, timezone
import uuid
import shutil

from improved_ingestion_pipeline import (
    ImprovedIngestionPipeline,
    IngestionConfig,
    JSONFormat,
    ProcessingStatus
)


class TestDataGenerator:
    """Generates test data files in various formats for testing"""
    
    def __init__(self, temp_dir: Path):
        self.temp_dir = temp_dir
        self.temp_dir.mkdir(parents=True, exist_ok=True)
    
    def create_ndjson_file(self, filename: str, event_count: int = 100, 
                          include_malformed: bool = False) -> Path:
        """Create NDJSON test file"""
        file_path = self.temp_dir / filename
        
        with open(file_path, 'w') as f:
            for i in range(event_count):
                if include_malformed and i % 10 == 0:  # Every 10th line is malformed
                    f.write('{"incomplete": "json"\n')  # Missing closing brace
                else:
                    event = {
                        "EventID": 4688,
                        "TimeCreated": datetime.now(timezone.utc).isoformat(),
                        "ProcessName": f"C:\\Windows\\System32\\process_{i}.exe",
                        "CommandLine": f"process_{i}.exe --arg{i}",
                        "User": f"DOMAIN\\user{i % 5}",
                        "ProcessId": 1000 + i,
                        "LogonId": f"0x{i:06x}",
                        "nested_data": {
                            "level1": {
                                "level2": f"deep_value_{i}",
                                "array_field": [f"item_{i}_1", f"item_{i}_2"]
                            }
                        },
                        "sequence_number": i
                    }
                    f.write(json.dumps(event) + '\n')
        
        return file_path
    
    def create_json_array_file(self, filename: str, event_count: int = 50) -> Path:
        """Create JSON array test file"""
        file_path = self.temp_dir / filename
        
        events = []
        for i in range(event_count):
            event = {
                "EventID": 4625,  # Failed logon
                "TimeCreated": datetime.now(timezone.utc).isoformat(),
                "LogonType": 3,
                "Status": "0xC000006D",
                "Account": f"user{i % 3}",
                "Source": f"192.168.1.{100 + i % 50}",
                "Message": f"Failed login attempt {i}",
                "metadata": {
                    "severity": "high" if i % 5 == 0 else "medium",
                    "tags": ["authentication", "failure"],
                    "custom_fields": {
                        "attempt_number": i,
                        "source_type": "windows_security"
                    }
                }
            }
            events.append(event)
        
        with open(file_path, 'w') as f:
            json.dump(events, f, indent=2)
        
        return file_path
    
    def create_mixed_format_file(self, filename: str) -> Path:
        """Create file with mixed JSON content"""
        file_path = self.temp_dir / filename
        
        with open(file_path, 'w') as f:
            # Start with some comments/non-JSON
            f.write("# This is a log file with mixed content\n")
            f.write("# Generated on: " + datetime.now().isoformat() + "\n")
            f.write("\n")
            
            # Add some valid NDJSON lines
            for i in range(5):
                event = {
                    "EventID": 1,
                    "Message": f"System event {i}",
                    "Timestamp": datetime.now(timezone.utc).isoformat()
                }
                f.write(json.dumps(event) + '\n')
            
            # Add some invalid lines
            f.write("This is not JSON\n")
            f.write("{invalid: json}\n")
            f.write("\n")
            
            # Add more valid JSON
            for i in range(5, 10):
                event = {
                    "EventID": 2,
                    "Message": f"Application event {i}",
                    "Timestamp": datetime.now(timezone.utc).isoformat()
                }
                f.write(json.dumps(event) + '\n')
        
        return file_path
    
    def create_large_json_array_file(self, filename: str, event_count: int = 1000) -> Path:
        """Create large JSON array file for performance testing"""
        file_path = self.temp_dir / filename
        
        events = []
        for i in range(event_count):
            # Create events with varying complexity
            event = {
                "EventID": 4688,
                "TimeCreated": datetime.now(timezone.utc).isoformat(),
                "ProcessName": f"C:\\Program Files\\Application_{i % 10}\\app.exe",
                "CommandLine": f"app.exe --config config_{i}.xml --verbose --log-level debug",
                "User": f"DOMAIN\\service_account_{i % 3}",
                "ProcessId": 2000 + i,
                "ParentProcessId": 1000 + (i // 2),
                "SessionId": i % 5,
                "detailed_info": {
                    "environment_variables": {
                        "PATH": "C:\\Windows\\System32;C:\\Program Files\\Common Files",
                        "TEMP": "C:\\Temp",
                        "USER": f"service_account_{i % 3}"
                    },
                    "file_operations": [
                        {"operation": "read", "file": f"C:\\Data\\file_{i}.txt", "size": 1024 * (i % 100)},
                        {"operation": "write", "file": f"C:\\Output\\result_{i}.log", "size": 512 * (i % 50)}
                    ],
                    "network_connections": [
                        {"protocol": "TCP", "local_port": 8080 + (i % 100), "remote_host": f"server{i % 5}.domain.com"},
                        {"protocol": "UDP", "local_port": 9000 + (i % 50), "remote_host": "dns.domain.com"}
                    ]
                },
                "sequence_id": i,
                "batch_id": i // 100
            }
            events.append(event)
        
        with open(file_path, 'w') as f:
            json.dump(events, f)
        
        return file_path
    
    def create_empty_file(self, filename: str) -> Path:
        """Create empty file for edge case testing"""
        file_path = self.temp_dir / filename
        file_path.touch()
        return file_path
    
    def create_non_json_file(self, filename: str) -> Path:
        """Create non-JSON file for error testing"""
        file_path = self.temp_dir / filename
        
        with open(file_path, 'w') as f:
            f.write("This is a plain text file\n")
            f.write("It contains no JSON data\n")
            f.write("Line 3 of non-JSON content\n")
        
        return file_path
    
    def create_corrupted_json_file(self, filename: str) -> Path:
        """Create file with corrupted JSON for error testing"""
        file_path = self.temp_dir / filename
        
        with open(file_path, 'w') as f:
            # Start with valid JSON
            f.write('{"valid": "json", "number": 123}\n')
            # Add corrupted JSON
            f.write('{"corrupted": "json", "missing_quote: 456}\n')
            f.write('{"another": "valid", "entry": 789}\n')
            # Add severely corrupted line
            f.write('{{{{invalid json structure}}}}\n')
            f.write('{"final": "valid", "entry": 999}\n')
        
        return file_path
    
    def create_test_dataset_zip(self, zip_filename: str, files_config: List[Dict[str, Any]]) -> Path:
        """Create ZIP dataset with multiple test files"""
        zip_path = self.temp_dir / zip_filename
        
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file_config in files_config:
                file_type = file_config['type']
                filename = file_config['filename']
                
                # Create temporary file
                temp_file = None
                if file_type == 'ndjson':
                    temp_file = self.create_ndjson_file(
                        filename, 
                        file_config.get('event_count', 100),
                        file_config.get('include_malformed', False)
                    )
                elif file_type == 'json_array':
                    temp_file = self.create_json_array_file(
                        filename,
                        file_config.get('event_count', 50)
                    )
                elif file_type == 'mixed':
                    temp_file = self.create_mixed_format_file(filename)
                elif file_type == 'empty':
                    temp_file = self.create_empty_file(filename)
                elif file_type == 'non_json':
                    temp_file = self.create_non_json_file(filename)
                elif file_type == 'corrupted':
                    temp_file = self.create_corrupted_json_file(filename)
                
                if temp_file:
                    zipf.write(temp_file, filename)
        
        return zip_path


class IngestionTestSuite:
    """Comprehensive test suite for the improved ingestion pipeline"""
    
    def __init__(self):
        self.temp_dir = Path(tempfile.mkdtemp(prefix="siem_test_"))
        self.data_generator = TestDataGenerator(self.temp_dir)
        self.test_results = []
    
    def run_all_tests(self) -> Dict[str, Any]:
        """Run all test cases and return comprehensive results"""
        print("🧪 Starting Comprehensive Ingestion Pipeline Tests")
        print("=" * 60)
        
        test_methods = [
            self.test_ndjson_processing,
            self.test_json_array_processing,
            self.test_mixed_format_processing,
            self.test_large_file_processing,
            self.test_error_handling,
            self.test_format_detection,
            self.test_validation_features,
            self.test_metrics_collection,
            self.test_dataset_processing,
            self.test_performance_limits
        ]
        
        overall_start = time.time()
        
        for test_method in test_methods:
            try:
                print(f"\n📋 Running {test_method.__name__}...")
                result = test_method()
                self.test_results.append(result)
                status = "✅ PASS" if result['passed'] else "❌ FAIL"
                print(f"   {status} - {result['description']}")
            except Exception as e:
                error_result = {
                    'test_name': test_method.__name__,
                    'passed': False,
                    'description': f"Test failed with exception: {str(e)}",
                    'error': str(e),
                    'duration_seconds': 0
                }
                self.test_results.append(error_result)
                print(f"   ❌ ERROR - {str(e)}")
        
        overall_duration = time.time() - overall_start
        
        # Generate summary
        passed_tests = sum(1 for r in self.test_results if r['passed'])
        total_tests = len(self.test_results)
        
        summary = {
            'total_tests': total_tests,
            'passed_tests': passed_tests,
            'failed_tests': total_tests - passed_tests,
            'success_rate': (passed_tests / total_tests) * 100 if total_tests > 0 else 0,
            'total_duration_seconds': overall_duration,
            'test_results': self.test_results
        }
        
        print(f"\n📊 Test Summary:")
        print(f"   Total Tests: {total_tests}")
        print(f"   Passed: {passed_tests}")
        print(f"   Failed: {total_tests - passed_tests}")
        print(f"   Success Rate: {summary['success_rate']:.1f}%")
        print(f"   Total Duration: {overall_duration:.2f}s")
        
        return summary
    
    def test_ndjson_processing(self) -> Dict[str, Any]:
        """Test NDJSON format processing"""
        start_time = time.time()
        
        # Create test NDJSON file
        ndjson_file = self.data_generator.create_ndjson_file("test_events.json", 100)
        
        # Configure pipeline
        config = IngestionConfig(
            max_events_per_file=1000,
            enable_format_detection=True,
            log_level="DEBUG"
        )
        
        pipeline = ImprovedIngestionPipeline(config)
        
        try:
            # Process file
            result = pipeline.process_file(ndjson_file, "test_dataset", "tenant-test")
            
            success = (
                result.status in [ProcessingStatus.SUCCESS, ProcessingStatus.PARTIAL_SUCCESS] and
                result.events_processed > 0 and
                result.detected_format == JSONFormat.NDJSON
            )
            
            return {
                'test_name': 'test_ndjson_processing',
                'passed': success,
                'description': f"NDJSON processing: {result.events_processed} events, {result.events_failed} failed",
                'duration_seconds': time.time() - start_time,
                'details': {
                    'events_processed': result.events_processed,
                    'events_failed': result.events_failed,
                    'detected_format': result.detected_format.value,
                    'status': result.status.value
                }
            }
        
        finally:
            pipeline.cleanup()
    
    def test_json_array_processing(self) -> Dict[str, Any]:
        """Test JSON array format processing"""
        start_time = time.time()
        
        # Create test JSON array file
        array_file = self.data_generator.create_json_array_file("test_array.json", 50)
        
        config = IngestionConfig(
            max_events_per_file=1000,
            enable_format_detection=True,
            log_level="DEBUG"
        )
        
        pipeline = ImprovedIngestionPipeline(config)
        
        try:
            result = pipeline.process_file(array_file, "test_dataset", "tenant-test")
            
            success = (
                result.status in [ProcessingStatus.SUCCESS, ProcessingStatus.PARTIAL_SUCCESS] and
                result.events_processed > 0 and
                result.detected_format == JSONFormat.JSON_ARRAY
            )
            
            return {
                'test_name': 'test_json_array_processing',
                'passed': success,
                'description': f"JSON array processing: {result.events_processed} events, format: {result.detected_format.value}",
                'duration_seconds': time.time() - start_time,
                'details': {
                    'events_processed': result.events_processed,
                    'events_failed': result.events_failed,
                    'detected_format': result.detected_format.value,
                    'status': result.status.value
                }
            }
        
        finally:
            pipeline.cleanup()
    
    def test_mixed_format_processing(self) -> Dict[str, Any]:
        """Test mixed format file processing"""
        start_time = time.time()
        
        mixed_file = self.data_generator.create_mixed_format_file("test_mixed.json")
        
        config = IngestionConfig(
            max_events_per_file=1000,
            enable_format_detection=True,
            continue_on_parse_errors=True,
            log_level="DEBUG"
        )
        
        pipeline = ImprovedIngestionPipeline(config)
        
        try:
            result = pipeline.process_file(mixed_file, "test_dataset", "tenant-test")
            
            # Mixed format should be detected and some events should be processed
            success = (
                result.detected_format == JSONFormat.MIXED and
                result.events_processed > 0
            )
            
            return {
                'test_name': 'test_mixed_format_processing',
                'passed': success,
                'description': f"Mixed format processing: {result.events_processed} events, {result.parse_errors} parse errors",
                'duration_seconds': time.time() - start_time,
                'details': {
                    'events_processed': result.events_processed,
                    'events_failed': result.events_failed,
                    'parse_errors': result.parse_errors,
                    'detected_format': result.detected_format.value,
                    'status': result.status.value
                }
            }
        
        finally:
            pipeline.cleanup()
    
    def test_large_file_processing(self) -> Dict[str, Any]:
        """Test large file processing and limits"""
        start_time = time.time()
        
        large_file = self.data_generator.create_large_json_array_file("test_large.json", 1000)
        
        config = IngestionConfig(
            max_events_per_file=500,  # Limit to test truncation
            enable_format_detection=True,
            log_level="INFO"
        )
        
        pipeline = ImprovedIngestionPipeline(config)
        
        try:
            result = pipeline.process_file(large_file, "test_dataset", "tenant-test")
            
            # Should process up to the limit
            success = (
                result.status in [ProcessingStatus.SUCCESS, ProcessingStatus.PARTIAL_SUCCESS] and
                result.events_processed <= config.max_events_per_file
            )
            
            return {
                'test_name': 'test_large_file_processing',
                'passed': success,
                'description': f"Large file processing: {result.events_processed} events (limit: {config.max_events_per_file})",
                'duration_seconds': time.time() - start_time,
                'details': {
                    'events_processed': result.events_processed,
                    'events_failed': result.events_failed,
                    'limit_applied': result.events_processed <= config.max_events_per_file,
                    'status': result.status.value
                }
            }
        
        finally:
            pipeline.cleanup()
    
    def test_error_handling(self) -> Dict[str, Any]:
        """Test error handling with various problematic files"""
        start_time = time.time()
        
        # Test files with different error conditions
        test_files = [
            ('empty.json', self.data_generator.create_empty_file("empty.json")),
            ('non_json.txt', self.data_generator.create_non_json_file("non_json.txt")),
            ('corrupted.json', self.data_generator.create_corrupted_json_file("corrupted.json")),
            ('malformed.json', self.data_generator.create_ndjson_file("malformed.json", 20, include_malformed=True))
        ]
        
        config = IngestionConfig(
            continue_on_parse_errors=True,
            max_parse_errors_per_file=50,
            log_level="DEBUG"
        )
        
        pipeline = ImprovedIngestionPipeline(config)
        
        try:
            results = []
            for filename, file_path in test_files:
                result = pipeline.process_file(file_path, "test_dataset", "tenant-test")
                results.append((filename, result))
            
            # Check that errors were handled gracefully (no crashes)
            success = all(result.status != ProcessingStatus.FAILED or result.error_message for _, result in results)
            
            error_summary = []
            for filename, result in results:
                error_summary.append({
                    'file': filename,
                    'status': result.status.value,
                    'events_processed': result.events_processed,
                    'parse_errors': result.parse_errors,
                    'error_message': result.error_message
                })
            
            return {
                'test_name': 'test_error_handling',
                'passed': success,
                'description': f"Error handling test: {len(test_files)} problematic files processed gracefully",
                'duration_seconds': time.time() - start_time,
                'details': {
                    'files_tested': len(test_files),
                    'error_summary': error_summary
                }
            }
        
        finally:
            pipeline.cleanup()
    
    def test_format_detection(self) -> Dict[str, Any]:
        """Test JSON format detection accuracy"""
        start_time = time.time()
        
        # Create files with known formats
        test_files = [
            ('ndjson', self.data_generator.create_ndjson_file("format_test_ndjson.json", 10)),
            ('json_array', self.data_generator.create_json_array_file("format_test_array.json", 10)),
            ('mixed', self.data_generator.create_mixed_format_file("format_test_mixed.json")),
            ('empty', self.data_generator.create_empty_file("format_test_empty.json"))
        ]
        
        config = IngestionConfig(
            enable_format_detection=True,
            format_detection_lines=20,
            log_level="DEBUG"
        )
        
        pipeline = ImprovedIngestionPipeline(config)
        
        try:
            detection_results = []
            correct_detections = 0
            
            for expected_format, file_path in test_files:
                result = pipeline.process_file(file_path, "test_dataset", "tenant-test")
                
                detected = result.detected_format.value
                expected = expected_format
                
                # Map expected formats to enum values
                format_mapping = {
                    'ndjson': 'ndjson',
                    'json_array': 'json_array',
                    'mixed': 'mixed',
                    'empty': 'unknown'  # Empty files should be detected as unknown
                }
                
                is_correct = detected == format_mapping.get(expected, expected)
                if is_correct:
                    correct_detections += 1
                
                detection_results.append({
                    'file': file_path.name,
                    'expected': expected,
                    'detected': detected,
                    'correct': is_correct
                })
            
            accuracy = (correct_detections / len(test_files)) * 100
            success = accuracy >= 75  # At least 75% accuracy
            
            return {
                'test_name': 'test_format_detection',
                'passed': success,
                'description': f"Format detection accuracy: {accuracy:.1f}% ({correct_detections}/{len(test_files)})",
                'duration_seconds': time.time() - start_time,
                'details': {
                    'accuracy_percent': accuracy,
                    'correct_detections': correct_detections,
                    'total_files': len(test_files),
                    'detection_results': detection_results
                }
            }
        
        finally:
            pipeline.cleanup()
    
    def test_validation_features(self) -> Dict[str, Any]:
        """Test data validation features"""
        start_time = time.time()
        
        # Create file with events missing required fields
        validation_file = self.temp_dir / "validation_test.json"
        
        with open(validation_file, 'w') as f:
            # Valid event with required fields
            f.write(json.dumps({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "source": "test_source",
                "message": "Valid event"
            }) + '\n')
            
            # Invalid event missing timestamp
            f.write(json.dumps({
                "source": "test_source",
                "message": "Missing timestamp"
            }) + '\n')
            
            # Invalid event missing source
            f.write(json.dumps({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "message": "Missing source"
            }) + '\n')
            
            # Empty event
            f.write(json.dumps({}) + '\n')
        
        config = IngestionConfig(
            enable_validation=True,
            required_fields=["timestamp", "source"],
            log_level="DEBUG"
        )
        
        pipeline = ImprovedIngestionPipeline(config)
        
        try:
            result = pipeline.process_file(validation_file, "test_dataset", "tenant-test")
            
            # Should have validation errors for invalid events
            success = (
                result.events_processed > 0 and  # At least one valid event
                result.validation_errors > 0     # Some validation errors detected
            )
            
            return {
                'test_name': 'test_validation_features',
                'passed': success,
                'description': f"Validation test: {result.events_processed} valid, {result.validation_errors} validation errors",
                'duration_seconds': time.time() - start_time,
                'details': {
                    'events_processed': result.events_processed,
                    'events_failed': result.events_failed,
                    'validation_errors': result.validation_errors,
                    'status': result.status.value
                }
            }
        
        finally:
            pipeline.cleanup()
    
    def test_metrics_collection(self) -> Dict[str, Any]:
        """Test metrics collection functionality"""
        start_time = time.time()
        
        ndjson_file = self.data_generator.create_ndjson_file("metrics_test.json", 50)
        
        config = IngestionConfig(
            enable_metrics=True,
            log_level="INFO"
        )
        
        pipeline = ImprovedIngestionPipeline(config)
        
        try:
            # Process file to generate metrics
            result = pipeline.process_file(ndjson_file, "metrics_test_dataset", "tenant-metrics")
            
            # Check that metrics collector was initialized
            success = (
                pipeline.metrics is not None and
                result.events_processed > 0
            )
            
            return {
                'test_name': 'test_metrics_collection',
                'passed': success,
                'description': f"Metrics collection: pipeline initialized with metrics, {result.events_processed} events processed",
                'duration_seconds': time.time() - start_time,
                'details': {
                    'metrics_enabled': pipeline.metrics.enabled,
                    'events_processed': result.events_processed
                }
            }
        
        finally:
            pipeline.cleanup()
    
    def test_dataset_processing(self) -> Dict[str, Any]:
        """Test complete dataset processing (ZIP files)"""
        start_time = time.time()
        
        # Create test dataset ZIP
        files_config = [
            {'type': 'ndjson', 'filename': 'security_events.json', 'event_count': 100},
            {'type': 'json_array', 'filename': 'auth_logs.json', 'event_count': 50},
            {'type': 'mixed', 'filename': 'mixed_logs.json'},
            {'type': 'empty', 'filename': 'empty_file.json'}
        ]
        
        dataset_zip = self.data_generator.create_test_dataset_zip("test_dataset.zip", files_config)
        
        config = IngestionConfig(
            max_events_per_dataset=200,
            enable_format_detection=True,
            continue_on_parse_errors=True,
            log_level="INFO"
        )
        
        pipeline = ImprovedIngestionPipeline(config)
        
        try:
            events, metrics = pipeline.process_dataset(dataset_zip, "tenant-dataset-test")
            
            success = (
                metrics.files_processed > 0 and
                metrics.events_processed > 0 and
                metrics.datasets_processed == 1
            )
            
            return {
                'test_name': 'test_dataset_processing',
                'passed': success,
                'description': f"Dataset processing: {metrics.files_processed} files, {metrics.events_processed} events",
                'duration_seconds': time.time() - start_time,
                'details': {
                    'files_processed': metrics.files_processed,
                    'files_failed': metrics.files_failed,
                    'events_processed': metrics.events_processed,
                    'events_failed': metrics.events_failed,
                    'processing_time': metrics.processing_time_seconds
                }
            }
        
        finally:
            pipeline.cleanup()
    
    def test_performance_limits(self) -> Dict[str, Any]:
        """Test performance limits and resource management"""
        start_time = time.time()
        
        # Create large dataset to test limits
        large_file = self.data_generator.create_large_json_array_file("performance_test.json", 2000)
        
        config = IngestionConfig(
            max_events_per_file=100,  # Low limit to test truncation
            max_file_size_mb=1,       # Small size limit
            batch_size=50,
            log_level="INFO"
        )
        
        pipeline = ImprovedIngestionPipeline(config)
        
        try:
            result = pipeline.process_file(large_file, "performance_dataset", "tenant-perf")
            
            # Check that limits were respected
            success = (
                result.events_processed <= config.max_events_per_file and
                result.processing_time_seconds < 30  # Should complete within reasonable time
            )
            
            return {
                'test_name': 'test_performance_limits',
                'passed': success,
                'description': f"Performance limits: {result.events_processed} events (limit: {config.max_events_per_file}), {result.processing_time_seconds:.2f}s",
                'duration_seconds': time.time() - start_time,
                'details': {
                    'events_processed': result.events_processed,
                    'events_limit': config.max_events_per_file,
                    'processing_time': result.processing_time_seconds,
                    'limit_respected': result.events_processed <= config.max_events_per_file
                }
            }
        
        finally:
            pipeline.cleanup()
    
    def cleanup(self):
        """Clean up test resources"""
        try:
            if self.temp_dir.exists():
                shutil.rmtree(self.temp_dir)
        except Exception as e:
            print(f"Warning: Failed to cleanup test directory: {e}")


def main():
    """Run the complete test suite"""
    test_suite = IngestionTestSuite()
    
    try:
        results = test_suite.run_all_tests()
        
        # Save results to file
        results_file = Path("ingestion_test_results.json")
        with open(results_file, 'w') as f:
            json.dump(results, f, indent=2, default=str)
        
        print(f"\n📄 Detailed results saved to: {results_file}")
        
        # Return exit code based on success rate
        if results['success_rate'] >= 80:
            print("\n🎉 Test suite PASSED (≥80% success rate)")
            return 0
        else:
            print("\n❌ Test suite FAILED (<80% success rate)")
            return 1
    
    finally:
        test_suite.cleanup()


if __name__ == "__main__":
    exit(main())