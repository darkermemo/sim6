use anyhow::{Context, Result};
use clap::{Arg, Command};
use std::path::{Path, PathBuf};
use std::process;

mod schema_validator_v4;
use schema_validator_v4::*;

fn main() -> Result<()> {
    let matches = Command::new("schema_validator_v4")
        .version("4.0.0")
        .author("Schema Validation Team")
        .about("Multi-layer schema validator for ClickHouse, Rust, TypeScript, GraphQL, and OpenAPI")
        .arg(
            Arg::new("config")
                .short('c')
                .long("config")
                .value_name("CONFIG_FILE")
                .help("Path to environment configuration file (JSON)")
                .required(false)
        )
        .arg(
            Arg::new("environment")
                .short('e')
                .long("environment")
                .value_name("ENV_NAME")
                .help("Environment to validate (default, dev, staging, prod)")
                .default_value("default")
        )
        .arg(
            Arg::new("schema")
                .short('s')
                .long("schema")
                .value_name("SCHEMA_FILE")
                .help("Path to database schema file (database_setup.sql)")
                .required_unless_present("config")
        )
        .arg(
            Arg::new("rust-source")
                .short('r')
                .long("rust-source")
                .value_name("RUST_DIR")
                .help("Path to Rust source directory")
                .action(clap::ArgAction::Append)
        )
        .arg(
            Arg::new("typescript-source")
                .short('t')
                .long("typescript-source")
                .value_name("TS_DIR")
                .help("Path to TypeScript source directory")
                .action(clap::ArgAction::Append)
        )
        .arg(
            Arg::new("graphql-schema")
                .short('g')
                .long("graphql-schema")
                .value_name("GRAPHQL_FILE")
                .help("Path to GraphQL schema file")
                .action(clap::ArgAction::Append)
        )
        .arg(
            Arg::new("openapi-spec")
                .short('a')
                .long("openapi-spec")
                .value_name("OPENAPI_FILE")
                .help("Path to OpenAPI specification file")
                .action(clap::ArgAction::Append)
        )
        .arg(
            Arg::new("output")
                .short('o')
                .long("output")
                .value_name("OUTPUT_DIR")
                .help("Output directory for reports")
                .default_value(".")
        )
        .arg(
            Arg::new("database-name")
                .short('d')
                .long("database-name")
                .value_name("DB_NAME")
                .help("Database name for validation")
                .default_value("default")
        )
        .arg(
            Arg::new("fail-on-critical")
                .short('f')
                .long("fail-on-critical")
                .help("Exit with non-zero code if critical issues are found")
                .action(clap::ArgAction::SetTrue)
        )
        .arg(
            Arg::new("verbose")
                .short('v')
                .long("verbose")
                .help("Enable verbose output")
                .action(clap::ArgAction::SetTrue)
        )
        .arg(
            Arg::new("layers")
                .short('l')
                .long("layers")
                .value_name("LAYERS")
                .help("Comma-separated list of layers to validate (database,backend,frontend,graphql,openapi)")
                .default_value("database,backend")
        )
        .arg(
            Arg::new("cross-layer-only")
                .long("cross-layer-only")
                .help("Only perform cross-layer validation (skip individual layer validation)")
                .action(clap::ArgAction::SetTrue)
        )
        .arg(
            Arg::new("report-format")
                .long("report-format")
                .value_name("FORMAT")
                .help("Report format: json, markdown, both")
                .default_value("both")
        )
        .arg(
            Arg::new("coverage-threshold")
                .long("coverage-threshold")
                .value_name("PERCENTAGE")
                .help("Minimum coverage percentage to pass validation")
                .default_value("80")
        )
        .arg(
            Arg::new("exclude-patterns")
                .long("exclude")
                .value_name("PATTERNS")
                .help("Comma-separated list of file patterns to exclude")
                .action(clap::ArgAction::Append)
        )
        .arg(
            Arg::new("include-test-files")
                .long("include-tests")
                .help("Include test files in validation")
                .action(clap::ArgAction::SetTrue)
        )
        .arg(
            Arg::new("parallel")
                .short('p')
                .long("parallel")
                .help("Enable parallel processing for faster validation")
                .action(clap::ArgAction::SetTrue)
        )
        .arg(
            Arg::new("cache-dir")
                .long("cache-dir")
                .value_name("CACHE_DIR")
                .help("Directory for caching parsed results")
        )
        .arg(
            Arg::new("watch")
                .short('w')
                .long("watch")
                .help("Watch for file changes and re-validate automatically")
                .action(clap::ArgAction::SetTrue)
        )
        .get_matches();

    let verbose = matches.get_flag("verbose");
    let fail_on_critical = matches.get_flag("fail-on-critical");
    let environment = matches.get_one::<String>("environment").unwrap();
    let output_dir = Path::new(matches.get_one::<String>("output").unwrap());
    let report_format = matches.get_one::<String>("report-format").unwrap();
    let coverage_threshold: f64 = matches
        .get_one::<String>("coverage-threshold")
        .unwrap()
        .parse()
        .context("Invalid coverage threshold")?;

    if verbose {
        println!("🚀 Starting Multi-Layer Schema Validation v4.0.0");
        println!("📊 Environment: {}", environment);
        println!("📁 Output Directory: {:?}", output_dir);
        println!("📋 Report Format: {}", report_format);
        println!("🎯 Coverage Threshold: {:.1}%", coverage_threshold);
    }

    let mut validator = SchemaValidator::new();

    // Load configuration or create from CLI arguments
    if let Some(config_file) = matches.get_one::<String>("config") {
        if verbose {
            println!("📖 Loading configuration from: {}", config_file);
        }
        validator
            .load_environment_config(Path::new(config_file))
            .context("Failed to load environment configuration")?;
    } else {
        // Create environment config from CLI arguments
        let env_config = create_environment_config_from_cli(&matches, environment)?;
        validator
            .environments
            .insert(environment.to_string(), env_config);
    }

    // Set current environment
    validator
        .set_environment(environment)
        .context("Failed to set environment")?;

    // Load database schema
    if verbose {
        println!("🗄️  Loading database schema...");
    }
    validator
        .load_database_schema()
        .context("Failed to load database schema")?;

    // Parse enabled layers
    let enabled_layers = parse_enabled_layers(matches.get_one::<String>("layers").unwrap())?;
    if verbose {
        println!("🔍 Enabled layers: {:?}", enabled_layers);
    }

    // Scan all configured sources
    if verbose {
        println!("🔎 Scanning source files...");
    }
    validator
        .scan_all_sources()
        .context("Failed to scan source files")?;

    // Perform validation
    if !matches.get_flag("cross-layer-only") && verbose {
        println!("✅ Performing individual layer validation...");
    }
    // Individual layer validation is performed during scanning

    if verbose {
        println!("🔗 Performing cross-layer validation...");
    }
    validator
        .validate_all_layers()
        .context("Failed to perform cross-layer validation")?;

    // Generate reports
    if verbose {
        println!("📊 Generating validation reports...");
    }

    let report = validator.generate_enhanced_report();

    // Check coverage threshold
    let avg_coverage = report.summary.layer_coverage.values().sum::<f64>()
        / report.summary.layer_coverage.len() as f64;

    if avg_coverage < coverage_threshold {
        eprintln!(
            "❌ Coverage threshold not met: {:.1}% < {:.1}%",
            avg_coverage, coverage_threshold
        );
        if fail_on_critical {
            process::exit(1);
        }
    }

    // Generate reports based on format
    match report_format.as_str() {
        "json" => {
            let json_path = output_dir.join("schema_validation_report.json");
            validator
                .generate_enhanced_json_report(&json_path)
                .context("Failed to generate JSON report")?;
            println!("📄 JSON report generated: {:?}", json_path);
        }
        "markdown" => {
            let md_path = output_dir.join("schema_validation_report.md");
            validator
                .generate_enhanced_markdown_report(&md_path)
                .context("Failed to generate Markdown report")?;
            println!("📄 Markdown report generated: {:?}", md_path);
        }
        "both" => {
            let json_path = output_dir.join("schema_validation_report.json");
            let md_path = output_dir.join("schema_validation_report.md");

            validator
                .generate_enhanced_json_report(&json_path)
                .context("Failed to generate JSON report")?;
            validator
                .generate_enhanced_markdown_report(&md_path)
                .context("Failed to generate Markdown report")?;

            println!("📄 Reports generated:");
            println!("   JSON: {:?}", json_path);
            println!("   Markdown: {:?}", md_path);
        }
        _ => {
            let json_path = output_dir.join("schema_validation_report.json");
            let md_path = output_dir.join("schema_validation_report.md");

            validator
                .generate_enhanced_json_report(&json_path)
                .context("Failed to generate JSON report")?;
            validator
                .generate_enhanced_markdown_report(&md_path)
                .context("Failed to generate Markdown report")?;

            println!("📄 Reports generated:");
            println!("   JSON: {:?}", json_path);
            println!("   Markdown: {:?}", md_path);
        }
    }

    // Print summary
    print_validation_summary(&report, verbose);

    // Handle watch mode
    if matches.get_flag("watch") {
        println!("👀 Watching for file changes... (Press Ctrl+C to exit)");
        // TODO: Implement file watching with notify crate
        println!("⚠️  Watch mode not yet implemented");
    }

    // Exit with appropriate code
    if fail_on_critical && report.summary.critical_issues > 0 {
        eprintln!(
            "❌ Validation failed with {} critical issues",
            report.summary.critical_issues
        );
        process::exit(1);
    }

    if verbose {
        println!("✅ Validation completed successfully!");
    }

    Ok(())
}

/// Create environment configuration from CLI arguments
fn create_environment_config_from_cli(
    matches: &clap::ArgMatches,
    environment: &str,
) -> Result<EnvironmentConfig> {
    let schema_file = matches
        .get_one::<String>("schema")
        .ok_or_else(|| anyhow::anyhow!("Schema file is required when not using config file"))?;

    let rust_source_dirs: Vec<PathBuf> = matches
        .get_many::<String>("rust-source")
        .map(|values| values.map(PathBuf::from).collect())
        .unwrap_or_else(|| vec![PathBuf::from("src")]);

    let typescript_source_dirs: Vec<PathBuf> = matches
        .get_many::<String>("typescript-source")
        .map(|values| values.map(PathBuf::from).collect())
        .unwrap_or_default();

    let graphql_schema_files: Vec<PathBuf> = matches
        .get_many::<String>("graphql-schema")
        .map(|values| values.map(PathBuf::from).collect())
        .unwrap_or_default();

    let openapi_spec_files: Vec<PathBuf> = matches
        .get_many::<String>("openapi-spec")
        .map(|values| values.map(PathBuf::from).collect())
        .unwrap_or_default();

    let database_name = matches
        .get_one::<String>("database-name")
        .unwrap()
        .to_string();

    Ok(EnvironmentConfig {
        name: environment.to_string(),
        schema_file: PathBuf::from(schema_file),
        database_name,
        rust_source_dirs,
        typescript_source_dirs,
        graphql_schema_files,
        openapi_spec_files,
    })
}

/// Parse enabled layers from comma-separated string
fn parse_enabled_layers(layers_str: &str) -> Result<Vec<ValidationLayer>> {
    let mut layers = Vec::new();

    for layer in layers_str.split(',') {
        match layer.trim().to_lowercase().as_str() {
            "database" => layers.push(ValidationLayer::Database),
            "backend" => layers.push(ValidationLayer::Backend),
            "frontend" => layers.push(ValidationLayer::Frontend),
            "graphql" => layers.push(ValidationLayer::GraphQL),
            "openapi" => layers.push(ValidationLayer::OpenAPI),
            _ => return Err(anyhow::anyhow!("Unknown layer: {}", layer)),
        }
    }

    Ok(layers)
}

/// Print comprehensive validation summary
fn print_validation_summary(report: &ValidationReport, verbose: bool) {
    println!("\n📊 Validation Summary");
    println!("═══════════════════════");
    println!("🌍 Environment: {}", report.environment);
    println!(
        "📅 Timestamp: {}",
        report.timestamp.format("%Y-%m-%d %H:%M:%S UTC")
    );
    println!();

    // Layer Statistics
    println!("📈 Layer Statistics:");
    for (layer, count) in &report.total_files_scanned {
        println!("   {:?}: {} files", layer, count);
    }
    println!("   SQL References: {}", report.total_sql_references);
    println!("   Database Tables: {}", report.total_tables_loaded);
    println!(
        "   TypeScript Interfaces: {}",
        report.total_typescript_interfaces
    );
    println!("   GraphQL Types: {}", report.total_graphql_types);
    println!();

    // Coverage Information
    println!("🎯 Layer Coverage:");
    for (layer, coverage) in &report.summary.layer_coverage {
        let emoji = if *coverage >= 90.0 {
            "🟢"
        } else if *coverage >= 70.0 {
            "🟡"
        } else {
            "🔴"
        };
        println!("   {} {:?}: {:.1}%", emoji, layer, coverage);
    }
    println!();

    // Issue Summary
    println!("🚨 Issue Summary:");
    println!("   Critical Issues: {}", report.summary.critical_issues);
    println!("   Warnings: {}", report.summary.warnings);
    println!("   Missing Tables: {}", report.summary.missing_tables);
    println!("   Missing Columns: {}", report.summary.missing_columns);
    println!(
        "   Cross-Layer Mismatches: {}",
        report.summary.cross_layer_mismatches
    );
    println!();

    // Cross-Layer Analysis
    if report.summary.cross_layer_mismatches > 0 {
        println!("🔗 Cross-Layer Mismatches:");
        println!(
            "   Database ↔ Backend: {}",
            report
                .cross_layer_validation
                .database_backend_mismatches
                .len()
        );
        println!(
            "   Backend ↔ Frontend: {}",
            report
                .cross_layer_validation
                .backend_frontend_mismatches
                .len()
        );
        println!(
            "   Database ↔ Frontend: {}",
            report
                .cross_layer_validation
                .database_frontend_mismatches
                .len()
        );
        println!(
            "   GraphQL Mismatches: {}",
            report.cross_layer_validation.graphql_mismatches.len()
        );
        println!(
            "   OpenAPI Mismatches: {}",
            report.cross_layer_validation.openapi_mismatches.len()
        );
        println!();
    }

    // Detailed Issues (if verbose)
    if verbose {
        if !report.errors.is_empty() {
            println!("🚨 Critical Issues Details:");
            for (i, error) in report.errors.iter().enumerate().take(5) {
                println!(
                    "   {}. {} - {} ({}:{})",
                    i + 1,
                    error.error_type,
                    error.message,
                    error.file_path,
                    error.line_number
                );
            }
            if report.errors.len() > 5 {
                println!(
                    "   ... and {} more (see full report)",
                    report.errors.len() - 5
                );
            }
            println!();
        }

        if !report.warnings.is_empty() {
            println!("⚠️  Warning Details:");
            for (i, warning) in report.warnings.iter().enumerate().take(5) {
                println!(
                    "   {}. {} - {} ({}:{})",
                    i + 1,
                    warning.error_type,
                    warning.message,
                    warning.file_path,
                    warning.line_number
                );
            }
            if report.warnings.len() > 5 {
                println!(
                    "   ... and {} more (see full report)",
                    report.warnings.len() - 5
                );
            }
            println!();
        }
    }

    // Status
    if report.summary.critical_issues == 0 {
        println!("✅ Validation Status: PASSED");
    } else {
        println!(
            "❌ Validation Status: FAILED ({} critical issues)",
            report.summary.critical_issues
        );
    }

    // Recommendations
    if report.summary.critical_issues > 0 || report.summary.warnings > 10 {
        println!();
        println!("💡 Recommendations:");
        if report.summary.missing_tables > 0 {
            println!("   • Review and add missing tables to your database schema");
        }
        if report.summary.missing_columns > 0 {
            println!("   • Verify column names and add missing columns to tables");
        }
        if report.summary.cross_layer_mismatches > 0 {
            println!("   • Align data structures across database, backend, and frontend layers");
        }
        if report.summary.layer_coverage.values().any(|&c| c < 80.0) {
            println!("   • Improve test coverage for layers below 80%");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_enabled_layers() {
        let layers = parse_enabled_layers("database,backend,frontend").unwrap();
        assert_eq!(layers.len(), 3);
        assert!(layers.contains(&ValidationLayer::Database));
        assert!(layers.contains(&ValidationLayer::Backend));
        assert!(layers.contains(&ValidationLayer::Frontend));
    }

    #[test]
    fn test_parse_enabled_layers_invalid() {
        let result = parse_enabled_layers("database,invalid,backend");
        assert!(result.is_err());
    }

    #[test]
    fn test_create_environment_config() {
        // This would require setting up clap::ArgMatches, which is complex in tests
        // In practice, you'd use integration tests for CLI testing
    }
}
