use axum::Server;
use siem_unified_pipeline::v2::{router, state::AppState};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let st = AppState::new("http://localhost:8123", "dev.events");
    let app = router::build(st);

    Server::bind(&"0.0.0.0:9999".parse()?)
        .serve(app.into_make_service())
        .await?;
    Ok(())
}

