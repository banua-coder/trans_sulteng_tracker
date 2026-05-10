use std::{sync::Arc, time::Duration};

use moka::future::Cache;
use serde_json::Value;
use tokio::sync::RwLock;

use crate::{brt::BrtClient, config::Config, error::AppResult};

/// Shared, cheaply-cloneable application state.
#[derive(Clone)]
pub struct AppState {
    inner: Arc<Inner>,
}

struct Inner {
    pub brt: BrtClient,
    pub cache: Caches,
    pub started_at: std::time::Instant,
    pub viewers: RwLock<u64>,
    pub upstream_status: RwLock<UpstreamStatus>,
}

#[derive(Clone, Debug, Default)]
pub struct UpstreamStatus {
    pub connected: bool,
    pub last_event_at_unix: Option<u64>,
}

pub struct Caches {
    pub cities: Cache<(), Value>,
    pub corridors: Cache<String, Value>,
    pub halte: Cache<String, Value>,
    pub halte_by_corridor: Cache<String, Value>,
}

impl Caches {
    fn new() -> Self {
        let small = || {
            Cache::builder()
                .max_capacity(64)
                .time_to_live(Duration::from_secs(60 * 60 * 6))
                .build()
        };
        Self {
            cities: Cache::builder()
                .max_capacity(8)
                .time_to_live(Duration::from_secs(30 * 60))
                .build(),
            corridors: small(),
            halte: small(),
            halte_by_corridor: small(),
        }
    }
}

impl AppState {
    pub fn new(cfg: &Config) -> AppResult<Self> {
        Ok(Self {
            inner: Arc::new(Inner {
                brt: BrtClient::new(cfg)?,
                cache: Caches::new(),
                started_at: std::time::Instant::now(),
                viewers: RwLock::new(0),
                upstream_status: RwLock::new(UpstreamStatus::default()),
            }),
        })
    }

    pub fn brt(&self) -> &BrtClient {
        &self.inner.brt
    }

    pub fn cache(&self) -> &Caches {
        &self.inner.cache
    }

    pub fn started_at(&self) -> std::time::Instant {
        self.inner.started_at
    }

    pub async fn viewers(&self) -> u64 {
        *self.inner.viewers.read().await
    }

    pub async fn add_viewer(&self) -> u64 {
        let mut g = self.inner.viewers.write().await;
        *g += 1;
        *g
    }

    pub async fn remove_viewer(&self) -> u64 {
        let mut g = self.inner.viewers.write().await;
        *g = g.saturating_sub(1);
        *g
    }

    pub async fn upstream(&self) -> UpstreamStatus {
        self.inner.upstream_status.read().await.clone()
    }

    pub async fn set_upstream(&self, status: UpstreamStatus) {
        *self.inner.upstream_status.write().await = status;
    }
}
