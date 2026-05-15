// Strandgut — hyper-based LAN service scanner dashboard

mod background;
mod config;
mod error;
mod i18n;
mod routes;
mod scan;
mod spa;

use http_body_util::BodyExt;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::AtomicBool;
use tokio::net::TcpListener;

/// Shared application state accessible from all request handlers.
#[derive(Clone)]
pub struct AppState {
    pub config_path: Arc<String>,
    pub scan_in_progress: Arc<AtomicBool>,
    pub cancel_scan: Arc<AtomicBool>,
    pub background: Arc<Mutex<crate::background::BackgroundState>>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));

    let config_path =
        std::env::var("STRANDGUT_CONFIG").unwrap_or_else(|_| "./config.toml".to_string());

    let state = Arc::new(AppState {
        config_path: Arc::new(config_path),
        scan_in_progress: Arc::new(AtomicBool::new(false)),
        cancel_scan: Arc::new(AtomicBool::new(false)),
        background: Arc::new(Mutex::new(crate::background::BackgroundState::new())),
    });

    let listener = TcpListener::bind("0.0.0.0:13569").await?;
    log::info!("Strandgut listening on http://0.0.0.0:13569");

    run_server(listener, state).await;

    Ok(())
}

/// Run the HTTP server until a shutdown signal is received.
async fn run_server(listener: TcpListener, state: Arc<AppState>) {
    let shutdown = tokio::signal::ctrl_c();

    tokio::select! {
        _ = accept_loop(listener, state) => {},
        _ = shutdown => {
            log::info!("Shutting down gracefully...");
        }
    }
}

/// Accept incoming TCP connections and serve HTTP.
async fn accept_loop(listener: TcpListener, state: Arc<AppState>) {
    loop {
        match listener.accept().await {
            Ok((tcp, _)) => {
                let io = hyper_util::rt::TokioIo::new(tcp);
                let state = state.clone();

                tokio::task::spawn(async move {
                    if let Err(err) = hyper::server::conn::http1::Builder::new()
                        .serve_connection(
                            io,
                            hyper::service::service_fn(move |req| {
                                let state = state.clone();
                                async move { router(req, state).await }
                            }),
                        )
                        .await
                    {
                        log::error!("Connection error: {:?}", err);
                    }
                });
            }
            Err(e) => {
                log::error!("Accept error: {:?}", e);
            }
        }
    }
}

/// Router — dispatches requests via `routes::handle_request`.
async fn router(
    req: hyper::Request<hyper::body::Incoming>,
    state: Arc<AppState>,
) -> Result<
    hyper::Response<http_body_util::combinators::UnsyncBoxBody<hyper::body::Bytes, hyper::Error>>,
    std::convert::Infallible,
> {
    match routes::handle_request(req, state).await {
        Ok(resp) => Ok(resp),
        Err(err) => {
            let status = err.to_http_status();
            let body = serde_json::to_string(&err.to_json_body()).unwrap_or_default();
            Ok(hyper::Response::builder()
                .status(status)
                .header("Content-Type", "application/json")
                .body(
                    http_body_util::Full::new(hyper::body::Bytes::from(body))
                        .map_err(|e: std::convert::Infallible| match e {})
                        .boxed_unsync(),
                )
                .expect("error response built from valid parts"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn test_server_starts() {
        let (addr_tx, addr_rx) = tokio::sync::oneshot::channel();

        std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async move {
                let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
                let addr = listener.local_addr().unwrap();
                let _ = addr_tx.send(addr);
                let state = Arc::new(AppState {
                    config_path: Arc::new("./config.toml".to_string()),
                    scan_in_progress: Arc::new(AtomicBool::new(false)),
                    cancel_scan: Arc::new(AtomicBool::new(false)),
                    background: Arc::new(Mutex::new(crate::background::BackgroundState::new())),
                });
                run_server(listener, state).await;
            });
        });

        let addr = addr_rx.await.unwrap();
        tokio::time::sleep(Duration::from_millis(100)).await;

        let resp = ureq::get(&format!("http://127.0.0.1:{}/", addr.port()))
            .call()
            .expect("Failed to connect to server");

        assert_eq!(resp.status(), 200);
        let body = resp.into_body().read_to_string().unwrap();
        assert!(
            body.contains("<!DOCTYPE html>"),
            "expected SPA fallback to serve index.html, got: {body:.80}"
        );
    }
}
