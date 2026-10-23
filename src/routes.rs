//! HTTP route definitions and handler dispatch.
//!
//! Builds a `matchit::Router` table that maps incoming request paths
//! to route variants, then dispatches to the appropriate handler.

use std::sync::Arc;

use http_body_util::BodyExt;
use hyper::body::Bytes;
use hyper::{Method, Request, Response, StatusCode};
use matchit::Router;
use serde::Deserialize;

use crate::AppState;
use crate::config::Config;
use crate::error::AppError;
use crate::spa;

// Type alias for the boxed body returned by handlers (also used by the
// #[path]-included test module).
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
    StatusGet,
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
        .insert("/api/status", Route::StatusGet)
        .expect("route /api/status already registered");
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

        Route::ConfigGet => handle_config_get(req, method, state).await,

        Route::StatusGet => handle_status_get(method, state).await,

        Route::ScanStart => handle_scan_start(req, state).await,

        Route::Assets => {
            if method != Method::GET {
                return Ok(method_not_allowed());
            }
            let asset_path = matched.params.get("path").unwrap_or("");
            spa::serve_asset(asset_path)
        }

        Route::BackgroundStatus => handle_background_status(method, state).await,

        Route::BackgroundPhoto => handle_background_photo(method, state).await,

        Route::IconSearch => handle_icon_search(req, method, state).await,

        Route::SpaFallback => {
            if path.starts_with("/api/") {
                return Ok(not_found_response());
            }
            spa::serve_index()
        }
    }
}

async fn handle_config_get<B>(
    req: Request<B>,
    method: Method,
    state: Arc<AppState>,
) -> Result<Response<BoxBody>, AppError>
where
    B: BodyExt + Send + 'static,
    B::Error: std::fmt::Display,
{
    if method == Method::GET {
        let config = state.store.load()?;
        let value = serde_json::to_value(&config)?;
        Ok(json_response(StatusCode::OK, &value))
    } else if method == Method::PUT {
        let body_bytes = read_body(req.into_body()).await?;
        let config: Config =
            serde_json::from_slice(&body_bytes).map_err(|e| AppError::BadRequest(e.to_string()))?;
        state.store.save(&config)?;
        let value = serde_json::to_value(&config)?;
        Ok(json_response(StatusCode::OK, &value))
    } else {
        Ok(method_not_allowed())
    }
}

/// Reachability of every configured service, checked once per dashboard load.
///
/// The browser asks this on page build; the server probes each service URL
/// with one parallel TCP connect. No timer, no caching: a reload is a fresh
/// answer, and nothing here writes to `config.toml`.
async fn handle_status_get(
    method: Method,
    state: Arc<AppState>,
) -> Result<Response<BoxBody>, AppError> {
    if method != Method::GET {
        return Ok(method_not_allowed());
    }
    let config = state.store.load()?;
    let services = crate::status::probe_services(&config.services).await;
    Ok(json_response(
        StatusCode::OK,
        &serde_json::json!({ "services": services }),
    ))
}

async fn handle_scan_start<B>(
    req: Request<B>,
    state: Arc<AppState>,
) -> Result<Response<BoxBody>, AppError>
where
    B: BodyExt + Send + 'static,
    B::Error: std::fmt::Display,
{
    let method = req.method().clone();

    if method != Method::POST {
        return Ok(method_not_allowed());
    }

    let guard = match crate::scan::ScanInProgress::try_acquire(state.scan_in_progress.clone()) {
        Ok(guard) => guard,
        Err(_) => {
            return Ok(json_response(
                StatusCode::CONFLICT,
                &serde_json::json!({"error": "scan already in progress"}),
            ));
        }
    };

    let body_bytes = read_body(req.into_body()).await?;

    let scan_req: ScanRequest =
        serde_json::from_slice(&body_bytes).map_err(|e| AppError::BadRequest(e.to_string()))?;

    let ports = scan_req
        .ports
        .unwrap_or_else(|| crate::scan::get_ports(&scan_req.depth));

    let stream = crate::scan::scan_with_sse(scan_req.host, ports, guard);

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

async fn handle_background_status(
    method: Method,
    state: Arc<AppState>,
) -> Result<Response<BoxBody>, AppError> {
    if method != Method::GET {
        return Ok(method_not_allowed());
    }
    let config = state.store.load()?;
    let status = state.background.status(&config);
    state
        .background
        .ensure_rotation(&config, Arc::clone(&state.store));

    Ok(json_response(
        StatusCode::OK,
        &serde_json::to_value(&status)?,
    ))
}

async fn handle_background_photo(
    method: Method,
    state: Arc<AppState>,
) -> Result<Response<BoxBody>, AppError> {
    if method != Method::GET {
        return Ok(method_not_allowed());
    }
    match state.background.photo() {
        Some(bytes) => {
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
        None => {
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

async fn handle_icon_search<B>(
    req: Request<B>,
    method: Method,
    state: Arc<AppState>,
) -> Result<Response<BoxBody>, AppError>
where
    B: BodyExt + Send + 'static,
    B::Error: std::fmt::Display,
{
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
#[path = "routes_tests.rs"]
mod tests;
