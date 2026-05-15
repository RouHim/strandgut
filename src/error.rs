//! Application error types and HTTP error responses.
//!
//! Defines a unified `AppError` enum that can be converted into
//! `hyper::StatusCode` + body pairs.  Covers IO, config parsing,
//! routing, and scanner errors.
//!
//! Implementations are manual (no `anyhow` / `thiserror`).

use std::fmt;

/// Unified application error type.
///
/// Every fallible operation in the app returns one of these variants so
/// that the HTTP layer can produce a consistent JSON error response.
#[derive(Debug)]
pub enum AppError {
    /// Configuration file could not be read or parsed (→ 500).
    Config(String),
    /// Data serialization / deserialization failure (→ 400).
    Serialization(String),
    /// Requested resource does not exist (→ 404).
    NotFound(String),
    /// Malformed client request (→ 400).
    BadRequest(String),
    /// Unexpected internal failure (→ 500).
    Internal(String),
    /// Scanner / sub-process failure (→ 500).
    #[allow(dead_code)]
    ScanError(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Config(msg) => write!(f, "configuration error: {msg}"),
            AppError::Serialization(msg) => write!(f, "serialization error: {msg}"),
            AppError::NotFound(msg) => write!(f, "not found: {msg}"),
            AppError::BadRequest(msg) => write!(f, "bad request: {msg}"),
            AppError::Internal(msg) => write!(f, "internal error: {msg}"),
            AppError::ScanError(msg) => write!(f, "scan error: {msg}"),
        }
    }
}

impl std::error::Error for AppError {}

impl AppError {
    /// Map this error to the appropriate HTTP status code.
    pub fn to_http_status(&self) -> u16 {
        match self {
            AppError::Config(..) => 500,
            AppError::Serialization(..) => 400,
            AppError::NotFound(..) => 404,
            AppError::BadRequest(..) => 400,
            AppError::Internal(..) => 500,
            AppError::ScanError(..) => 500,
        }
    }

    /// Return a JSON body suitable for an HTTP error response.
    ///
    /// The body uses the `Display` message so the caller never
    /// accidentally leaks internal details (file paths, stack traces).
    pub fn to_json_body(&self) -> serde_json::Value {
        serde_json::json!({"error": self.to_string()})
    }
}

impl From<toml::de::Error> for AppError {
    fn from(err: toml::de::Error) -> Self {
        AppError::Config(err.to_string())
    }
}

impl From<toml::ser::Error> for AppError {
    fn from(err: toml::ser::Error) -> Self {
        AppError::Serialization(err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Serialization(err.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Config(err.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_status_codes() {
        let cases: Vec<(AppError, u16)> = vec![
            (AppError::Config("x".into()), 500),
            (AppError::Serialization("x".into()), 400),
            (AppError::NotFound("x".into()), 404),
            (AppError::BadRequest("x".into()), 400),
            (AppError::Internal("x".into()), 500),
            (AppError::ScanError("x".into()), 500),
        ];
        for (err, expected) in cases {
            let actual = err.to_http_status();
            assert_eq!(
                actual, expected,
                "expected status {expected} for {err:?}, got {actual}"
            );
        }
    }

    #[test]
    fn test_from_toml_de() {
        let raw = "key = ";
        let toml_err: toml::de::Error = toml::from_str::<toml::Value>(raw).unwrap_err();
        let app_err: AppError = toml_err.into();
        assert!(
            matches!(app_err, AppError::Config(..)),
            "expected Config variant, got {app_err:?}"
        );
    }

    #[test]
    fn test_from_toml_ser() {
        // toml::ser::Error is produced when trying to serialize a type
        // that TOML cannot represent (e.g. a map with non-string keys).
        use std::collections::BTreeMap;
        let mut map = BTreeMap::new();
        map.insert(vec![1u8], "value");
        let toml_err = toml::to_string(&map).unwrap_err();
        let app_err: AppError = toml_err.into();
        assert!(
            matches!(app_err, AppError::Serialization(..)),
            "expected Serialization variant, got {app_err:?}"
        );
    }

    #[test]
    fn test_from_serde_json() {
        let raw = "not valid json";
        let json_err: serde_json::Error =
            serde_json::from_str::<serde_json::Value>(raw).unwrap_err();
        let app_err: AppError = json_err.into();
        assert!(
            matches!(app_err, AppError::Serialization(..)),
            "expected Serialization variant, got {app_err:?}"
        );
    }

    #[test]
    fn test_from_io() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let app_err: AppError = io_err.into();
        assert!(
            matches!(app_err, AppError::Config(..)),
            "expected Config variant, got {app_err:?}"
        );
    }

    #[test]
    fn test_json_body() {
        let err = AppError::NotFound("bookmark".into());
        let body = err.to_json_body();
        let expected = serde_json::json!({"error": "not found: bookmark"});
        assert_eq!(body, expected, "JSON body did not match expected value");
    }

    #[test]
    fn test_display_format() {
        assert_eq!(
            AppError::Config("bad config".into()).to_string(),
            "configuration error: bad config"
        );
        assert_eq!(
            AppError::Serialization("bad data".into()).to_string(),
            "serialization error: bad data"
        );
        assert_eq!(
            AppError::NotFound("missing".into()).to_string(),
            "not found: missing"
        );
        assert_eq!(
            AppError::BadRequest("invalid input".into()).to_string(),
            "bad request: invalid input"
        );
        assert_eq!(
            AppError::Internal("oops".into()).to_string(),
            "internal error: oops"
        );
        assert_eq!(
            AppError::ScanError("timeout".into()).to_string(),
            "scan error: timeout"
        );
    }
}
