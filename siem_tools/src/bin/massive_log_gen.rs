//! High-performance massive log generator for SIEM testing
//! Generates up to 1 billion logs with multi-tenant simulation and compression

use siem_tools::{
    config::GeneratorConfig,
    generator::LogGenerator,
    http_client::HttpClient,
    stats::Stats,
};
use std::sync::Arc;
use tokio::time::{sleep, Duration};
use log::{info, error};
use clap::Parser;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    env_logger::init();
    
    let config = GeneratorConfig::parse();
    info!("Starting massive log generator with config: {:?}", config);
    
    let stats = Arc::new(Stats::new());
    let http_client = Arc::new(HttpClient::new(&config)?);
    let log_generator = Arc::new(LogGenerator::new(&config));
    
    // Start stats reporter task
    let stats_clone = Arc::clone(&stats);
    let stats_handle = tokio::spawn(async move {
        loop {
            sleep(Duration::from_secs(5)).await;
            stats_clone.print_current();
        }
    });
    
    let mut handles = Vec::new();
    
    // Spawn worker threads
    for thread_id in 0..config.threads {
        let config = config.clone();
        let stats = Arc::clone(&stats);
        let http_client = Arc::clone(&http_client);
        let log_generator = Arc::clone(&log_generator);
        
        let handle = tokio::spawn(async move {
            let mut total_sent = 0u64;
            let logs_per_thread = config.target / config.threads as u64;
            
            info!("Thread {} starting, target: {} logs", thread_id, logs_per_thread);
            
            while total_sent < logs_per_thread {
                // Generate batch of logs
                let batch_size = std::cmp::min(config.batch_size, logs_per_thread - total_sent) as usize;
                let logs = log_generator.generate_batch(thread_id, batch_size);
                
                if config.dry_run {
                    stats.count_logs(logs.len());
                    info!("[Thread {}] Generated {} logs (dry run)", thread_id, logs.len());
                } else {
                    // Send logs via HTTP
                    match http_client.send_logs(&logs).await {
                        Ok(bytes_sent) => {
                            stats.count_logs(logs.len());
                            stats.count_bytes(bytes_sent);
                        }
                        Err(e) => {
                            error!("[Thread {}] Send error: {:?}", thread_id, e);
                            stats.count_error();
                        }
                    }
                }
                
                total_sent += logs.len() as u64;
                
                // Rate limiting
                if config.interval > 0 {
                    sleep(Duration::from_millis(config.interval)).await;
                }
            }
            
            info!("Thread {} completed, sent {} logs", thread_id, total_sent);
        });
        
        handles.push(handle);
    }
    
    // Wait for all threads to complete
    for handle in handles {
        if let Err(e) = handle.await {
            error!("Thread panicked: {:?}", e);
        }
    }
    
    // Stop stats reporter
    stats_handle.abort();
    
    // Print final statistics
    stats.print_final();
    
    info!("Massive log generation completed!");
    Ok(())
}