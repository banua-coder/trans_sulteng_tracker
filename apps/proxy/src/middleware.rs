//! Lightweight middleware: Origin / Referer header gate.
//!
//! A static SPA cannot stop a determined attacker from inspecting its
//! network traffic — anyone with devtools sees every request, and a
//! curl invocation can spoof any header. This middleware is *not* a
//! security boundary on its own; it is a low-cost layer that makes
//! casual embedding and lazy scraping fail closed. Pair it with a
//! Turnstile + HMAC session token (T6.2) for real abuse resistance.

use axum::{
    extract::Request,
    http::{header, StatusCode},
    middleware::Next,
    response::Response,
};

/// Reject requests whose `Origin` (or `Referer` as fallback) does not
/// start with the configured allow-origin. Health probes and
/// preflights are allowed through unconditionally.
pub async fn origin_gate(
    allow_origin: &str,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let path = req.uri().path();
    let method = req.method();

    // Always let CORS preflights and the health probe through —
    // both are useful to upstream tooling and contain no data.
    if method == axum::http::Method::OPTIONS || path == "/api/health" {
        return Ok(next.run(req).await);
    }

    let origin = req
        .headers()
        .get(header::ORIGIN)
        .or_else(|| req.headers().get(header::REFERER))
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if origin.is_empty() || !origin.starts_with(allow_origin) {
        tracing::debug!(?path, ?method, %origin, "rejecting bad origin");
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(next.run(req).await)
}
