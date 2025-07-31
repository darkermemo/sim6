use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use clap::Parser;
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::str::FromStr;
use tokio::fs;
use uuid::Uuid;

mod storage;
mod clickhouse;
mod config;

use storage::{StorageProvider, upload_backup};
use clickhouse::create_clickhouse_backup;
use config::BackupConfig;

#[derive(Parser, Debug)]
#[command(name = "siem_backup_manager")]
#[command(about = "SIEM Backup Manager for automated backup and disaster recovery")]
struct Args {
    /// Configuration file path
    #[arg(short, long, default_value = "backup_config.toml")]
    config: PathBuf,
    
    /// Run backup immediately (don't wait for schedule)
    #[arg(long)]
    immediate: bool,
    
    /// Dry run mode (don't actually create backups)
    #[arg(long)]
    dry_run: bool,
    
    /// Verbose logging
    #[arg(short, long)]
    verbose: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct BackupMetadata {
    pub backup_id: String,
    pub timestamp: DateTime<Utc>,
    pub backup_type: BackupType,
    pub size_bytes: u64,
    pub checksum: String,
    pub storage_location: String,
    pub components: Vec<BackupComponent>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BackupType {
    Full,
    Incremental,
    Configuration,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct BackupComponent {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub checksum: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    
    // Initialize logging
    let log_level = if args.verbose { "debug" } else { "info" };
    env_logger::init_from_env(env_logger::Env::new().default_filter_or(log_level));
    
    info!("Starting SIEM Backup Manager v{}", env!("CARGO_PKG_VERSION"));
    
    // Load configuration
    let config = BackupConfig::load(&args.config).await
        .context("Failed to load backup configuration")?;
    
    if args.immediate {
        info!("Running immediate backup...");
        run_backup(&config, args.dry_run).await?;
    } else {
        info!("Starting scheduled backup service...");
        run_scheduled_backups(&config, args.dry_run).await?;
    }
    
    Ok(())
}

async fn run_scheduled_backups(config: &BackupConfig, dry_run: bool) -> Result<()> {
    let schedule = cron::Schedule::from_str(&config.schedule)
        .context("Invalid cron schedule")?;
    
    info!("Backup scheduled: {}", config.schedule);
    
    loop {
        let upcoming = schedule.upcoming(Utc).take(1).next();
        if let Some(datetime) = upcoming {
            let now = Utc::now();
            let duration = datetime.signed_duration_since(now);
            
            if duration.num_seconds() > 0 {
                info!("Next backup scheduled for: {}", datetime);
                tokio::time::sleep(tokio::time::Duration::from_secs(duration.num_seconds() as u64)).await;
            }
            
            info!("Starting scheduled backup...");
            if let Err(e) = run_backup(config, dry_run).await {
                error!("Backup failed: {}", e);
                // Continue running despite failure
            }
        } else {
            error!("No upcoming backup times found");
            break;
        }
    }
    
    Ok(())
}

async fn run_backup(config: &BackupConfig, dry_run: bool) -> Result<()> {
    let backup_id = Uuid::new_v4().to_string();
    let timestamp = Utc::now();
    
    info!("Starting backup {} at {}", backup_id, timestamp);
    
    if dry_run {
        warn!("DRY RUN MODE - No actual backups will be created");
    }
    
    let temp_dir = tempfile::tempdir()
        .context("Failed to create temporary directory")?;
    let backup_dir = temp_dir.path().join(&backup_id);
    fs::create_dir_all(&backup_dir).await
        .context("Failed to create backup directory")?;
    
    let mut components = Vec::new();
    let mut total_size = 0u64;
    
    // 1. Backup ClickHouse database
    info!("Creating ClickHouse backup...");
    if !dry_run {
        let ch_backup = create_clickhouse_backup(&config.clickhouse, &backup_dir).await
            .context("Failed to create ClickHouse backup")?;
        total_size += ch_backup.size_bytes;
        components.push(ch_backup);
    } else {
        info!("DRY RUN: Would create ClickHouse backup");
    }
    
    // 2. Backup configuration files
    info!("Backing up configuration files...");
    if !dry_run {
        let config_backup = backup_configuration_files(&config.config_paths, &backup_dir).await
            .context("Failed to backup configuration files")?;
        total_size += config_backup.size_bytes;
        components.push(config_backup);
    } else {
        info!("DRY RUN: Would backup configuration files");
    }
    
    // 3. Backup service state (if enabled)
    if config.backup_service_state {
        info!("Backing up service state...");
        if !dry_run {
            let state_backup = backup_service_state(&backup_dir).await
                .context("Failed to backup service state")?;
            total_size += state_backup.size_bytes;
            components.push(state_backup);
        } else {
            info!("DRY RUN: Would backup service state");
        }
    }
    
    // 4. Create compressed archive
    info!("Creating compressed backup archive...");
    let archive_path = temp_dir.path().join(format!("{}.tar.gz", backup_id));
    if !dry_run {
        create_compressed_archive(&backup_dir, &archive_path).await
            .context("Failed to create compressed archive")?;
    }
    
    // 5. Calculate checksum
    let checksum = if !dry_run {
        calculate_file_checksum(&archive_path).await
            .context("Failed to calculate backup checksum")?
    } else {
        "dry-run-checksum".to_string()
    };
    
    // 6. Upload to remote storage
    info!("Uploading backup to remote storage...");
    let storage_location = if !dry_run {
        upload_backup(&config.storage, &archive_path, &backup_id).await
            .context("Failed to upload backup to remote storage")?
    } else {
        format!("dry-run-location/{}.tar.gz", backup_id)
    };
    
    // 7. Create and store backup metadata
    let metadata = BackupMetadata {
        backup_id: backup_id.clone(),
        timestamp,
        backup_type: BackupType::Full,
        size_bytes: total_size,
        checksum,
        storage_location,
        components,
    };
    
    if !dry_run {
        store_backup_metadata(&config.metadata_path, &metadata).await
            .context("Failed to store backup metadata")?;
    }
    
    // 8. Cleanup local files
    if !dry_run {
        fs::remove_file(&archive_path).await
            .context("Failed to cleanup local backup archive")?;
    }
    
    // 9. Cleanup old backups
    if config.retention_days > 0 {
        info!("Cleaning up old backups (older than {} days)...", config.retention_days);
        if !dry_run {
            cleanup_old_backups(&config.storage, &config.metadata_path, config.retention_days).await
                .context("Failed to cleanup old backups")?;
        } else {
            info!("DRY RUN: Would cleanup old backups");
        }
    }
    
    info!("Backup {} completed successfully", backup_id);
    info!("Total backup size: {} bytes", total_size);
    info!("Storage location: {}", metadata.storage_location);
    
    Ok(())
}

async fn backup_configuration_files(paths: &[PathBuf], backup_dir: &Path) -> Result<BackupComponent> {
    let config_dir = backup_dir.join("config");
    fs::create_dir_all(&config_dir).await?;
    
    let mut total_size = 0u64;
    let mut all_content = Vec::new();
    
    for path in paths {
        if path.exists() {
            if path.is_dir() {
                copy_directory(path, &config_dir).await?;
            } else {
                let filename = path.file_name()
                    .ok_or_else(|| anyhow::anyhow!("Invalid file path: {:?}", path))?;
                let dest = config_dir.join(filename);
                fs::copy(path, &dest).await?;
                
                let metadata = fs::metadata(&dest).await?;
                total_size += metadata.len();
                
                let content = fs::read(&dest).await?;
                all_content.extend_from_slice(&content);
            }
        } else {
            warn!("Configuration path does not exist: {:?}", path);
        }
    }
    
    let checksum = calculate_checksum(&all_content);
    
    Ok(BackupComponent {
        name: "configuration".to_string(),
        path: "config".to_string(),
        size_bytes: total_size,
        checksum,
    })
}

async fn backup_service_state(backup_dir: &Path) -> Result<BackupComponent> {
    let state_dir = backup_dir.join("service_state");
    fs::create_dir_all(&state_dir).await?;
    
    let mut total_size = 0u64;
    let mut all_content = Vec::new();
    
    // Backup Redis state (if running)
    if let Ok(output) = Command::new("redis-cli")
        .args(&["--rdb", &state_dir.join("redis_dump.rdb").to_string_lossy()])
        .output()
    {
        if output.status.success() {
            let metadata = fs::metadata(state_dir.join("redis_dump.rdb")).await?;
            total_size += metadata.len();
            
            let content = fs::read(state_dir.join("redis_dump.rdb")).await?;
            all_content.extend_from_slice(&content);
        }
    }
    
    // Backup Kafka consumer offsets (metadata only)
    let kafka_state = serde_json::json!({
        "timestamp": Utc::now(),
        "note": "Kafka consumer offsets are managed by Kafka itself"
    });
    
    let kafka_state_file = state_dir.join("kafka_state.json");
    fs::write(&kafka_state_file, serde_json::to_string_pretty(&kafka_state)?).await?;
    
    let metadata = fs::metadata(&kafka_state_file).await?;
    total_size += metadata.len();
    
    let content = fs::read(&kafka_state_file).await?;
    all_content.extend_from_slice(&content);
    
    let checksum = calculate_checksum(&all_content);
    
    Ok(BackupComponent {
        name: "service_state".to_string(),
        path: "service_state".to_string(),
        size_bytes: total_size,
        checksum,
    })
}

async fn copy_directory(src: &Path, dst: &Path) -> Result<()> {
    for entry in walkdir::WalkDir::new(src) {
        let entry = entry?;
        let path = entry.path();
        let relative_path = path.strip_prefix(src)?;
        let dest_path = dst.join(relative_path);
        
        if path.is_dir() {
            fs::create_dir_all(&dest_path).await?;
        } else {
            if let Some(parent) = dest_path.parent() {
                fs::create_dir_all(parent).await?;
            }
            fs::copy(path, &dest_path).await?;
        }
    }
    Ok(())
}

async fn create_compressed_archive(source_dir: &Path, archive_path: &Path) -> Result<()> {
    let tar_gz = std::fs::File::create(archive_path)?;
    let enc = flate2::write::GzEncoder::new(tar_gz, flate2::Compression::default());
    let mut tar = tar::Builder::new(enc);
    
    tar.append_dir_all(".", source_dir)?;
    tar.finish()?;
    
    Ok(())
}

async fn calculate_file_checksum(file_path: &Path) -> Result<String> {
    let content = fs::read(file_path).await?;
    Ok(calculate_checksum(&content))
}

fn calculate_checksum(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

async fn store_backup_metadata(metadata_path: &Path, metadata: &BackupMetadata) -> Result<()> {
    if let Some(parent) = metadata_path.parent() {
        fs::create_dir_all(parent).await?;
    }
    
    let metadata_json = serde_json::to_string_pretty(metadata)?;
    let metadata_file = metadata_path.join(format!("{}.json", metadata.backup_id));
    
    fs::write(metadata_file, metadata_json).await?;
    Ok(())
}

async fn cleanup_old_backups(
    storage: &StorageProvider,
    metadata_path: &Path,
    retention_days: u32,
) -> Result<()> {
    let cutoff_date = Utc::now() - chrono::Duration::days(retention_days as i64);
    
    if !metadata_path.exists() {
        return Ok(());
    }
    
    let mut entries = fs::read_dir(metadata_path).await?;
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            let content = fs::read_to_string(&path).await?;
            if let Ok(metadata) = serde_json::from_str::<BackupMetadata>(&content) {
                if metadata.timestamp < cutoff_date {
                    info!("Deleting old backup: {}", metadata.backup_id);
                    
                    // Delete from remote storage
                    storage::delete_backup(storage, &metadata.storage_location).await
                        .context("Failed to delete backup from remote storage")?;
                    
                    // Delete metadata file
                    fs::remove_file(&path).await
                        .context("Failed to delete metadata file")?;
                }
            }
        }
    }
    
    Ok(())
}