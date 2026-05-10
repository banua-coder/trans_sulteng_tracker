mod config;
mod error;

use std::time::Duration;

use axum::{routing::get, Json, Router};
use serde_json::json;
use tower_http::{
    compression::CompressionLayer,
    cors::{Any, CorsLayer},
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::config::Config;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cfg = Config::from_env()?;
    cfg.validate()?;

    init_tracing(&cfg.log_filter);

    let app = Router::new()
        .route("/api/health", get(health))
        .layer(CompressionLayer::new())
        .layer(TimeoutLayer::new(Duration::from_secs(15)))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .layer(TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind(&cfg.bind_addr).await?;
    tracing::info!(addr = %cfg.bind_addr, "cektrans-proxy listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({
        "status": "ok",
        "upstream": "unknown",
        "token": "absent",
    }))
}

fn init_tracing(filter: &str) {
    tracing_subscriber::registry()
        .with(EnvFilter::try_new(filter).unwrap_or_else(|_| EnvFilter::new("info")))
        .with(tracing_subscriber::fmt::layer().with_target(false))
        .init();
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c().await.ok();
    };
    #[cfg(unix)]
    let term = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .ok()
            .and_then(|mut s| Some(async move { s.recv().await }))
            .expect("install SIGTERM handler")
            .await;
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();

    tokio::select! { _ = ctrl_c => {}, _ = term => {} }
    tracing::info!("shutdown signal received");
}
