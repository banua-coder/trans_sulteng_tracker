mod brt;
mod config;
mod crypto;
mod error;
mod middleware;
mod routes;
mod sockets;
mod state;

use std::time::Duration;

use axum::{http::HeaderValue, middleware as axum_mw};
use tower_http::{
    compression::CompressionLayer, cors::CorsLayer, timeout::TimeoutLayer, trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::{config::Config, state::AppState};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cfg = Config::from_env()?;
    cfg.validate()?;
    init_tracing(&cfg.log_filter);

    let state = AppState::new(&cfg)?;

    // Build the Socket.IO bridge. The downstream layer goes onto the
    // axum app; the upstream client runs as a long-lived background
    // task that fans out BRT-{pref} events into per-pref rooms.
    let (sio_layer, sio_io) = sockets::build_downstream(state.clone());
    let _upstream_client = sockets::spawn_upstream(&cfg, sio_io.clone(), state.clone()).await?;

    // Strict CORS: a single allow-origin pulled from env. Wildcards
    // are intentionally NOT supported here — the proxy is meant to
    // serve cektrans.banuacoder.com only.
    let cors = build_cors(&cfg.allow_origin)?;

    // Lifetime-erase the configured allow-origin so the middleware closure
    // can be plain Fn + Copy. Allocating once at startup is fine.
    let allow_origin: &'static str =
        Box::leak(cfg.allow_origin.clone().into_boxed_str());
    let origin_mw = axum_mw::from_fn(move |req, next| async move {
        middleware::origin_gate(allow_origin, req, next).await
    });

    let app = routes::router(state)
        .layer(sio_layer)
        .layer(origin_mw)
        .layer(cors)
        .layer(CompressionLayer::new())
        .layer(TimeoutLayer::new(Duration::from_secs(15)))
        .layer(TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind(&cfg.bind_addr).await?;
    tracing::info!(addr = %cfg.bind_addr, allow_origin = %cfg.allow_origin, "cektrans-proxy listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

fn build_cors(allow_origin: &str) -> anyhow::Result<CorsLayer> {
    let origin = HeaderValue::from_str(allow_origin)?;
    Ok(CorsLayer::new()
        .allow_origin(origin)
        .allow_methods([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::OPTIONS,
        ])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
            axum::http::header::ACCEPT,
            axum::http::HeaderName::from_static("x-csrf-token"),
        ])
        .allow_credentials(true)
        .max_age(Duration::from_secs(60 * 60)))
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
        let mut s = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler");
        s.recv().await;
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();

    tokio::select! { _ = ctrl_c => {}, _ = term => {} }
    tracing::info!("shutdown signal received");
}
