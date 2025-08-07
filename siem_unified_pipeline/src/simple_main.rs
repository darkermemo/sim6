use std::net::SocketAddr;
use tokio;
use tracing_subscriber;
use clap::{Parser, Subcommand};
use anyhow::{Result, Context};

mod simple_server;

use crate::simple_server::create_router;

#[derive(Parser)]
#[command(name = "siem-simple")]
#[command(about = "Simple SIEM Server with SSE")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the SIEM server
    Server {
        /// Port to run the server on
        #[arg(long, default_value = "8081")]
        port: u16,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let cli = Cli::parse();

    match cli.command {
        Commands::Server { port } => {
            run_server(port).await?;
        }
    }

    Ok(())
}

async fn run_server(port: u16) -> Result<()> {
    tracing::info!("🚀 Starting Simple SIEM Server on port {}", port);

    // Create the router
    let app = create_router();

    // Start the server
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .context("Failed to bind to address")?;

    tracing::info!("🌟 SIEM Dashboard: http://localhost:{}/dev/", port);
    tracing::info!("📡 Live Stream: http://localhost:{}/dev/stream", port);
    tracing::info!("📊 API Health: http://localhost:{}/health", port);
    tracing::info!("🔄 SSE Stream: http://localhost:{}/api/v1/events/stream", port);

    axum::serve(listener, app)
        .await
        .context("Server error")?;

    Ok(())
}
