use anyhow::{Context, Result};
use clap::{Arg, Command};
use std::path::PathBuf;
use std::process;

mod schema_validator_v3;
use schema_validator_v3::SchemaValidator;

fn main() -> Result<()> {
    let matches = Command::new("Schema Validator v3")
        .version("3.0.0")
        .author("SIEM Team")
        .about("Comprehensive schema validator using structured parsing")
        .arg(
            Arg::new("schema")
                .short('s')
                .long("schema")
                .value_name("FILE")
                .help("Path to database schema SQL file")
                .default_value("database_setup.sql"),
        )
        .arg(
            Arg::new("source-dir")
                .short('d')
                .long("source-dir")
                .value_name("DIR")
                .help("Path to source code directory")
                .default_value("siem_api/src"),
        )
        .arg(
            Arg::new("output-dir")
                .short('o')
                .long("output-dir")
                .value_name("DIR")
                .help("Output directory for reports")
                .default_value("."),
        )
        .arg(
            Arg::new("typescript-dir")
                .short('t')
                .long("typescript-dir")
                .value_name("DIR")
                .help("Path to TypeScript source directory (optional)"),
        )
        .arg(
            Arg::new("fail-on-critical")
                .long("fail-on-critical")
                .help("Exit with error code if critical issues are found")
                .action(clap::ArgAction::SetTrue),
        )
        .arg(
            Arg::new("verbose")
                .short('v')
                .long("verbose")
                .help("Enable verbose output")
                .action(clap::ArgAction::SetTrue),
        )
        .get_matches();

    let schema_file = PathBuf::from(matches.get_one::<String>("schema").unwrap());
    let source_dir = PathBuf::from(matches.get_one::<String>("source-dir").unwrap());
    let output_dir = PathBuf::from(matches.get_one::<String>("output-dir").unwrap());
    let typescript_dir = matches
        .get_one::<String>("typescript-dir")
        .map(PathBuf::from);
    let fail_on_critical = matches.get_flag("fail-on-critical");
    let verbose = matches.get_flag("verbose");

    if verbose {
        println!("🔍 Starting comprehensive schema validation...");
        println!("📄 Schema file: {:?}", schema_file);
        println!("📁 Source directory: {:?}", source_dir);
        println!("📤 Output directory: {:?}", output_dir);
        if let Some(ts_dir) = &typescript_dir {
            println!("📜 TypeScript directory: {:?}", ts_dir);
        }
    }

    // Initialize validator
    let mut validator = SchemaValidator::new();

    // Step 1: Load database schema
    if verbose {
        println!("\n🗄️  Loading database schema...");
    }
    validator
        .load_database_schema(&schema_file)
        .with_context(|| "Failed to load database schema")?;

    // Step 2: Scan Rust codebase
    if verbose {
        println!("\n🦀 Scanning Rust codebase...");
    }
    validator
        .scan_rust_codebase(&source_dir)
        .with_context(|| "Failed to scan Rust codebase")?;

    // Step 3: Scan TypeScript codebase (if provided)
    if let Some(_ts_dir) = typescript_dir {
        if verbose {
            println!("\n📜 Scanning TypeScript codebase...");
        }
        // TODO: Implement TypeScript scanning
        println!("⚠️  TypeScript scanning not yet implemented");
    }

    // Step 4: Validate schemas
    if verbose {
        println!("\n✅ Validating schemas...");
    }
    validator
        .validate_schemas()
        .with_context(|| "Failed to validate schemas")?;

    // Step 5: Generate reports
    if verbose {
        println!("\n📊 Generating reports...");
    }

    let json_report_path = output_dir.join("schema_validation_report.json");
    let markdown_report_path = output_dir.join("schema_validation_report.md");

    validator
        .generate_json_report(&json_report_path)
        .with_context(|| "Failed to generate JSON report")?;

    validator
        .generate_markdown_report(&markdown_report_path)
        .with_context(|| "Failed to generate Markdown report")?;

    // Step 6: Print summary
    let report = validator.generate_report();

    println!("\n📋 Validation Summary:");
    println!("   Tables loaded: {}", report.total_tables_loaded);
    println!("   SQL references found: {}", report.total_sql_references);
    println!("   Critical issues: {}", report.summary.critical_issues);
    println!("   Warnings: {}", report.summary.warnings);
    println!("   Missing tables: {}", report.summary.missing_tables);
    println!("   Missing columns: {}", report.summary.missing_columns);
    println!(
        "   Hardcoded database names: {}",
        report.summary.hardcoded_database_names
    );

    println!("\n📄 Reports generated:");
    println!("   JSON: {:?}", json_report_path);
    println!("   Markdown: {:?}", markdown_report_path);

    // Step 7: Exit with appropriate code
    if fail_on_critical && report.summary.critical_issues > 0 {
        println!(
            "\n❌ Validation failed with {} critical issues",
            report.summary.critical_issues
        );
        process::exit(1);
    } else if report.summary.critical_issues > 0 {
        println!("\n⚠️  Validation completed with {} critical issues (not failing due to --fail-on-critical not set)", report.summary.critical_issues);
    } else {
        println!("\n✅ Validation completed successfully!");
    }

    Ok(())
}
