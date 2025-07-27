use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::fs;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum StorageProvider {
    #[serde(rename = "aws_s3")]
    AwsS3 {
        bucket: String,
        region: String,
        access_key_id: Option<String>,
        secret_access_key: Option<String>,
        endpoint: Option<String>, // For S3-compatible storage
        prefix: Option<String>,
    },
    #[serde(rename = "gcp_storage")]
    GcpStorage {
        bucket: String,
        project_id: String,
        credentials_path: Option<String>,
        prefix: Option<String>,
    },
    #[serde(rename = "azure_blob")]
    AzureBlob {
        account: String,
        container: String,
        access_key: Option<String>,
        connection_string: Option<String>,
        prefix: Option<String>,
    },
    #[serde(rename = "local")]
    Local {
        path: String,
    },
}

pub async fn upload_backup(
    provider: &StorageProvider,
    local_path: &Path,
    backup_id: &str,
) -> Result<String> {
    match provider {
        StorageProvider::AwsS3 { bucket, region, access_key_id, secret_access_key, endpoint, prefix } => {
            upload_to_s3(bucket, region.to_string(), access_key_id.as_deref(), secret_access_key.as_deref(), endpoint.as_deref(), prefix.as_deref(), local_path, backup_id).await
        },
        StorageProvider::GcpStorage { bucket, project_id, credentials_path, prefix } => {
            upload_to_gcp(bucket, project_id, credentials_path.as_deref(), prefix.as_deref(), local_path, backup_id).await
        },
        StorageProvider::AzureBlob { account, container, access_key, connection_string, prefix } => {
            upload_to_azure(account, container, access_key.as_deref(), connection_string.as_deref(), prefix.as_deref(), local_path, backup_id).await
        },
        StorageProvider::Local { path } => {
            upload_to_local(path, local_path, backup_id).await
        },
    }
}

pub async fn delete_backup(provider: &StorageProvider, storage_location: &str) -> Result<()> {
    match provider {
        StorageProvider::AwsS3 { bucket, region, access_key_id, secret_access_key, endpoint, .. } => {
            delete_from_s3(bucket, region.to_string(), access_key_id.as_deref(), secret_access_key.as_deref(), endpoint.as_deref(), storage_location).await
        },
        StorageProvider::GcpStorage { bucket, project_id, credentials_path, .. } => {
            delete_from_gcp(bucket, project_id, credentials_path.as_deref(), storage_location).await
        },
        StorageProvider::AzureBlob { account, container, access_key, connection_string, .. } => {
            delete_from_azure(account, container, access_key.as_deref(), connection_string.as_deref(), storage_location).await
        },
        StorageProvider::Local { path: _ } => {
            delete_from_local(storage_location).await
        },
    }
}

async fn upload_to_s3(
    bucket: &str,
    region: String,
    access_key_id: Option<&str>,
    secret_access_key: Option<&str>,
    endpoint: Option<&str>,
    prefix: Option<&str>,
    local_path: &Path,
    backup_id: &str,
) -> Result<String> {
    use aws_config::meta::region::RegionProviderChain;
    use aws_sdk_s3::{config::Builder as S3ConfigBuilder, Client};
    use aws_sdk_s3::config::Region;
    
    let region_provider = RegionProviderChain::default_provider().or_else(Region::new(region));
    let mut config_builder = aws_config::defaults(aws_config::BehaviorVersion::latest()).region(region_provider);
    
    if let (Some(key_id), Some(secret_key)) = (access_key_id, secret_access_key) {
        config_builder = config_builder.credentials_provider(
            aws_sdk_s3::config::Credentials::new(key_id, secret_key, None, None, "backup_manager")
        );
    }
    
    let config = config_builder.load().await;
    
    let mut s3_config_builder = S3ConfigBuilder::from(&config);
    if let Some(endpoint_url) = endpoint {
        s3_config_builder = s3_config_builder.endpoint_url(endpoint_url);
    }
    
    let client = Client::from_conf(s3_config_builder.build());
    
    let key = match prefix {
        Some(p) => format!("{}/{}.tar.gz", p.trim_end_matches('/'), backup_id),
        None => format!("{}.tar.gz", backup_id),
    };
    
    let body = aws_sdk_s3::primitives::ByteStream::from_path(local_path).await
        .context("Failed to read backup file")?;
    
    client
        .put_object()
        .bucket(bucket)
        .key(&key)
        .body(body)
        .send()
        .await
        .context("Failed to upload backup to S3")?;
    
    Ok(format!("s3://{}/{}", bucket, key))
}

async fn delete_from_s3(
    bucket: &str,
    region: String,
    access_key_id: Option<&str>,
    secret_access_key: Option<&str>,
    endpoint: Option<&str>,
    storage_location: &str,
) -> Result<()> {
    use aws_config::meta::region::RegionProviderChain;
    use aws_sdk_s3::{config::Builder as S3ConfigBuilder, Client};
    use aws_sdk_s3::config::Region;
    
    // Extract key from s3://bucket/key format
    let key = storage_location
        .strip_prefix(&format!("s3://{}/", bucket))
        .context("Invalid S3 storage location")?;
    
    let region_provider = RegionProviderChain::default_provider().or_else(Region::new(region));
    let mut config_builder = aws_config::defaults(aws_config::BehaviorVersion::latest()).region(region_provider);
    
    if let (Some(key_id), Some(secret_key)) = (access_key_id, secret_access_key) {
        config_builder = config_builder.credentials_provider(
            aws_sdk_s3::config::Credentials::new(key_id, secret_key, None, None, "backup_manager")
        );
    }
    
    let config = config_builder.load().await;
    
    let mut s3_config_builder = S3ConfigBuilder::from(&config);
    if let Some(endpoint_url) = endpoint {
        s3_config_builder = s3_config_builder.endpoint_url(endpoint_url);
    }
    
    let client = Client::from_conf(s3_config_builder.build());
    
    client
        .delete_object()
        .bucket(bucket)
        .key(key)
        .send()
        .await
        .context("Failed to delete backup from S3")?;
    
    Ok(())
}

async fn upload_to_gcp(
    _bucket: &str,
    _project_id: &str,
    _credentials_path: Option<&str>,
    _prefix: Option<&str>,
    _local_path: &Path,
    _backup_id: &str,
) -> Result<String> {
    // Simplified implementation to avoid compilation errors
    // In a real implementation, you'd use the proper Google Cloud Storage API
    Err(anyhow::anyhow!("Google Cloud Storage upload not fully implemented"))
}

async fn delete_from_gcp(
    _bucket: &str,
    _project_id: &str,
    _credentials_path: Option<&str>,
    _storage_location: &str,
) -> Result<()> {
    // Simplified implementation to avoid compilation errors
    // In a real implementation, you'd use the proper Google Cloud Storage API
    Err(anyhow::anyhow!("Google Cloud Storage delete not fully implemented"))
}

async fn upload_to_azure(
    account: &str,
    container: &str,
    access_key: Option<&str>,
    connection_string: Option<&str>,
    prefix: Option<&str>,
    local_path: &Path,
    backup_id: &str,
) -> Result<String> {
    use azure_storage::prelude::*;
    use azure_storage_blobs::prelude::*;
    
    let client = if let Some(_conn_str) = connection_string {
        // Connection string parsing would need custom implementation for this Azure crate version
        anyhow::bail!("Connection string authentication not supported in this Azure SDK version");
    } else if let Some(key) = access_key {
        ClientBuilder::new(account, StorageCredentials::access_key(account.to_string(), key.to_string()))
            .blob_service_client()
    } else {
        anyhow::bail!("Azure storage requires either connection_string or access_key");
    };
    
    let blob_name = match prefix {
        Some(p) => format!("{}/{}.tar.gz", p.trim_end_matches('/'), backup_id),
        None => format!("{}.tar.gz", backup_id),
    };
    
    let data = fs::read(local_path).await
        .context("Failed to read backup file")?;
    
    client
        .container_client(container)
        .blob_client(&blob_name)
        .put_block_blob(data)
        .await
        .context("Failed to upload backup to Azure Blob Storage")?;
    
    Ok(format!("https://{}.blob.core.windows.net/{}/{}", account, container, blob_name))
}

async fn delete_from_azure(
    account: &str,
    container: &str,
    access_key: Option<&str>,
    connection_string: Option<&str>,
    storage_location: &str,
) -> Result<()> {
    use azure_storage::prelude::*;
    use azure_storage_blobs::prelude::*;
    
    // Extract blob name from Azure URL
    let blob_name = storage_location
        .strip_prefix(&format!("https://{}.blob.core.windows.net/{}/", account, container))
        .context("Invalid Azure storage location")?;
    
    let client = if let Some(_conn_str) = connection_string {
        // Connection string parsing would need custom implementation for this Azure crate version
        anyhow::bail!("Connection string authentication not supported in this Azure SDK version");
    } else if let Some(key) = access_key {
        ClientBuilder::new(account, StorageCredentials::access_key(account.to_string(), key.to_string()))
            .blob_service_client()
    } else {
        anyhow::bail!("Azure storage requires either connection_string or access_key");
    };
    
    client
        .container_client(container)
        .blob_client(blob_name)
        .delete()
        .await
        .context("Failed to delete backup from Azure Blob Storage")?;
    
    Ok(())
}

async fn upload_to_local(base_path: &str, local_path: &Path, backup_id: &str) -> Result<String> {
    let dest_dir = Path::new(base_path);
    fs::create_dir_all(dest_dir).await
        .context("Failed to create backup directory")?;
    
    let dest_file = dest_dir.join(format!("{}.tar.gz", backup_id));
    fs::copy(local_path, &dest_file).await
        .context("Failed to copy backup to local storage")?;
    
    Ok(dest_file.to_string_lossy().to_string())
}

async fn delete_from_local(storage_location: &str) -> Result<()> {
    fs::remove_file(storage_location).await
        .context("Failed to delete backup from local storage")?;
    
    Ok(())
} 