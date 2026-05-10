use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub bind_addr: String,
    pub brt_rest_base: String,
    pub brt_socket_base: String,
    pub brt_key: String,
    pub allow_origin: String,
    pub log_filter: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let _ = dotenvy::dotenv();

        Ok(Self {
            bind_addr: env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".to_string()),
            brt_rest_base: env::var("BRT_REST_BASE")
                .map_err(|_| anyhow::anyhow!("BRT_REST_BASE is required"))?,
            brt_socket_base: env::var("BRT_SOCKET_BASE")
                .map_err(|_| anyhow::anyhow!("BRT_SOCKET_BASE is required"))?,
            brt_key: env::var("BRT_KEY")
                .map_err(|_| anyhow::anyhow!("BRT_KEY is required (32-byte UTF-8 secret)"))?,
            allow_origin: env::var("ALLOW_ORIGIN").unwrap_or_else(|_| "*".to_string()),
            log_filter: env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()),
        })
    }

    pub fn validate(&self) -> anyhow::Result<()> {
        if self.brt_key.as_bytes().len() != 32 {
            anyhow::bail!(
                "BRT_KEY must be exactly 32 UTF-8 bytes (got {})",
                self.brt_key.as_bytes().len()
            );
        }
        Ok(())
    }
}
