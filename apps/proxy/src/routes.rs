//! HTTP route handlers — thin layer over `BrtClient` with caching.
//!
//! Cache TTLs follow the recommendations in the BRT findings:
//!   · cities: 30 min
//!   · corridors / halte: 6 h
//! `?fresh=1` bypasses the cache for ops debugging.

use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    error::{AppError, AppResult},
    state::AppState,
};

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/cities", get(cities))
        .route("/api/cities/:pref/corridors", get(corridors))
        .route("/api/cities/:pref/halte", get(halte))
        .route("/api/cities/:pref/halte/:kor", get(halte_by_corridor))
        .with_state(state)
}

#[derive(Deserialize, Default)]
pub struct FreshFlag {
    #[serde(default)]
    pub fresh: Option<u8>,
}

fn is_fresh(q: &FreshFlag) -> bool {
    q.fresh.unwrap_or(0) == 1
}

async fn health(State(state): State<AppState>) -> impl IntoResponse {
    let upstream = state.upstream().await;
    let viewers = state.viewers().await;
    let token = state.brt().has_token().await;
    let uptime = state.started_at().elapsed().as_secs();

    Json(json!({
        "status": "ok",
        "uptime_s": uptime,
        "token": if token { "cached" } else { "absent" },
        "upstream": {
            "connected": upstream.connected,
            "last_event_at_unix": upstream.last_event_at_unix,
        },
        "viewers": viewers,
    }))
}

async fn cities(
    State(state): State<AppState>,
    Query(q): Query<FreshFlag>,
) -> AppResult<Json<Value>> {
    let cache = &state.cache().cities;
    if !is_fresh(&q) {
        if let Some(v) = cache.get(&()).await {
            return Ok(Json(v));
        }
    }
    let v = unwrap_data(state.brt().get_trans().await?);
    cache.insert((), v.clone()).await;
    Ok(Json(v))
}

async fn corridors(
    State(state): State<AppState>,
    Path(pref): Path<String>,
    Query(q): Query<FreshFlag>,
) -> AppResult<Json<Value>> {
    validate_pref(&pref)?;
    let cache = &state.cache().corridors;
    if !is_fresh(&q) {
        if let Some(v) = cache.get(&pref).await {
            return Ok(Json(v));
        }
    }
    let v = unwrap_data(state.brt().get_corridor(&pref).await?);
    cache.insert(pref, v.clone()).await;
    Ok(Json(v))
}

async fn halte(
    State(state): State<AppState>,
    Path(pref): Path<String>,
    Query(q): Query<FreshFlag>,
) -> AppResult<Json<Value>> {
    validate_pref(&pref)?;
    let cache = &state.cache().halte;
    if !is_fresh(&q) {
        if let Some(v) = cache.get(&pref).await {
            return Ok(Json(v));
        }
    }
    let v = unwrap_data(state.brt().get_routes(&pref).await?);
    cache.insert(pref, v.clone()).await;
    Ok(Json(v))
}

#[derive(Deserialize)]
struct LegQuery {
    toward: String,
    origin: String,
    #[serde(default)]
    fresh: Option<u8>,
}

async fn halte_by_corridor(
    State(state): State<AppState>,
    Path((pref, kor)): Path<(String, String)>,
    Query(q): Query<LegQuery>,
) -> AppResult<Json<Value>> {
    validate_pref(&pref)?;
    if kor.is_empty() || kor.len() > 16 {
        return Err(AppError::Upstream("invalid kor".into()));
    }
    let cache_key = format!("{pref}|{kor}|{}|{}", q.toward, q.origin);
    let cache = &state.cache().halte_by_corridor;
    if q.fresh.unwrap_or(0) != 1 {
        if let Some(v) = cache.get(&cache_key).await {
            return Ok(Json(v));
        }
    }
    let v = unwrap_data(
        state
            .brt()
            .get_route_corridor(&pref, &kor, &q.toward, &q.origin)
            .await?,
    );
    cache.insert(cache_key, v.clone()).await;
    Ok(Json(v))
}

/// The upstream wraps every list payload as `{"data": [...]}` plus
/// status/message metadata we don't expose. Strip the wrapper so the
/// frontend sees a plain array.
fn unwrap_data(v: Value) -> Value {
    match v {
        Value::Object(mut map) => map.remove("data").unwrap_or(Value::Array(vec![])),
        other => other,
    }
}

/// `pref` upstream is a numeric string (e.g. "12" or "11") — keep it
/// compact and digit-only so this can't be used to smuggle arbitrary
/// path/header content.
fn validate_pref(pref: &str) -> Result<(), AppError> {
    if pref.is_empty() || pref.len() > 6 || !pref.chars().all(|c| c.is_ascii_digit()) {
        return Err(AppError::Upstream("invalid pref".into()));
    }
    Ok(())
}

