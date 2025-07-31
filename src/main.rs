use axum::Router;
use std::net::SocketAddr;
use tokio;
use tower_http::cors::CorsLayer;
use tracing_subscriber;
use siem_schema_validator::dev_events_handler::create_dev_events_router;

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Create the main router
    let app = Router::new()
        .nest("/api", create_dev_events_router())
        .layer(CorsLayer::permissive());

    // Define the address to bind to
    let addr = SocketAddr::from(([0, 0, 0, 0], 8000));
    
    println!("🚀 Server starting on http://localhost:8000");
    println!("📊 Dev Events API available at: http://localhost:8000/api/dev-events");

    // Start the server
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}