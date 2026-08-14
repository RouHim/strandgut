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

    let body = r#"{"title":"Test Config","language":"en","scan_defaults":"simple","services":[]}"#;
    let req = Request::builder()
        .uri("/api/config")
        .method(Method::PUT)
        .body(Full::new(Bytes::from(body)))
        .unwrap();
    let state = Arc::new(AppState {
        config_path: Arc::new(path.clone()),
        scan_in_progress: Arc::new(std::sync::atomic::AtomicBool::new(false)),
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
        background: Arc::new(std::sync::Mutex::new(
            crate::background::BackgroundState::new(),
        )),
        icon_cache: Arc::new(crate::icons::IconCache::new("./config.toml")),
    });

    let resp = handle_request(req, state).await.unwrap();
    assert_eq!(resp.status(), 405);
    Ok(())
}

fn icon_search_state() -> Arc<AppState> {
    let dir = std::env::temp_dir().join("strandgut_test_routes_icon_search");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create_dir_all");
    let config_path = dir.join("config.toml");
    Arc::new(AppState {
        config_path: Arc::new(config_path.to_string_lossy().to_string()),
        scan_in_progress: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        background: Arc::new(std::sync::Mutex::new(
            crate::background::BackgroundState::new(),
        )),
        icon_cache: Arc::new(crate::icons::IconCache::new(&config_path.to_string_lossy())),
    })
}

#[tokio::test]
async fn test_icon_search_empty_query_returns_empty_list() -> Result<(), AppError> {
    let req = Request::builder()
        .uri("/api/icons/search")
        .method(Method::GET)
        .body(Full::new(Bytes::new()))
        .unwrap();
    let state = icon_search_state();

    let resp = handle_request(req, state).await.unwrap();
    assert_eq!(resp.status(), 200);

    let body = body_to_string(resp).await?;
    assert_eq!(body, "[]");
    Ok(())
}

#[tokio::test]
async fn test_icon_search_with_query_returns_json() -> Result<(), AppError> {
    let req = Request::builder()
        .uri("/api/icons/search?q=plex")
        .method(Method::GET)
        .body(Full::new(Bytes::new()))
        .unwrap();
    let state = icon_search_state();

    let resp = handle_request(req, state).await.unwrap();
    assert_eq!(resp.status(), 200);

    let body = body_to_string(resp).await?;
    let entries: Vec<serde_json::Value> = serde_json::from_str(&body).unwrap();
    // No cache file exists for this temp config, so search degrades to empty.
    assert!(entries.is_empty());
    Ok(())
}

#[tokio::test]
async fn test_icon_search_method_not_allowed() -> Result<(), AppError> {
    let req = Request::builder()
        .uri("/api/icons/search")
        .method(Method::POST)
        .body(Full::new(Bytes::new()))
        .unwrap();
    let state = icon_search_state();

    let resp = handle_request(req, state).await.unwrap();
    assert_eq!(resp.status(), 405);
    Ok(())
}

async fn collect_sse_body(mut body: BoxBody) -> Vec<String> {
    let mut chunks = Vec::new();
    loop {
        let frame = std::future::poll_fn(|cx| std::pin::Pin::new(&mut body).poll_frame(cx)).await;
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
