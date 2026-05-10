use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("upstream BRT error: {0}")]
    Upstream(String),

    #[error("crypto error: {0}")]
    Crypto(String),

    #[error("not found")]
    NotFound,

    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code) = match &self {
            AppError::Upstream(_) => (StatusCode::BAD_GATEWAY, "upstream_error"),
            AppError::Crypto(_) => (StatusCode::INTERNAL_SERVER_ERROR, "crypto_error"),
            AppError::NotFound => (StatusCode::NOT_FOUND, "not_found"),
            AppError::Other(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error"),
        };
        let body = Json(json!({ "error": code, "message": self.to_string() }));
        (status, body).into_response()
    }
}

pub type AppResult<T> = Result<T, AppError>;
