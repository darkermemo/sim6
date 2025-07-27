use clap::{Parser, Subcommand};
use std::process;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod server;
mod agent;
mod upload;
mod error;
mod handlers;
mod middleware;
mod models;
mod database;
mod auth;

use crate::error::Result;

#[derive(Parser)]
#[command(name = "clickvisual")]
#[command(about = "A Rust-based ClickVisual server for log visualization and analysis")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the ClickVisual server
    Server {
        /// Configuration file path
        #[arg(short, long, default_value = "config.toml")]
        config: String,
        /// Server port
        #[arg(short, long, default_value = "19001")]
        port: u16,
    },
    /// Start the agent mode
    Agent {
        /// Configuration file path
        #[arg(short, long, default_value = "agent.toml")]
        config: String,
    },
    /// Upload utilities
    Upload {
        /// File to upload
        #[arg(short, long)]
        file: String,
        /// Target endpoint
        #[arg(short, long)]
        endpoint: String,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "clickvisual_rust=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let cli = Cli::parse();

    match cli.command {
        Commands::Server { config, port } => {
            tracing::info!("Starting ClickVisual Rust server on port {}", port);
            server::run(config, port).await
        }
        Commands::Agent { config } => {
            tracing::info!("Starting ClickVisual Rust agent");
            agent::run(config).await
        }
        Commands::Upload { file, endpoint } => {
            tracing::info!("Uploading file {} to {}", file, endpoint);
            upload::run(file, endpoint).await
        }
    }
}