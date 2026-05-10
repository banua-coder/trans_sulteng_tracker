//! Upstream BRT GpsApi REST client.
//!
//! Wraps the encrypted REST contract behind a small async surface:
//!   · `BrtClient::get_trans()` — list of BRT cities (cacheable ~30 min)
//!   · `BrtClient::get_corridor(pref)` — corridors for a city (cacheable ~6 h)
//!   · `BrtClient::get_routes(pref)` — halte for a city (cacheable ~6 h)
//!   · `BrtClient::get_route_corridor(pref, kor, toward, origin)` — halte on
//!     one corridor leg
//!
//! Implementation notes (from the recovered findings):
//!
//!   1. `GET /getToken` returns an AES-CBC body encrypted with
//!      `secretKeyGpsSocket`. Decrypt → JSON of `{ tokenType, data: { token } }`.
//!      The bearer header is `"{tokenType} {token}"`.
//!   2. POSTs to `/getCorridor`, `/getRoutes`, `/getRouteCorridor` are
//!      `application/x-www-form-urlencoded`, but the body is the AES-CBC
//!      ciphertext of the form-encoded plaintext (e.g. `pref=12`). The
//!      Content-Type stays urlencoded.
//!   3. Any 401 → re-fetch the token and retry **once** with header
//!      `Retry: true`. Subsequent 401s bubble up as upstream errors.
//!   4. Other GpsApi response bodies are plaintext JSON — return as-is.

use std::time::Duration;

use reqwest::{header, Client, Method, StatusCode};
use serde::Deserialize;
use serde_json::Value;
use tokio::sync::RwLock;
use url::Url;

use crate::{
    config::Config,
    crypto,
    error::{AppError, AppResult},
};

#[derive(Deserialize)]
struct TokenEnvelope {
    #[serde(default, rename = "tokenType")]
    token_type: Option<String>,
    data: TokenInner,
}

#[derive(Deserialize)]
struct TokenInner {
    token: String,
}

pub struct BrtClient {
    http: Client,
    base: Url,
    key: String,
    token: RwLock<Option<String>>,
}

impl BrtClient {
    pub fn new(cfg: &Config) -> AppResult<Self> {
        let http = Client::builder()
            .user_agent(concat!(
                "cektrans-proxy/",
                env!("CARGO_PKG_VERSION"),
                " (+https://cektrans.banuacoder.com)"
            ))
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| AppError::Upstream(format!("http client: {e}")))?;

        let base = Url::parse(&cfg.brt_rest_base)
            .map_err(|e| AppError::Upstream(format!("BRT_REST_BASE invalid: {e}")))?;

        Ok(Self {
            http,
            base,
            key: cfg.brt_key.clone(),
            token: RwLock::new(None),
        })
    }

    /// Whether we currently hold a cached bearer header.
    pub async fn has_token(&self) -> bool {
        self.token.read().await.is_some()
    }

    /// Force a token refresh — useful for `/api/health` probes.
    #[allow(dead_code)] // wired up by T6.x health probe work.
    pub async fn refresh_token(&self) -> AppResult<()> {
        let bearer = self.fetch_token().await?;
        *self.token.write().await = Some(bearer);
        Ok(())
    }

    async fn fetch_token(&self) -> AppResult<String> {
        let url = self
            .base
            .join("getToken")
            .map_err(|e| AppError::Upstream(format!("join getToken: {e}")))?;

        let r = self
            .http
            .get(url)
            .send()
            .await
            .map_err(|e| AppError::Upstream(format!("getToken: {e}")))?;

        if !r.status().is_success() {
            return Err(AppError::Upstream(format!(
                "getToken returned {}",
                r.status()
            )));
        }

        let body = r
            .text()
            .await
            .map_err(|e| AppError::Upstream(format!("getToken body: {e}")))?;

        // Whole body is the AES-CBC ciphertext (base64).
        let plain = crypto::decrypt(body.trim(), &self.key)?;
        let env: TokenEnvelope = serde_json::from_str(&plain)
            .map_err(|e| AppError::Upstream(format!("getToken json: {e}")))?;

        let kind = env.token_type.as_deref().unwrap_or("Bearer");
        Ok(format!("{kind} {}", env.data.token))
    }

    async fn cached_token(&self) -> AppResult<String> {
        if let Some(b) = self.token.read().await.clone() {
            return Ok(b);
        }
        let bearer = self.fetch_token().await?;
        *self.token.write().await = Some(bearer.clone());
        Ok(bearer)
    }

    /// Run a GpsApi call. `form` is the URL-encoded form string for POSTs
    /// (e.g. `"pref=12"`), encrypted on the wire. GET requests omit it.
    async fn call(&self, method: Method, path: &str, form: Option<String>) -> AppResult<Value> {
        let url = self
            .base
            .join(path)
            .map_err(|e| AppError::Upstream(format!("join {path}: {e}")))?;

        let do_request = |bearer: String, retry: bool| {
            let mut req = self
                .http
                .request(method.clone(), url.clone())
                .header(header::AUTHORIZATION, bearer);
            if retry {
                req = req.header("Retry", "true");
            }
            if let Some(plaintext) = &form {
                let ciphertext = match crypto::encrypt(plaintext, &self.key) {
                    Ok(c) => c,
                    Err(e) => return Err(e),
                };
                req = req
                    .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                    .body(ciphertext);
            }
            Ok(req)
        };

        let bearer = self.cached_token().await?;
        let r = do_request(bearer, false)?
            .send()
            .await
            .map_err(|e| AppError::Upstream(format!("{path}: {e}")))?;

        let r = if r.status() == StatusCode::UNAUTHORIZED {
            let fresh = self.fetch_token().await?;
            *self.token.write().await = Some(fresh.clone());
            do_request(fresh, true)?
                .send()
                .await
                .map_err(|e| AppError::Upstream(format!("{path} retry: {e}")))?
        } else {
            r
        };

        if !r.status().is_success() {
            return Err(AppError::Upstream(format!(
                "{path} returned {}",
                r.status()
            )));
        }

        r.json::<Value>()
            .await
            .map_err(|e| AppError::Upstream(format!("{path} json: {e}")))
    }

    pub async fn get_trans(&self) -> AppResult<Value> {
        self.call(Method::GET, "getTrans", None).await
    }

    pub async fn get_corridor(&self, pref: &str) -> AppResult<Value> {
        self.call(Method::POST, "getCorridor", Some(form(&[("pref", pref)])))
            .await
    }

    pub async fn get_routes(&self, pref: &str) -> AppResult<Value> {
        self.call(Method::POST, "getRoutes", Some(form(&[("pref", pref)])))
            .await
    }

    pub async fn get_route_corridor(
        &self,
        pref: &str,
        kor: &str,
        toward: &str,
        origin: &str,
    ) -> AppResult<Value> {
        self.call(
            Method::POST,
            "getRouteCorridor",
            Some(form(&[
                ("pref", pref),
                ("kor", kor),
                ("toward", toward),
                ("origin", origin),
            ])),
        )
        .await
    }
}

fn form(pairs: &[(&str, &str)]) -> String {
    serde_urlencoded::to_string(pairs).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn form_encodes_pairs() {
        assert_eq!(form(&[("pref", "12")]), "pref=12");
        assert_eq!(form(&[("pref", "12"), ("kor", "K1")]), "pref=12&kor=K1");
        // values are percent-encoded.
        assert_eq!(form(&[("toward", "PASAR INPRES")]), "toward=PASAR+INPRES");
    }
}
