//! Socket.IO bridge.
//!
//! Two halves:
//!
//! 1. **Downstream** (`socketioxide`) — the Socket.IO server we expose
//!    to browsers at `/socket.io/`. Clients connect, emit
//!    `subscribe { pref }` to join a per-city room, and receive `bus`
//!    events whenever upstream emits a position for that pref.
//!
//! 2. **Upstream** (`rust_socketio`) — a single long-lived Socket.IO v4
//!    client to the BRT GpsApi (`${BRT_UPSTREAM_HOST}`). The
//!    server emits `BRT-{pref}` (e.g. `BRT-12` for Palu, `BRT-11` for
//!    Donggala) once per bus update; we forward those payloads to the
//!    matching downstream room.
//!
//! Per the findings the upstream is **EIO=4 only**, requires no auth,
//! and broadcasts every city on the same connection — we filter
//! client-side and fan out to per-pref rooms so each browser only
//! receives the city it cares about.

use std::time::{SystemTime, UNIX_EPOCH};

use rust_socketio::{
    asynchronous::{Client as UpstreamClient, ClientBuilder as UpstreamBuilder},
    Event, Payload, TransportType,
};
use serde::Deserialize;
use socketioxide::{
    extract::{Data, SocketRef},
    SocketIo,
};

use crate::{config::Config, state::{AppState, UpstreamStatus}};

/// A `pref` value the proxy will forward. Restricted to known cities so
/// the upstream firehose (which carries every BRT in Indonesia) doesn't
/// fan out to clients that don't expect it.
const ALLOWED_PREFS: &[&str] = &["11", "12"];

#[derive(Deserialize, Debug)]
struct SubscribeMsg {
    pref: String,
}

/// Build the downstream Socket.IO layer. Returns `(layer, io)` — the
/// layer is mounted on the axum router, the `io` handle is used by
/// the upstream bridge to emit into rooms.
pub fn build_downstream(state: AppState) -> (socketioxide::layer::SocketIoLayer, SocketIo) {
    let (layer, io) = SocketIo::builder().build_layer();

    // Default namespace.
    let state_for_ns = state.clone();
    io.ns("/", move |s: SocketRef| {
        let state = state_for_ns.clone();
        async move {
            let count = state.add_viewer().await;
            s.emit("viewers", &count).ok();
            s.broadcast().emit("viewers", &count).ok();

            tracing::debug!(sid = %s.id, viewers = count, "client connected");

            // subscribe { pref } → join room:{pref}
            let state_for_sub = state.clone();
            s.on("subscribe", move |s: SocketRef, Data::<SubscribeMsg>(msg)| {
                let _state = state_for_sub.clone();
                async move {
                    if !ALLOWED_PREFS.contains(&msg.pref.as_str()) {
                        tracing::debug!(pref = %msg.pref, "rejecting unknown pref");
                        return;
                    }
                    let room = format!("room:{}", msg.pref);
                    let _ = s.leave_all();
                    s.join(room.clone()).ok();
                    tracing::debug!(sid = %s.id, %room, "joined room");
                }
            });

            s.on("unsubscribe", move |s: SocketRef| async move {
                let _ = s.leave_all();
            });

            let state_for_disc = state.clone();
            s.on_disconnect(move |_s: SocketRef| {
                let state = state_for_disc.clone();
                async move {
                    let count = state.remove_viewer().await;
                    tracing::debug!(viewers = count, "client disconnected");
                }
            });
        }
    });

    (layer, io)
}

/// Spawn the long-lived upstream Socket.IO client. Returns immediately;
/// the connection runs in the background and reconnects automatically.
pub async fn spawn_upstream(
    cfg: &Config,
    io: SocketIo,
    state: AppState,
) -> anyhow::Result<UpstreamClient> {
    let url = cfg.brt_socket_base.clone();

    // Forward every BRT-{pref} event to the matching room.
    let io_for_any = io.clone();
    let state_for_any = state.clone();

    let client = UpstreamBuilder::new(url.clone())
        .transport_type(TransportType::Websocket)
        .reconnect(true)
        .on(Event::Connect, {
            let state = state.clone();
            move |_payload, _client| {
                let state = state.clone();
                Box::pin(async move {
                    state
                        .set_upstream(UpstreamStatus {
                            connected: true,
                            last_event_at_unix: now_unix(),
                        })
                        .await;
                    tracing::info!("upstream socket connected");
                })
            }
        })
        .on(Event::Close, {
            let state = state.clone();
            move |_payload, _client| {
                let state = state.clone();
                Box::pin(async move {
                    let prev = state.upstream().await;
                    state
                        .set_upstream(UpstreamStatus {
                            connected: false,
                            last_event_at_unix: prev.last_event_at_unix,
                        })
                        .await;
                    tracing::warn!("upstream socket closed");
                })
            }
        })
        .on(Event::Error, |payload, _client| {
            Box::pin(async move {
                tracing::warn!(?payload, "upstream socket error");
            })
        })
        .on_any(move |event, payload, _client| {
            let io = io_for_any.clone();
            let state = state_for_any.clone();
            Box::pin(async move {
                let name = event.as_str();
                let Some(pref) = name.strip_prefix("BRT-") else {
                    return;
                };
                if !ALLOWED_PREFS.contains(&pref) {
                    return;
                }

                state
                    .set_upstream(UpstreamStatus {
                        connected: true,
                        last_event_at_unix: now_unix(),
                    })
                    .await;

                // rust_socketio gives us a Payload; forward as JSON if possible.
                let value = match payload {
                    Payload::Text(values) => values.into_iter().next(),
                    Payload::Binary(_) => None,
                    // Other (deprecated) variants carry no JSON payload we
                    // care about — drop silently.
                    _ => None,
                };
                let Some(value) = value else { return };

                let room = format!("room:{pref}");
                if let Err(e) = io.to(room).emit("bus", &value) {
                    tracing::debug!(?e, %pref, "emit to room failed");
                }
            })
        })
        .connect()
        .await
        .map_err(|e| anyhow::anyhow!("upstream connect: {e}"))?;

    Ok(client)
}

fn now_unix() -> Option<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs())
}
