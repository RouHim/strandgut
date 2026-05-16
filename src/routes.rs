//! HTTP route definitions and handler dispatch.
//!
//! Builds a `matchit::Router` table that maps incoming request paths
//! to route variants, then dispatches to the appropriate handler.

use std::sync::Arc;
use std::sync::atomic::Ordering;

use http_body_util::BodyExt;
use hyper::body::Bytes;
use hyper::{Method, Request, Response, StatusCode};
use matchit::Router;
use serde::Deserialize;

use crate::AppState;
use crate::background;
use crate::config::Config;
use crate::error::AppError;
use crate::scan::ScanInProgress;
use crate::spa;

// Re-export with explicit generics so both main.rs and tests can use it.
// UnsyncBoxBody is the concrete type returned by `.boxed()` when the body
// does not satisfy the `Send` bound (e.g. mapped Full<Bytes>).
type BoxBody = http_body_util::combinators::UnsyncBoxBody<Bytes, hyper::Error>;

// ---------------------------------------------------------------------------
// Route table
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Route {
    Health,
    Readyz,
    ConfigGet,
    #[allow(dead_code)]
    ConfigPut,
    ScanStart,
    Assets,
    SpaFallback,
    BackgroundStatus,
    BackgroundPhoto,
    IconSearch,
}

fn build_router() -> Router<Route> {
    let mut router = Router::new();
    router
        .insert("/api/health", Route::Health)
        .expect("route /api/health already registered");
    router
        .insert("/api/readyz", Route::Readyz)
        .expect("route /api/readyz already registered");
    router
        .insert("/api/config", Route::ConfigGet)
        .expect("route /api/config already registered");
    router
        .insert("/api/scan", Route::ScanStart)
        .expect("route /api/scan already registered");
    router
        .insert("/assets/{*path}", Route::Assets)
        .expect("route /assets/{*path} already registered");
    router
        .insert("/", Route::SpaFallback)
        .expect("route / already registered");
    router
        .insert("/{*path}", Route::SpaFallback)
        .expect("route /{*path} already registered");
    router
        .insert("/api/background/status", Route::BackgroundStatus)
        .expect("route /api/background/status already registered");
    router
        .insert("/api/background/photo", Route::BackgroundPhoto)
        .expect("route /api/background/photo already registered");
    router
        .insert("/api/icons/search", Route::IconSearch)
        .expect("route /api/icons/search already registered");
    router
}

fn get_router() -> &'static Router<Route> {
    use std::sync::OnceLock;
    static ROUTER: OnceLock<Router<Route>> = OnceLock::new();
    ROUTER.get_or_init(build_router)
}

async fn read_body<B>(body: B) -> Result<Vec<u8>, AppError>
where
    B: BodyExt + Send,
    B::Error: std::fmt::Display,
{
    let collected = body
        .collect()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(collected.to_bytes().to_vec())
}

#[derive(Deserialize)]
struct ScanRequest {
    host: String,
    #[serde(default)]
    ports: Option<Vec<u16>>,
    #[serde(default = "default_scan_depth")]
    depth: String,
}

fn default_scan_depth() -> String {
    "simple".to_string()
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Dispatch an HTTP request to the appropriate handler.
///
/// Generic over the body type `B` so that unit tests can pass
/// `http_body_util::Full<Bytes>` directly instead of constructing
/// a true `hyper::body::Incoming`.
pub async fn handle_request<B>(
    req: Request<B>,
    state: Arc<AppState>,
) -> Result<Response<BoxBody>, AppError>
where
    B: BodyExt + Send + 'static,
    B::Error: std::fmt::Display,
{
    let path = req.uri().path().to_string();
    let method = req.method().clone();

    let matched = get_router()
        .at(&path)
        .map_err(|_| AppError::NotFound(format!("no route for path: {path}")))?;

    match matched.value {
        Route::Health | Route::Readyz => {
            if method != Method::GET {
                return Ok(method_not_allowed());
            }
            Ok(json_response(
                StatusCode::OK,
                &serde_json::json!({"status": "ok"}),
            ))
        }

        Route::ConfigGet | Route::ConfigPut => {
            if method == Method::GET {
                let config = Config::load(state.config_path.as_ref())
                    .map_err(|e| AppError::Internal(e.to_string()))?;
                let value = serde_json::to_value(&config)?;
                Ok(json_response(StatusCode::OK, &value))
            } else if method == Method::PUT {
                let body_bytes = read_body(req.into_body()).await?;
                let config: Config = serde_json::from_slice(&body_bytes)
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;
                config
                    .save(state.config_path.as_ref())
                    .map_err(|e| AppError::Internal(e.to_string()))?;
                let value = serde_json::to_value(&config)?;
                Ok(json_response(StatusCode::OK, &value))
            } else {
                Ok(method_not_allowed())
            }
        }

        Route::ScanStart => {
            if method != Method::POST {
                return Ok(method_not_allowed());
            }

            let was_running = state
                .scan_in_progress
                .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                .is_err();

            if was_running {
                return Ok(json_response(
                    StatusCode::CONFLICT,
                    &serde_json::json!({"error": "scan already in progress"}),
                ));
            }

            let body_bytes = match read_body(req.into_body()).await {
                Ok(b) => b,
                Err(e) => {
                    state.scan_in_progress.store(false, Ordering::SeqCst);
                    return Err(e);
                }
            };

            let scan_req: ScanRequest = match serde_json::from_slice(&body_bytes) {
                Ok(r) => r,
                Err(e) => {
                    state.scan_in_progress.store(false, Ordering::SeqCst);
                    return Err(AppError::BadRequest(e.to_string()));
                }
            };

            let ports = scan_req
                .ports
                .unwrap_or_else(|| crate::scan::get_ports(&scan_req.depth));

            let stream = crate::scan::scan_with_sse(
                scan_req.host,
                ports,
                ScanInProgress(state.scan_in_progress.clone()),
            )
            .await;

            let body = stream.map_err(|never| match never {}).boxed_unsync();

            Ok(Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", "text/event-stream")
                .header("Cache-Control", "no-cache")
                .header("Connection", "keep-alive")
                .header("X-Accel-Buffering", "no")
                .body(body)
                .expect("SSE response built from valid parts"))
        }

        Route::Assets => {
            if method != Method::GET {
                return Ok(method_not_allowed());
            }
            let asset_path = matched.params.get("path").unwrap_or("");
            spa::serve_asset(asset_path)
        }

        Route::BackgroundStatus => {
            if method != Method::GET {
                return Ok(method_not_allowed());
            }
            let config = Config::load(state.config_path.as_ref())
                .map_err(|e| AppError::Internal(e.to_string()))?;
            let status = {
                let bg = state
                    .background
                    .lock()
                    .map_err(|_| AppError::Internal("background state mutex poisoned".into()))?;
                background::get_background_status(&bg, &config)
            };

            if config.background_rotate {
                let needs_fetch = {
                    let bg = state.background.lock().map_err(|_| {
                        AppError::Internal("background state mutex poisoned".into())
                    })?;
                    let has_cache = bg.cached_path.is_some();
                    let is_stale = bg
                        .last_fetch
                        .map(|t| t.elapsed().as_secs() > background::ROTATION_INTERVAL_SECS)
                        .unwrap_or(true);
                    let not_in_progress = !bg.fetch_in_progress.load(Ordering::SeqCst);
                    not_in_progress && (!has_cache || is_stale)
                };

                if needs_fetch {
                    let bg = Arc::clone(&state.background);
                    let cfg = config.clone();
                    let path = Arc::clone(&state.config_path);
                    tokio::task::spawn(async move {
                        let _ =
                            background::try_fetch_and_cache_async(bg, Arc::new(cfg), path).await;
                    });
                }
            }

            Ok(json_response(
                StatusCode::OK,
                &serde_json::to_value(&status)?,
            ))
        }

        Route::BackgroundPhoto => {
            if method != Method::GET {
                return Ok(method_not_allowed());
            }
            let cache_dir = background::get_cache_dir(state.config_path.as_ref());
            match background::read_cached_photo(&cache_dir.join("background.jpg")) {
                Ok(bytes) => {
                    let body = http_body_util::Full::new(Bytes::from(bytes))
                        .map_err(|never| match never {})
                        .boxed_unsync();
                    Ok(Response::builder()
                        .status(StatusCode::OK)
                        .header("Content-Type", "image/jpeg")
                        .header("Cache-Control", "no-cache")
                        .body(body)
                        .expect("photo response built from valid parts"))
                }
                Err(_) => {
                    let empty = http_body_util::Full::new(Bytes::new())
                        .map_err(|never| match never {})
                        .boxed_unsync();
                    Ok(Response::builder()
                        .status(StatusCode::NO_CONTENT)
                        .body(empty)
                        .expect("204 response built from valid parts"))
                }
            }
        }

        Route::IconSearch => {
            if method != Method::GET {
                return Ok(method_not_allowed());
            }

            // Parse `q` query parameter from the URI.
            let query = req
                .uri()
                .query()
                .and_then(|qs| {
                    qs.split('&').find_map(|pair| {
                        let mut kv = pair.splitn(2, '=');
                        match (kv.next(), kv.next()) {
                            (Some("q"), Some(v)) => Some(v.to_string()),
                            _ => None,
                        }
                    })
                })
                .unwrap_or_default();

            if query.is_empty() {
                return Ok(json_response(StatusCode::OK, &serde_json::json!([])));
            }

            // Non-blocking freshness check; spawns background refresh if stale.
            state.icon_cache.ensure_fresh();

            let results = state.icon_cache.search(&query, 50)?;
            Ok(json_response(
                StatusCode::OK,
                &serde_json::to_value(&results)?,
            ))
        }

        Route::SpaFallback => {
            if path.starts_with("/api/") {
                return Ok(not_found_response());
            }
            spa::serve_index()
        }
    }
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

fn json_response(status: StatusCode, body: &serde_json::Value) -> Response<BoxBody> {
    let json = serde_json::to_string(body).unwrap_or_default();
    let boxed = http_body_util::Full::new(Bytes::from(json))
        .map_err(|never| match never {})
        .boxed_unsync();
    Response::builder()
        .status(status)
        .header("Content-Type", "application/json")
        .body(boxed)
        .expect("JSON response built from valid parts")
}

fn method_not_allowed() -> Response<BoxBody> {
    json_response(
        StatusCode::METHOD_NOT_ALLOWED,
        &serde_json::json!({"error": "method not allowed"}),
    )
}

fn not_found_response() -> Response<BoxBody> {
    json_response(
        StatusCode::NOT_FOUND,
        &serde_json::json!({"error": "not found"}),
    )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use http_body_util::Full;
    use hyper::body::Body;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    fn temp_config_path(name: &str) -> String {
        std::env::temp_dir()
            .join(format!("strandgut_test_routes_{}", name))
            .to_string_lossy()
            .to_string()
    }

    #[tokio::test]
    async fn test_health_endpoint() -> Result<(), AppError> {
        let req = Request::builder()
            .uri("/api/health")
            .method(Method::GET)
            .body(Full::new(Bytes::new()))
            .unwrap();
        let state = Arc::new(AppState {
            config_path: Arc::new("config.toml".into()),
            scan_in_progress: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            cancel_scan: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            background: Arc::new(std::sync::Mutex::new(
                crate::background::BackgroundState::new(),
            )),
            icon_cache: Arc::new(crate::icons::IconCache::new("./config.toml")),
        });

        let resp = handle_request(req, state).await.unwrap();
        assert_eq!(resp.status(), 200);

        let body = body_to_string(resp).await?;
        assert_eq!(body, r#"{"status":"ok"}"#);
        Ok(())
    }

    #[tokio::test]
    async fn test_readyz_endpoint() -> Result<(), AppError> {
        let req = Request::builder()
            .uri("/api/readyz")
            .method(Method::GET)
            .body(Full::new(Bytes::new()))
            .unwrap();
        let state = Arc::new(AppState {
            config_path: Arc::new("config.toml".into()),
            scan_in_progress: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            cancel_scan: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            background: Arc::new(std::sync::Mutex::new(
                crate::background::BackgroundState::new(),
            )),
            icon_cache: Arc::new(crate::icons::IconCache::new("./config.toml")),
        });

        let resp = handle_request(req, state).await.unwrap();
        assert_eq!(resp.status(), 200);

        let body = body_to_string(resp).await?;
        assert_eq!(body, r#"{"status":"ok"}"#);
        Ok(())
    }

    #[tokio::test]
    async fn test_spa_fallback() -> Result<(), AppError> {
        let req = Request::builder()
            .uri("/random")
            .method(Method::GET)
            .body(Full::new(Bytes::new()))
            .unwrap();
        let state = Arc::new(AppState {
            config_path: Arc::new("config.toml".into()),
            scan_in_progress: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            cancel_scan: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            background: Arc::new(std::sync::Mutex::new(
                crate::background::BackgroundState::new(),
            )),
            icon_cache: Arc::new(crate::icons::IconCache::new("./config.toml")),
        });

        let resp = handle_request(req, state).await.unwrap();
        assert_eq!(resp.status(), 200);

        let body = body_to_string(resp).await?;
        assert!(
            body.contains("<!DOCTYPE html>"),
            "expected HTML, got: {body:.80}"
        );
        Ok(())
    }

    #[tokio::test]
    async fn test_method_not_allowed() -> Result<(), AppError> {
        let req = Request::builder()
            .uri("/api/health")
            .method(Method::POST)
            .body(Full::new(Bytes::new()))
            .unwrap();
        let state = Arc::new(AppState {
            config_path: Arc::new("config.toml".into()),
            scan_in_progress: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            cancel_scan: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            background: Arc::new(std::sync::Mutex::new(
                crate::background::BackgroundState::new(),
            )),
            icon_cache: Arc::new(crate::icons::IconCache::new("./config.toml")),
        });

        let resp = handle_request(req, state).await.unwrap();
        assert_eq!(resp.status(), 405);

        let body = body_to_string(resp).await?;
        assert_eq!(body, r#"{"error":"method not allowed"}"#);
        Ok(())
    }

    #[tokio::test]
    async fn test_assets_serving() -> Result<(), AppError> {
        let req = Request::builder()
            .uri("/assets/js/app.js")
            .method(Method::GET)
            .body(Full::new(Bytes::new()))
            .unwrap();
        let state = Arc::new(AppState {
            config_path: Arc::new("config.toml".into()),
            scan_in_progress: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            cancel_scan: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            background: Arc::new(std::sync::Mutex::new(
                crate::background::BackgroundState::new(),
            )),
            icon_cache: Arc::new(crate::icons::IconCache::new("./config.toml")),
        });

        let resp = handle_request(req, state).await.unwrap();
        assert_eq!(resp.status(), 200);

        let content_type = resp
            .headers()
            .get("Content-Type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        assert!(
            content_type.contains("javascript"),
            "expected javascript content type, got: {content_type}"
        );

        let body = body_to_string(resp).await?;
        assert!(!body.is_empty(), "asset body should not be empty");
        Ok(())
    }

    #[tokio::test]
    async fn test_config_get() -> Result<(), AppError> {
        let path = temp_config_path("get");
        let _ = std::fs::remove_file(&path);

        let req = Request::builder()
            .uri("/api/config")
            .method(Method::GET)
            .body(Full::new(Bytes::new()))
            .unwrap();
        let state = Arc::new(AppState {
            config_path: Arc::new(path.clone()),
            scan_in_progress: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            cancel_scan: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            background: Arc::new(std::sync::Mutex::new(
                crate::background::BackgroundState::new(),
            )),
            icon_cache: Arc::new(crate::icons::IconCache::new("./config.toml")),
        });

        let resp = handle_request(req, state).await.unwrap();
        assert_eq!(resp.status(), 200);

        let body = body_to_string(resp).await?;
        let json: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert_eq!(json.get("title").unwrap(), "Strandgut");

        let _ = std::fs::remove_file(&path);
        Ok(())
    }

    #[tokio::test]
    async fn test_config_put_valid() -> Result<(), AppError> {
        let path = temp_config_path("put_valid");
        let _ = std::fs::remove_file(&path);

        let body =
            r#"{"title":"Test Config","language":"en","scan_defaults":"simple","services":[]}"#;
        let req = Request::builder()
            .uri("/api/config")
            .method(Method::PUT)
            .body(Full::new(Bytes::from(body)))
            .unwrap();
        let state = Arc::new(AppState {
            config_path: Arc::new(path.clone()),
            scan_in_progress: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            cancel_scan: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            background: Arc::new(std::sync::Mutex::new(
                crate::background::BackgroundState::new(),
            )),
            icon_cache: Arc::new(crate::icons::IconCache::new("./config.toml")),
        });

        let resp = handle_request(req, state).await.unwrap();
        assert_eq!(resp.status(), 200);

        let body = body_to_string(resp).await?;
        let json: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert_eq!(json.get("title").unwrap(), "Test Config");

        let loaded = Config::load(&path).unwrap();
        assert_eq!(loaded.title, "Test Config");

        let _ = std::fs::remove_file(&path);
        Ok(())
    }

    #[tokio::test]
    async fn test_config_put_invalid() {
        let path = temp_config_path("put_invalid");
        let _ = std::fs::remove_file(&path);

        let req = Request::builder()
            .uri("/api/config")
            .method(Method::PUT)
            .body(Full::new(Bytes::from("not valid json")))
            .unwrap();
        let state = Arc::new(AppState {
            config_path: Arc::new(path.clone()),
            scan_in_progress: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            cancel_scan: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            background: Arc::new(std::sync::Mutex::new(
                crate::background::BackgroundState::new(),
            )),
            icon_cache: Arc::new(crate::icons::IconCache::new("./config.toml")),
        });

        let resp = handle_request(req, state).await;
        assert!(resp.is_err());
        let err = resp.unwrap_err();
        assert!(
            matches!(err, AppError::BadRequest(..)),
            "expected BadRequest, got {err:?}"
        );

        assert!(!std::path::Path::new(&path).exists());
    }

    #[tokio::test]
    async fn test_config_roundtrip() -> Result<(), AppError> {
        let path = temp_config_path("roundtrip");
        let _ = std::fs::remove_file(&path);

        let body = r#"{"title":"Roundtrip","language":"de","scan_defaults":"full","services":[]}"#;

        let put_req = Request::builder()
            .uri("/api/config")
            .method(Method::PUT)
            .body(Full::new(Bytes::from(body)))
            .unwrap();
        let state = Arc::new(AppState {
            config_path: Arc::new(path.clone()),
            scan_in_progress: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            cancel_scan: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            background: Arc::new(std::sync::Mutex::new(
                crate::background::BackgroundState::new(),
            )),
            icon_cache: Arc::new(crate::icons::IconCache::new("./config.toml")),
        });
        let put_resp = handle_request(put_req, state.clone()).await.unwrap();
        assert_eq!(put_resp.status(), 200);
        let put_body = body_to_string(put_resp).await?;

        let get_req = Request::builder()
            .uri("/api/config")
            .method(Method::GET)
            .body(Full::new(Bytes::new()))
            .unwrap();
        let get_resp = handle_request(get_req, state).await.unwrap();
        assert_eq!(get_resp.status(), 200);
        let get_body = body_to_string(get_resp).await?;

        assert_eq!(put_body, get_body);

        let _ = std::fs::remove_file(&path);
        Ok(())
    }

    #[tokio::test]
    async fn test_config_put_empty_body() {
        let path = temp_config_path("put_empty");
        let _ = std::fs::remove_file(&path);

        let req = Request::builder()
            .uri("/api/config")
            .method(Method::PUT)
            .body(Full::new(Bytes::new()))
            .unwrap();
        let state = Arc::new(AppState {
            config_path: Arc::new(path.clone()),
            scan_in_progress: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            cancel_scan: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            background: Arc::new(std::sync::Mutex::new(
                crate::background::BackgroundState::new(),
            )),
            icon_cache: Arc::new(crate::icons::IconCache::new("./config.toml")),
        });

        let resp = handle_request(req, state).await;
        assert!(resp.is_err());
        let err = resp.unwrap_err();
        assert!(
            matches!(err, AppError::BadRequest(..)),
            "expected BadRequest, got {err:?}"
        );

        assert!(!std::path::Path::new(&path).exists());
    }

    #[tokio::test]
    async fn test_sse_scan() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 1024];
            let n = stream.read(&mut buf).await.unwrap_or(0);
            buf.truncate(n);

            let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><head><title>Home Assistant</title></head><body></body></html>";
            stream.write_all(response.as_bytes()).await.unwrap();
            let _ = stream.shutdown().await;
        });

        let body = serde_json::json!({
            "host": "127.0.0.1",
            "ports": [port],
        });
        let req = Request::builder()
            .uri("/api/scan")
            .method(Method::POST)
            .header("Content-Type", "application/json")
            .body(Full::new(Bytes::from(body.to_string())))
            .unwrap();
        let state = Arc::new(AppState {
            config_path: Arc::new("config.toml".into()),
            scan_in_progress: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            cancel_scan: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            background: Arc::new(std::sync::Mutex::new(
                crate::background::BackgroundState::new(),
            )),
            icon_cache: Arc::new(crate::icons::IconCache::new("./config.toml")),
        });

        let resp = handle_request(req, state).await.unwrap();
        assert_eq!(resp.status(), 200);
        assert_eq!(
            resp.headers()
                .get("Content-Type")
                .and_then(|v| v.to_str().ok()),
            Some("text/event-stream")
        );

        let chunks = collect_sse_body(resp.into_body()).await;
        let text = chunks.join("");
        let events = parse_sse_events(&text);

        assert!(
            events.iter().any(|(e, _)| e == "found"),
            "expected at least one 'found' event, got: {text}"
        );
        assert!(
            events.iter().any(|(e, _)| e == "done"),
            "expected 'done' event, got: {text}"
        );
    }

    #[tokio::test]
    async fn test_concurrent_scan_rejected() -> Result<(), AppError> {
        let body = serde_json::json!({
            "host": "127.0.0.1",
            "ports": [1],
        });
        let req = Request::builder()
            .uri("/api/scan")
            .method(Method::POST)
            .header("Content-Type", "application/json")
            .body(Full::new(Bytes::from(body.to_string())))
            .unwrap();
        let state = Arc::new(AppState {
            config_path: Arc::new("config.toml".into()),
            scan_in_progress: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            cancel_scan: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            background: Arc::new(std::sync::Mutex::new(
                crate::background::BackgroundState::new(),
            )),
            icon_cache: Arc::new(crate::icons::IconCache::new("./config.toml")),
        });

        let first_resp = handle_request(req, state.clone()).await.unwrap();
        assert_eq!(first_resp.status(), 200);

        let second_body = serde_json::json!({
            "host": "127.0.0.1",
            "ports": [1],
        });
        let second_req = Request::builder()
            .uri("/api/scan")
            .method(Method::POST)
            .header("Content-Type", "application/json")
            .body(Full::new(Bytes::from(second_body.to_string())))
            .unwrap();
        let second_resp = handle_request(second_req, state).await.unwrap();
        assert_eq!(second_resp.status(), 409);
        let second_text = body_to_string(second_resp).await?;
        assert!(second_text.contains("scan already in progress"));
        Ok(())
    }

    #[tokio::test]
    async fn test_background_status() -> Result<(), AppError> {
        let req = Request::builder()
            .uri("/api/background/status")
            .method(Method::GET)
            .body(Full::new(Bytes::new()))
            .unwrap();
        let state = Arc::new(AppState {
            config_path: Arc::new("config.toml".into()),
            scan_in_progress: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            cancel_scan: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            background: Arc::new(std::sync::Mutex::new(
                crate::background::BackgroundState::new(),
            )),
            icon_cache: Arc::new(crate::icons::IconCache::new("./config.toml")),
        });

        let resp = handle_request(req, state).await.unwrap();
        assert_eq!(resp.status(), 200);

        let body = body_to_string(resp).await?;
        let json: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert!(
            json.get("available").and_then(|v| v.as_bool()).is_some(),
            "expected 'available' boolean, got: {body}"
        );
        assert!(
            json.get("rotate_enabled")
                .and_then(|v| v.as_bool())
                .is_some(),
            "expected 'rotate_enabled' boolean, got: {body}"
        );
        Ok(())
    }

    #[tokio::test]
    async fn test_background_status_method_not_allowed() -> Result<(), AppError> {
        let req = Request::builder()
            .uri("/api/background/status")
            .method(Method::POST)
            .body(Full::new(Bytes::new()))
            .unwrap();
        let state = Arc::new(AppState {
            config_path: Arc::new("config.toml".into()),
            scan_in_progress: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            cancel_scan: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            background: Arc::new(std::sync::Mutex::new(
                crate::background::BackgroundState::new(),
            )),
            icon_cache: Arc::new(crate::icons::IconCache::new("./config.toml")),
        });

        let resp = handle_request(req, state).await.unwrap();
        assert_eq!(resp.status(), 405);
        Ok(())
    }

    #[tokio::test]
    async fn test_background_photo_no_cache() -> Result<(), AppError> {
        let req = Request::builder()
            .uri("/api/background/photo")
            .method(Method::GET)
            .body(Full::new(Bytes::new()))
            .unwrap();
        let state = Arc::new(AppState {
            config_path: Arc::new("config.toml".into()),
            scan_in_progress: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            cancel_scan: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            background: Arc::new(std::sync::Mutex::new(
                crate::background::BackgroundState::new(),
            )),
            icon_cache: Arc::new(crate::icons::IconCache::new("./config.toml")),
        });

        let resp = handle_request(req, state).await.unwrap();
        assert_eq!(resp.status(), 204);
        Ok(())
    }

    #[tokio::test]
    async fn test_background_photo_method_not_allowed() -> Result<(), AppError> {
        let req = Request::builder()
            .uri("/api/background/photo")
            .method(Method::PUT)
            .body(Full::new(Bytes::new()))
            .unwrap();
        let state = Arc::new(AppState {
            config_path: Arc::new("config.toml".into()),
            scan_in_progress: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            cancel_scan: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            background: Arc::new(std::sync::Mutex::new(
                crate::background::BackgroundState::new(),
            )),
            icon_cache: Arc::new(crate::icons::IconCache::new("./config.toml")),
        });

        let resp = handle_request(req, state).await.unwrap();
        assert_eq!(resp.status(), 405);
        Ok(())
    }

    async fn collect_sse_body(mut body: BoxBody) -> Vec<String> {
        let mut chunks = Vec::new();
        loop {
            let frame =
                std::future::poll_fn(|cx| std::pin::Pin::new(&mut body).poll_frame(cx)).await;
            match frame {
                Some(Ok(frame)) => {
                    if let Ok(data) = frame.into_data() {
                        chunks.push(String::from_utf8_lossy(&data).to_string());
                    }
                }
                Some(Err(_)) | None => break,
            }
        }
        chunks
    }

    fn parse_sse_events(text: &str) -> Vec<(String, String)> {
        text.split("\n\n")
            .filter(|s| !s.trim().is_empty())
            .map(|chunk| {
                let mut event = String::new();
                let mut data = String::new();
                for line in chunk.lines() {
                    if let Some(ev) = line.strip_prefix("event: ") {
                        event = ev.to_string();
                    } else if let Some(d) = line.strip_prefix("data: ") {
                        data = d.to_string();
                    }
                }
                (event, data)
            })
            .collect()
    }

    async fn body_to_string(resp: Response<BoxBody>) -> Result<String, AppError> {
        let body = resp
            .collect()
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;
        String::from_utf8(body.to_bytes().to_vec()).map_err(|e| AppError::Internal(e.to_string()))
    }
}
