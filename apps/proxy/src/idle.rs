//! How long each bus has been standing still.
//!
//! The upstream keeps relaying a parked bus's position every few
//! seconds with a fresh timestamp, so a browser that just opened the
//! page cannot tell a bus that parked five hours ago from one that
//! stopped at a red light. The proxy watches the feed continuously, so
//! it measures the standstill and adds `idle_s` to every bus event.

use std::collections::HashMap;
use std::sync::Mutex;

use serde_json::Value;

/// Moving this far from where the bus last "started" counts as a trip.
const MOVED_M: f64 = 25.0;
/// Reported speed at or above this counts as driving.
const MOVING_KMH: f64 = 5.0;

struct Anchor {
    lat: f64,
    lng: f64,
    since: u64,
}

#[derive(Default)]
pub struct IdleTracker {
    buses: Mutex<HashMap<String, Anchor>>,
}

fn num(v: Option<&Value>) -> Option<f64> {
    match v? {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse().ok(),
        _ => None,
    }
}

fn text(v: Option<&Value>) -> Option<String> {
    match v? {
        Value::String(s) if !s.is_empty() => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

fn haversine_m(a: (f64, f64), b: (f64, f64)) -> f64 {
    let r = 6_371_000.0;
    let (dl, dg) = ((b.0 - a.0).to_radians(), (b.1 - a.1).to_radians());
    let h = (dl / 2.0).sin().powi(2)
        + a.0.to_radians().cos() * b.0.to_radians().cos() * (dg / 2.0).sin().powi(2);
    2.0 * r * h.sqrt().asin()
}

impl IdleTracker {
    /// Add `idle_s` (seconds standing still) to a bus event. Events
    /// without a usable id or position pass through untouched.
    pub fn annotate(&self, pref: &str, event: &mut Value, now: u64) {
        let Some(obj) = event.as_object_mut() else {
            return;
        };
        let Some(id) = text(obj.get("imei")).or_else(|| text(obj.get("id"))) else {
            return;
        };
        let (Some(lat), Some(lng)) = (num(obj.get("lat")), num(obj.get("lng"))) else {
            return;
        };
        let speed = num(obj.get("speed")).unwrap_or(0.0);

        let idle = {
            let Ok(mut map) = self.buses.lock() else {
                return;
            };
            let anchor = map.entry(format!("{pref}|{id}")).or_insert(Anchor {
                lat,
                lng,
                since: now,
            });
            if speed >= MOVING_KMH || haversine_m((anchor.lat, anchor.lng), (lat, lng)) > MOVED_M {
                *anchor = Anchor {
                    lat,
                    lng,
                    since: now,
                };
            }
            now.saturating_sub(anchor.since)
        };
        obj.insert("idle_s".into(), Value::from(idle));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn idle(t: &IdleTracker, ev: Value, now: u64) -> u64 {
        let mut ev = ev;
        t.annotate("12", &mut ev, now);
        ev["idle_s"].as_u64().unwrap()
    }

    #[test]
    fn parked_bus_accumulates_idle_even_with_gps_jitter() {
        let t = IdleTracker::default();
        assert_eq!(
            idle(
                &t,
                json!({"imei":"a","lat":"-0.9000","lng":"119.8000","speed":0}),
                1000
            ),
            0
        );
        // 3 m of jitter, string coordinates as the feed sends them
        assert_eq!(
            idle(
                &t,
                json!({"imei":"a","lat":"-0.90003","lng":"119.8000","speed":0}),
                1400
            ),
            400
        );
    }

    #[test]
    fn driving_or_moving_resets_idle() {
        let t = IdleTracker::default();
        idle(
            &t,
            json!({"imei":"a","lat":-0.9,"lng":119.8,"speed":0}),
            1000,
        );
        assert_eq!(
            idle(
                &t,
                json!({"imei":"a","lat":-0.9,"lng":119.8,"speed":30}),
                1500
            ),
            0
        );
        idle(
            &t,
            json!({"imei":"a","lat":-0.9,"lng":119.8,"speed":0}),
            1600,
        );
        // ~110 m away
        assert_eq!(
            idle(
                &t,
                json!({"imei":"a","lat":-0.901,"lng":119.8,"speed":0}),
                1700
            ),
            0
        );
    }

    #[test]
    fn buses_are_tracked_separately_and_bad_events_pass() {
        let t = IdleTracker::default();
        idle(
            &t,
            json!({"imei":"a","lat":-0.9,"lng":119.8,"speed":0}),
            1000,
        );
        assert_eq!(
            idle(
                &t,
                json!({"imei":"b","lat":-0.9,"lng":119.8,"speed":0}),
                1100
            ),
            0
        );
        let mut bad = json!({"foo": 1});
        t.annotate("12", &mut bad, 1200);
        assert!(bad.get("idle_s").is_none());
    }
}
