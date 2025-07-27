use anyhow::Result;
use clap::{Arg, Command};
use std::path::Path;

mod schema_validator_v5;
use schema_validator_v5::SchemaValidator;

fn main() -> Result<()> {
    let matches = Command::new("schema_validator_v5")
        .version("5.0.0")
        .author("Schema Validation Team")
        .about("Advanced multi-layer schema validator with GraphQL, OpenAPI, HTML reporting, and Prometheus metrics")
        .arg(
            Arg::new("database_schema")
                .long("database-schema")
                .short('d')
                .value_name("PATH")
                .help("Path to the database schema file (SQL)")
                .required(true),
        )
        .arg(
            Arg::new("source_code")
                .long("source-code")
                .short('s')
                .value_name("PATH")
                .help("Path to the source code directory (Rust)")
                .required(true),
        )
        .arg(
            Arg::new("typescript")
                .long("typescript")
                .short('t')
                .value_name("PATH")
                .help("Path to the TypeScript source directory")
                .required(false),
        )
        .arg(
            Arg::new("graphql")
                .long("graphql")
                .short('g')
                .value_name("PATH")
                .help("Path to the GraphQL schema file")
                .required(false),
        )
        .arg(
            Arg::new("openapi")
                .long("openapi")
                .short('o')
                .value_name("PATH")
                .help("Path to the OpenAPI specification file (JSON/YAML)")
                .required(false),
        )
        .arg(
            Arg::new("environments")
                .long("environments")
                .short('e')
                .value_name("PATH")
                .help("Path to environments configuration file")
                .required(false),
        )
        .arg(
            Arg::new("environment")
                .long("environment")
                .value_name("NAME")
                .help("Target environment name (default: development)")
                .default_value("development"),
        )
        .arg(
            Arg::new("output")
                .long("output")
                .value_name("PATH")
                .help("Output directory for reports (default: current directory)")
                .default_value("."),
        )
        .arg(
            Arg::new("format")
                .long("format")
                .value_name("FORMAT")
                .help("Output format: json, markdown, html, prometheus, all (default: all)")
                .default_value("all"),
        )
        .arg(
            Arg::new("verbose")
                .long("verbose")
                .short('v')
                .help("Enable verbose output")
                .action(clap::ArgAction::SetTrue),
        )
        .arg(
            Arg::new("fail_on_critical")
                .long("fail-on-critical")
                .help("Exit with non-zero code if critical issues are found")
                .action(clap::ArgAction::SetTrue),
        )
        .arg(
            Arg::new("coverage_threshold")
                .long("coverage-threshold")
                .value_name("PERCENTAGE")
                .help("Minimum coverage threshold (0-100, default: 80)")
                .default_value("80"),
        )
        .get_matches();

    let database_schema_path = matches.get_one::<String>("database_schema").unwrap();
    let source_code_path = matches.get_one::<String>("source_code").unwrap();
    let typescript_path = matches.get_one::<String>("typescript");
    let graphql_path = matches.get_one::<String>("graphql");
    let openapi_path = matches.get_one::<String>("openapi");
    let environments_path = matches.get_one::<String>("environments");
    let environment = matches.get_one::<String>("environment").unwrap();
    let output_dir = matches.get_one::<String>("output").unwrap();
    let format = matches.get_one::<String>("format").unwrap();
    let verbose = matches.get_flag("verbose");
    let fail_on_critical = matches.get_flag("fail_on_critical");
    let coverage_threshold: f64 = matches.get_one::<String>("coverage_threshold")
        .unwrap()
        .parse()
        .unwrap_or(80.0);

    if verbose {
        println!("🚀 Starting Schema Validator v5");
        println!("📊 Database Schema: {}", database_schema_path);
        println!("🦀 Source Code: {}", source_code_path);
        if let Some(ts_path) = typescript_path {
            println!("📘 TypeScript: {}", ts_path);
        }
        if let Some(gql_path) = graphql_path {
            println!("🔗 GraphQL: {}", gql_path);
        }
        if let Some(api_path) = openapi_path {
            println!("📋 OpenAPI: {}", api_path);
        }
        println!("🌍 Environment: {}", environment);
        println!("📁 Output Directory: {}", output_dir);
        println!("📄 Format: {}", format);
        println!("🎯 Coverage Threshold: {:.1}%", coverage_threshold);
        println!();
    }

    // Initialize validator with Prometheus metrics if requested
    let enable_prometheus = format == "prometheus" || format == "all";
    let mut validator = if enable_prometheus {
        #[cfg(feature = "prometheus-metrics")]
        {
            SchemaValidator::new_with_prometheus()?
        }
        #[cfg(not(feature = "prometheus-metrics"))]
        {
            eprintln!("❌ Prometheus metrics feature not enabled. Rebuild with --features prometheus-metrics");
            std::process::exit(1);
        }
    } else {
        SchemaValidator::new()
    };

    // Load environments configuration if provided
    if let Some(env_path) = environments_path {
        if verbose {
            println!("📋 Loading environments configuration from: {}", env_path);
        }
        validator.load_environments_config(Path::new(env_path))?;
    }

    // Set current environment
    validator.set_environment(environment.to_string());

    // Load database schema
    if verbose {
        println!("🗄️  Loading database schema...");
    }
    validator.load_database_schema(Path::new(database_schema_path))?;
    
    if verbose {
        let schema = validator.get_current_database_schema();
        if let Some(db_schema) = schema {
            println!("   ✅ Loaded {} tables", db_schema.tables.len());
        }
    }

    // Scan source code
    if verbose {
        println!("🔍 Scanning Rust source code...");
    }
    validator.scan_source_code(Path::new(source_code_path))?;
    
    if verbose {
        let sql_refs = validator.get_sql_references();
        println!("   ✅ Found {} SQL references", sql_refs.len());
    }

    // Scan TypeScript if provided
    if let Some(ts_path) = typescript_path {
        if verbose {
            println!("📘 Scanning TypeScript interfaces...");
        }
        validator.scan_typescript_interfaces(Path::new(ts_path))?;
        
        if verbose {
            let interfaces = validator.get_current_typescript_interfaces();
            if let Some(ts_interfaces) = interfaces {
                println!("   ✅ Found {} TypeScript interfaces", ts_interfaces.len());
            }
        }
    }

    // Load GraphQL schema if provided
    if let Some(gql_path) = graphql_path {
        if verbose {
            println!("🔗 Loading GraphQL schema...");
        }
        validator.load_graphql_schema(Path::new(gql_path))?;
        
        if verbose {
            let schema = validator.get_current_graphql_schema();
            if let Some(gql_schema) = schema {
                println!("   ✅ Loaded {} GraphQL types", gql_schema.types.len());
            }
        }
    }

    // Load OpenAPI specification if provided
    if let Some(api_path) = openapi_path {
        if verbose {
            println!("📋 Loading OpenAPI specification...");
        }
        validator.load_openapi_spec(Path::new(api_path))?;
        
        if verbose {
            let spec = validator.get_current_openapi_spec();
            if let Some(api_spec) = spec {
                let total_operations: usize = api_spec.paths.values()
                    .map(|path| path.methods.len())
                    .sum();
                println!("   ✅ Loaded {} OpenAPI operations", total_operations);
            }
        }
    }

    // Perform validation
    if verbose {
        println!("🔍 Performing multi-layer validation...");
    }
    validator.validate_all_layers()?;

    // Generate and export reports
    let output_path = Path::new(output_dir);
    
    match format.as_str() {
        "json" => {
            let json_path = output_path.join("schema_validation_report.json");
            validator.export_json_report(&json_path)?;
        }
        "markdown" => {
            let md_path = output_path.join("schema_validation_report.md");
            validator.export_markdown_report(&md_path)?;
        }
        "html" => {
            #[cfg(feature = "html-reporting")]
            {
                let html_path = output_path.join("schema_validation_report.html");
                validator.export_html_report(&html_path)?;
            }
            #[cfg(not(feature = "html-reporting"))]
            {
                eprintln!("❌ HTML reporting feature not enabled. Rebuild with --features html-reporting");
                std::process::exit(1);
            }
        }
        "prometheus" => {
            #[cfg(feature = "prometheus-metrics")]
            {
                let metrics_path = output_path.join("schema_validation_metrics.txt");
                validator.export_prometheus_metrics(&metrics_path)?;
            }
            #[cfg(not(feature = "prometheus-metrics"))]
            {
                eprintln!("❌ Prometheus metrics feature not enabled. Rebuild with --features prometheus-metrics");
                std::process::exit(1);
            }
        }
        "all" => {
            // Export JSON
            let json_path = output_path.join("schema_validation_report.json");
            validator.export_json_report(&json_path)?;
            
            // Export Markdown
            let md_path = output_path.join("schema_validation_report.md");
            validator.export_markdown_report(&md_path)?;
            
            // Export HTML if feature is enabled
            #[cfg(feature = "html-reporting")]
            {
                let html_path = output_path.join("schema_validation_report.html");
                validator.export_html_report(&html_path)?;
            }
            
            // Export Prometheus metrics if feature is enabled
            #[cfg(feature = "prometheus-metrics")]
            {
                let metrics_path = output_path.join("schema_validation_metrics.txt");
                validator.export_prometheus_metrics(&metrics_path)?;
            }
        }
        _ => {
            eprintln!("❌ Invalid format: {}. Use json, markdown, html, prometheus, or all", format);
            std::process::exit(1);
        }
    }

    // Generate final report and check results
    let report = validator.generate_report();
    
    if verbose {
        println!();
        println!("📊 Validation Summary:");
        println!("   🗄️  Tables Loaded: {}", report.total_tables_loaded);
        println!("   🔍 SQL References: {}", report.total_sql_references);
        println!("   📘 TypeScript Interfaces: {}", report.total_typescript_interfaces);
        println!("   🔗 GraphQL Types: {}", report.total_graphql_types);
        println!("   📋 OpenAPI Operations: {}", report.total_openapi_operations);
        println!("   ❌ Critical Issues: {}", report.summary.critical_issues);
        println!("   ⚠️  Warnings: {}", report.summary.warnings);
        println!("   🔗 Cross-Layer Mismatches: {}", report.summary.cross_layer_mismatches);
        println!();
        
        println!("📈 Layer Coverage:");
        for (layer, coverage) in &report.summary.layer_coverage {
            let status = if *coverage >= coverage_threshold {
                "✅"
            } else {
                "❌"
            };
            println!("   {} {:?}: {:.1}%", status, layer, coverage);
        }
        
        let overall_coverage = report.summary.layer_coverage.values().sum::<f64>() / report.summary.layer_coverage.len() as f64;
        println!();
        println!("🎯 Overall Coverage: {:.1}% (Threshold: {:.1}%)", overall_coverage, coverage_threshold);
    }

    // Check if validation passed
    let overall_coverage = report.summary.layer_coverage.values().sum::<f64>() / report.summary.layer_coverage.len() as f64;
    let validation_passed = report.summary.critical_issues == 0 && overall_coverage >= coverage_threshold;
    
    if validation_passed {
        println!("✅ Schema validation PASSED");
    } else {
        println!("❌ Schema validation FAILED");
        if report.summary.critical_issues > 0 {
            println!("   💥 {} critical issues found", report.summary.critical_issues);
        }
        if overall_coverage < coverage_threshold {
            println!("   📉 Coverage {:.1}% below threshold {:.1}%", overall_coverage, coverage_threshold);
        }
    }

    // Exit with appropriate code
    if fail_on_critical && !validation_passed {
        std::process::exit(1);
    }

    Ok(())
}