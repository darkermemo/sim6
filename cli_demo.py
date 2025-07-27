#!/usr/bin/env python3
"""
CLI Demo for Improved SIEM Ingestion Pipeline

This script demonstrates how to use the improved ingestion pipeline
with various configuration options and real-world scenarios.
"""

import click
import json
import sys
import time
from pathlib import Path
from typing import Optional, List
from datetime import datetime

from improved_ingestion_pipeline import (
    ImprovedIngestionPipeline,
    IngestionConfig,
    ProcessingStatus
)
from monitoring_config import MonitoringConfigManager, generate_all_monitoring_configs


@click.group()
@click.option('--config', '-c', type=click.Path(exists=True), help='Configuration file path')
@click.option('--verbose', '-v', is_flag=True, help='Enable verbose logging')
@click.option('--debug', is_flag=True, help='Enable debug mode')
@click.pass_context
def cli(ctx, config, verbose, debug):
    """SIEM Ingestion Pipeline CLI Tool"""
    ctx.ensure_object(dict)
    ctx.obj['config_file'] = config
    ctx.obj['verbose'] = verbose
    ctx.obj['debug'] = debug
    
    # Set up logging level
    log_level = "DEBUG" if debug else ("INFO" if verbose else "WARNING")
    ctx.obj['log_level'] = log_level


@cli.command()
@click.argument('dataset_path', type=click.Path(exists=True))
@click.option('--tenant', '-t', default='default', help='Tenant identifier')
@click.option('--max-events', type=int, help='Maximum events to process')
@click.option('--batch-size', type=int, help='Batch size for processing')
@click.option('--format-detection/--no-format-detection', default=True, help='Enable/disable format detection')
@click.option('--validation/--no-validation', default=True, help='Enable/disable data validation')
@click.option('--metrics/--no-metrics', default=True, help='Enable/disable metrics collection')
@click.option('--output', '-o', type=click.Path(), help='Output file for processed events')
@click.pass_context
def process(ctx, dataset_path, tenant, max_events, batch_size, format_detection, validation, metrics, output):
    """Process a dataset through the ingestion pipeline"""
    
    click.echo(f"🚀 Processing dataset: {dataset_path}")
    click.echo(f"📊 Tenant: {tenant}")
    
    # Create configuration
    config = IngestionConfig(
        max_events_per_dataset=max_events or 10000,
        batch_size=batch_size or 1000,
        enable_format_detection=format_detection,
        enable_validation=validation,
        enable_metrics=metrics,
        log_level=ctx.obj['log_level'],
        required_fields=['timestamp'] if validation else []
    )
    
    # Initialize pipeline
    pipeline = ImprovedIngestionPipeline(config)
    
    try:
        start_time = time.time()
        
        # Process dataset
        events, metrics_result = pipeline.process_dataset(Path(dataset_path), tenant)
        
        processing_time = time.time() - start_time
        
        # Display results
        click.echo("\n📈 Processing Results:")
        click.echo(f"   Files processed: {metrics_result.files_processed}")
        click.echo(f"   Files failed: {metrics_result.files_failed}")
        click.echo(f"   Events processed: {metrics_result.events_processed}")
        click.echo(f"   Events failed: {metrics_result.events_failed}")
        click.echo(f"   Processing time: {processing_time:.2f}s")
        click.echo(f"   Average EPS: {metrics_result.events_processed / processing_time:.1f}")
        
        if metrics_result.parse_errors > 0:
            click.echo(f"   ⚠️  Parse errors: {metrics_result.parse_errors}")
        
        if metrics_result.validation_errors > 0:
            click.echo(f"   ⚠️  Validation errors: {metrics_result.validation_errors}")
        
        # Save events to output file if specified
        if output and events:
            output_path = Path(output)
            with open(output_path, 'w') as f:
                for event in events:
                    f.write(json.dumps(event) + '\n')
            click.echo(f"\n💾 Events saved to: {output_path}")
        
        # Show sample events
        if events and ctx.obj['verbose']:
            click.echo("\n📋 Sample Events:")
            for i, event in enumerate(events[:3]):
                click.echo(f"   Event {i+1}: {json.dumps(event, indent=2)[:200]}...")
        
        click.echo("\n✅ Processing completed successfully!")
        
    except Exception as e:
        click.echo(f"\n❌ Processing failed: {str(e)}", err=True)
        if ctx.obj['debug']:
            import traceback
            traceback.print_exc()
        sys.exit(1)
    
    finally:
        pipeline.cleanup()


@cli.command()
@click.argument('file_path', type=click.Path(exists=True))
@click.option('--tenant', '-t', default='default', help='Tenant identifier')
@click.option('--dataset', '-d', default='test_dataset', help='Dataset name')
@click.option('--show-events', is_flag=True, help='Display processed events')
@click.pass_context
def analyze(ctx, file_path, tenant, dataset, show_events):
    """Analyze a single file and show detailed information"""
    
    click.echo(f"🔍 Analyzing file: {file_path}")
    
    config = IngestionConfig(
        enable_format_detection=True,
        enable_validation=True,
        log_level=ctx.obj['log_level'],
        max_events_per_file=100  # Limit for analysis
    )
    
    pipeline = ImprovedIngestionPipeline(config)
    
    try:
        start_time = time.time()
        
        # Process single file
        result = pipeline.process_file(Path(file_path), dataset, tenant)
        
        processing_time = time.time() - start_time
        
        # Display detailed analysis
        click.echo("\n📊 File Analysis Results:")
        click.echo(f"   File size: {Path(file_path).stat().st_size:,} bytes")
        click.echo(f"   Detected format: {result.detected_format.value}")
        click.echo(f"   Processing status: {result.status.value}")
        click.echo(f"   Events processed: {result.events_processed}")
        click.echo(f"   Events failed: {result.events_failed}")
        click.echo(f"   Parse errors: {result.parse_errors}")
        click.echo(f"   Validation errors: {result.validation_errors}")
        click.echo(f"   Processing time: {processing_time:.3f}s")
        
        if result.events_processed > 0:
            click.echo(f"   Events per second: {result.events_processed / processing_time:.1f}")
        
        if result.error_message:
            click.echo(f"   ⚠️  Error: {result.error_message}")
        
        # Show events if requested
        if show_events and hasattr(result, 'sample_events'):
            click.echo("\n📋 Sample Events:")
            for i, event in enumerate(result.sample_events[:5]):
                click.echo(f"   Event {i+1}:")
                click.echo(f"   {json.dumps(event, indent=4)}")
                click.echo()
        
        # Recommendations
        click.echo("\n💡 Recommendations:")
        if result.parse_errors > 0:
            click.echo("   - Consider enabling 'continue_on_parse_errors' for production")
        
        if result.validation_errors > 0:
            click.echo("   - Review validation rules or data quality")
        
        if processing_time > 10:
            click.echo("   - Consider using streaming parsing for large files")
        
        if result.detected_format.value == 'unknown':
            click.echo("   - File format could not be determined, check file content")
        
    except Exception as e:
        click.echo(f"\n❌ Analysis failed: {str(e)}", err=True)
        if ctx.obj['debug']:
            import traceback
            traceback.print_exc()
        sys.exit(1)
    
    finally:
        pipeline.cleanup()


@cli.command()
@click.option('--output-dir', '-o', type=click.Path(), default='monitoring_configs', help='Output directory for configs')
def setup_monitoring(output_dir):
    """Generate monitoring configuration files"""
    
    click.echo("🔧 Setting up monitoring configuration...")
    
    output_path = Path(output_dir)
    
    try:
        generate_all_monitoring_configs(output_path)
        
        click.echo(f"\n✅ Monitoring configuration generated in: {output_path}")
        click.echo("\n📋 Generated files:")
        
        for file_path in output_path.glob('*'):
            click.echo(f"   - {file_path.name}")
        
        click.echo("\n🚀 Next steps:")
        click.echo(f"   1. cd {output_path}")
        click.echo("   2. ./setup_monitoring.sh")
        click.echo("   3. Start monitoring services")
        
    except Exception as e:
        click.echo(f"\n❌ Setup failed: {str(e)}", err=True)
        sys.exit(1)


@cli.command()
@click.option('--port', '-p', type=int, default=8000, help='Metrics server port')
@click.option('--host', '-h', default='localhost', help='Metrics server host')
@click.option('--duration', '-d', type=int, default=60, help='Run duration in seconds')
def metrics_server(port, host, duration):
    """Start a metrics server for testing"""
    
    click.echo(f"📊 Starting metrics server on {host}:{port}")
    click.echo(f"⏱️  Will run for {duration} seconds")
    
    try:
        from prometheus_client import start_http_server, Counter, Histogram, Gauge
        import random
        
        # Create sample metrics
        events_counter = Counter('siem_ingestion_events_total', 'Total events processed', ['tenant', 'status'])
        processing_histogram = Histogram('siem_ingestion_processing_duration_seconds', 'Processing duration')
        active_workers = Gauge('siem_ingestion_active_workers', 'Active workers')
        
        # Start metrics server
        start_http_server(port, addr=host)
        
        click.echo(f"\n✅ Metrics server started: http://{host}:{port}/metrics")
        
        # Generate sample metrics
        start_time = time.time()
        while time.time() - start_time < duration:
            # Simulate processing events
            tenant = random.choice(['tenant-a', 'tenant-b', 'tenant-c'])
            status = random.choice(['success', 'success', 'success', 'failed'])  # 75% success rate
            
            events_counter.labels(tenant=tenant, status=status).inc(random.randint(1, 100))
            
            # Simulate processing time
            with processing_histogram.time():
                time.sleep(random.uniform(0.1, 2.0))
            
            # Update worker count
            active_workers.set(random.randint(2, 8))
            
            time.sleep(1)
        
        click.echo("\n⏹️  Metrics server stopped")
        
    except Exception as e:
        click.echo(f"\n❌ Metrics server failed: {str(e)}", err=True)
        sys.exit(1)


@cli.command()
@click.option('--output', '-o', type=click.Path(), help='Output file for test results')
def test(output):
    """Run the comprehensive test suite"""
    
    click.echo("🧪 Running comprehensive test suite...")
    
    try:
        from ingestion_test_harness import IngestionTestSuite
        
        test_suite = IngestionTestSuite()
        results = test_suite.run_all_tests()
        
        # Save results if output specified
        if output:
            with open(output, 'w') as f:
                json.dump(results, f, indent=2, default=str)
            click.echo(f"\n💾 Test results saved to: {output}")
        
        # Display summary
        success_rate = results['success_rate']
        if success_rate >= 80:
            click.echo(f"\n✅ Test suite PASSED ({success_rate:.1f}% success rate)")
        else:
            click.echo(f"\n❌ Test suite FAILED ({success_rate:.1f}% success rate)")
            sys.exit(1)
        
    except ImportError:
        click.echo("\n❌ Test harness not available. Ensure ingestion_test_harness.py is in the same directory.")
        sys.exit(1)
    except Exception as e:
        click.echo(f"\n❌ Test suite failed: {str(e)}", err=True)
        sys.exit(1)


@cli.command()
@click.argument('config_file', type=click.Path())
def validate_config(config_file):
    """Validate a configuration file"""
    
    click.echo(f"🔍 Validating configuration: {config_file}")
    
    try:
        import yaml
        
        with open(config_file, 'r') as f:
            config_data = yaml.safe_load(f)
        
        # Basic validation
        required_sections = ['ingestion', 'siem']
        missing_sections = [section for section in required_sections if section not in config_data]
        
        if missing_sections:
            click.echo(f"\n❌ Missing required sections: {', '.join(missing_sections)}")
            sys.exit(1)
        
        # Validate ingestion config
        ingestion_config = config_data.get('ingestion', {})
        
        # Check for common configuration issues
        warnings = []
        errors = []
        
        if ingestion_config.get('max_events_per_file', 0) > 100000:
            warnings.append("max_events_per_file is very high, may cause memory issues")
        
        if ingestion_config.get('batch_size', 0) > 10000:
            warnings.append("batch_size is very high, may cause memory issues")
        
        if not ingestion_config.get('enable_format_detection', True):
            warnings.append("format_detection is disabled, may miss some data")
        
        if not ingestion_config.get('enable_validation', True):
            warnings.append("validation is disabled, data quality may suffer")
        
        # Display results
        if errors:
            click.echo("\n❌ Configuration errors:")
            for error in errors:
                click.echo(f"   - {error}")
            sys.exit(1)
        
        if warnings:
            click.echo("\n⚠️  Configuration warnings:")
            for warning in warnings:
                click.echo(f"   - {warning}")
        
        click.echo("\n✅ Configuration is valid!")
        
        # Show key settings
        click.echo("\n📋 Key Settings:")
        click.echo(f"   Max events per file: {ingestion_config.get('max_events_per_file', 'default')}")
        click.echo(f"   Batch size: {ingestion_config.get('batch_size', 'default')}")
        click.echo(f"   Format detection: {ingestion_config.get('enable_format_detection', True)}")
        click.echo(f"   Validation: {ingestion_config.get('enable_validation', True)}")
        click.echo(f"   Log level: {ingestion_config.get('log_level', 'INFO')}")
        
    except FileNotFoundError:
        click.echo(f"\n❌ Configuration file not found: {config_file}")
        sys.exit(1)
    except yaml.YAMLError as e:
        click.echo(f"\n❌ Invalid YAML syntax: {str(e)}")
        sys.exit(1)
    except Exception as e:
        click.echo(f"\n❌ Validation failed: {str(e)}")
        sys.exit(1)


@cli.command()
def version():
    """Show version information"""
    
    click.echo("SIEM Ingestion Pipeline v2.0.0")
    click.echo("Production-grade data ingestion with streaming parsers")
    click.echo("")
    click.echo("Features:")
    click.echo("  ✅ Streaming JSON parsing (ijson, ndjson)")
    click.echo("  ✅ Dynamic format detection")
    click.echo("  ✅ Data validation with Pydantic")
    click.echo("  ✅ Retry logic with exponential backoff")
    click.echo("  ✅ Prometheus metrics")
    click.echo("  ✅ Structured logging")
    click.echo("  ✅ Comprehensive error handling")
    click.echo("  ✅ Production monitoring")


if __name__ == '__main__':
    cli()