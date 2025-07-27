use anyhow::{Context, Result};
use std::path::Path;
use std::process::Command;
use tokio::fs;
use log::{info, warn};

use crate::config::ClickHouseConfig;
use crate::BackupComponent;

pub async fn create_clickhouse_backup(
    config: &ClickHouseConfig,
    backup_dir: &Path,
) -> Result<BackupComponent> {
    let ch_backup_dir = backup_dir.join("clickhouse");
    fs::create_dir_all(&ch_backup_dir).await
        .context("Failed to create ClickHouse backup directory")?;
    
    // First, try using clickhouse-backup if available
    if let Ok(backup_result) = create_backup_with_clickhouse_backup(config, &ch_backup_dir).await {
        return Ok(backup_result);
    }
    
    warn!("clickhouse-backup not available, falling back to manual backup");
    
    // Fallback to manual backup methods
    create_manual_backup(config, &ch_backup_dir).await
}

async fn create_backup_with_clickhouse_backup(
    config: &ClickHouseConfig,
    backup_dir: &Path,
) -> Result<BackupComponent> {
    let backup_name = format!("siem_backup_{}", chrono::Utc::now().format("%Y%m%d_%H%M%S"));
    
    info!("Creating ClickHouse backup using clickhouse-backup: {}", backup_name);
    
    // Create backup
    let mut cmd = Command::new(&config.backup_command);
    cmd.args(&config.backup_args)
        .arg(&backup_name)
        .env("CLICKHOUSE_HOST", &config.host)
        .env("CLICKHOUSE_PORT", config.port.to_string())
        .env("CLICKHOUSE_USERNAME", &config.username)
        .env("CLICKHOUSE_PASSWORD", &config.password)
        .env("CLICKHOUSE_DATABASE", &config.database);
    
    let output = cmd.output()
        .context("Failed to execute clickhouse-backup command")?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("clickhouse-backup failed: {}", stderr);
    }
    
    info!("ClickHouse backup created successfully");
    
    // Download/copy backup to our backup directory
    let download_cmd = Command::new(&config.backup_command)
        .args(&["download", &backup_name])
        .env("CLICKHOUSE_HOST", &config.host)
        .env("CLICKHOUSE_PORT", config.port.to_string())
        .output();
    
    if let Ok(download_output) = download_cmd {
        if !download_output.status.success() {
            warn!("Failed to download backup, attempting to copy from local storage");
        }
    }
    
    // Try to find and copy the backup files
    let backup_source = find_clickhouse_backup_path(&backup_name).await?;
    copy_backup_files(&backup_source, backup_dir).await?;
    
    // Calculate backup size and checksum
    let (size_bytes, checksum) = calculate_backup_metrics(backup_dir).await?;
    
    // Cleanup the original backup
    let _ = Command::new(&config.backup_command)
        .args(&["delete", &backup_name])
        .env("CLICKHOUSE_HOST", &config.host)
        .env("CLICKHOUSE_PORT", config.port.to_string())
        .output();
    
    Ok(BackupComponent {
        name: "clickhouse".to_string(),
        path: "clickhouse".to_string(),
        size_bytes,
        checksum,
    })
}

async fn create_manual_backup(
    config: &ClickHouseConfig,
    backup_dir: &Path,
) -> Result<BackupComponent> {
    info!("Creating manual ClickHouse backup");
    
    // Create data backup using SQL dumps
    let data_backup = create_data_backup(config, backup_dir).await
        .context("Failed to create data backup")?;
    
    // Create schema backup
    let schema_backup = create_schema_backup(config, backup_dir).await
        .context("Failed to create schema backup")?;
    
    // Combine sizes and checksums
    let total_size = data_backup.0 + schema_backup.0;
    let combined_checksum = format!("{}_{}", data_backup.1, schema_backup.1);
    
    Ok(BackupComponent {
        name: "clickhouse".to_string(),
        path: "clickhouse".to_string(),
        size_bytes: total_size,
        checksum: combined_checksum,
    })
}

async fn create_data_backup(
    config: &ClickHouseConfig,
    backup_dir: &Path,
) -> Result<(u64, String)> {
    info!("Creating ClickHouse data backup");
    
    let data_dir = backup_dir.join("data");
    fs::create_dir_all(&data_dir).await?;
    
    // Get list of tables
    let tables_query = format!(
        "SELECT name FROM system.tables WHERE database = '{}' FORMAT TabSeparated",
        config.database
    );
    
    let tables_output = execute_clickhouse_query(config, &tables_query).await?;
    let tables: Vec<&str> = tables_output.lines().collect();
    
    let mut total_size = 0u64;
    let mut all_content = Vec::new();
    
    for table in tables {
        if table.trim().is_empty() {
            continue;
        }
        
        info!("Backing up table: {}", table);
        
        // Export table data
        let data_query = format!(
            "SELECT * FROM {}.{} FORMAT Native",
            config.database, table
        );
        
        let table_data = execute_clickhouse_query(config, &data_query).await
            .with_context(|| format!("Failed to backup table: {}", table))?;
        
        let table_file = data_dir.join(format!("{}.native", table));
        fs::write(&table_file, &table_data).await?;
        
        let file_size = table_data.len() as u64;
        total_size += file_size;
        all_content.extend_from_slice(table_data.as_bytes());
        
        info!("Backed up table {} ({} bytes)", table, file_size);
    }
    
    let checksum = crate::calculate_checksum(&all_content);
    Ok((total_size, checksum))
}

async fn create_schema_backup(
    config: &ClickHouseConfig,
    backup_dir: &Path,
) -> Result<(u64, String)> {
    info!("Creating ClickHouse schema backup");
    
    let schema_dir = backup_dir.join("schema");
    fs::create_dir_all(&schema_dir).await?;
    
    // Get table schemas
    let schema_query = format!(
        "SELECT name, create_table_query FROM system.tables WHERE database = '{}' FORMAT JSON",
        config.database
    );
    
    let schema_data = execute_clickhouse_query(config, &schema_query).await?;
    let schema_file = schema_dir.join("tables.json");
    fs::write(&schema_file, &schema_data).await?;
    
    // Get database schema
    let db_query = format!(
        "SELECT name, engine, create_database_query FROM system.databases WHERE name = '{}' FORMAT JSON",
        config.database
    );
    
    let db_data = execute_clickhouse_query(config, &db_query).await?;
    let db_file = schema_dir.join("database.json");
    fs::write(&db_file, &db_data).await?;
    
    let total_size = (schema_data.len() + db_data.len()) as u64;
    let mut all_content = Vec::new();
    all_content.extend_from_slice(schema_data.as_bytes());
    all_content.extend_from_slice(db_data.as_bytes());
    
    let checksum = crate::calculate_checksum(&all_content);
    Ok((total_size, checksum))
}

async fn execute_clickhouse_query(config: &ClickHouseConfig, query: &str) -> Result<String> {
    let client = reqwest::Client::new();
    let url = format!("http://{}:{}", config.host, config.port);
    
    let response = client
        .post(&url)
        .query(&[("database", &config.database)])
        .basic_auth(&config.username, Some(&config.password))
        .body(query.to_string())
        .send()
        .await
        .context("Failed to execute ClickHouse query")?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        anyhow::bail!("ClickHouse query failed: {}", error_text);
    }
    
    let result = response.text().await
        .context("Failed to read ClickHouse response")?;
    
    Ok(result)
}

async fn find_clickhouse_backup_path(backup_name: &str) -> Result<std::path::PathBuf> {
    // Common clickhouse-backup storage locations
    let possible_paths = vec![
        format!("/var/lib/clickhouse/backup/{}", backup_name),
        format!("/tmp/clickhouse-backup/{}", backup_name),
        format!("./clickhouse-backup/{}", backup_name),
        format!("/opt/clickhouse-backup/{}", backup_name),
    ];
    
    for path in possible_paths {
        let path_buf = std::path::PathBuf::from(&path);
        if path_buf.exists() {
            return Ok(path_buf);
        }
    }
    
    anyhow::bail!("Could not find clickhouse-backup storage location for: {}", backup_name)
}

async fn copy_backup_files(source: &Path, dest: &Path) -> Result<()> {
    if source.is_file() {
        let filename = source.file_name()
            .ok_or_else(|| anyhow::anyhow!("Invalid source file path"))?;
        let dest_file = dest.join(filename);
        fs::copy(source, dest_file).await?;
    } else if source.is_dir() {
        copy_directory_recursive(source, dest).await?;
    }
    
    Ok(())
}

fn copy_directory_recursive<'a>(src: &'a Path, dst: &'a Path) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + 'a>> {
    Box::pin(async move {
        fs::create_dir_all(dst).await?;
        
        let mut entries = fs::read_dir(src).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            let name = entry.file_name();
            let dest_path = dst.join(name);
            
            if path.is_dir() {
                copy_directory_recursive(&path, &dest_path).await?;
            } else {
                fs::copy(&path, &dest_path).await?;
            }
        }
        
        Ok(())
    })
}

async fn calculate_backup_metrics(backup_dir: &Path) -> Result<(u64, String)> {
    let mut total_size = 0u64;
    let mut all_content = Vec::new();
    
    let mut stack = vec![backup_dir.to_path_buf()];
    
    while let Some(current_dir) = stack.pop() {
        let mut entries = fs::read_dir(&current_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else {
                let metadata = entry.metadata().await?;
                total_size += metadata.len();
                
                // For checksum calculation, we'll just include file paths and sizes
                // to avoid loading all backup data into memory
                let path_str = path.to_string_lossy();
                all_content.extend_from_slice(path_str.as_bytes());
                all_content.extend_from_slice(&metadata.len().to_le_bytes());
            }
        }
    }
    
    let checksum = crate::calculate_checksum(&all_content);
    Ok((total_size, checksum))
} 