//! Async TCP port scanner with service fingerprinting.

use crate::error::AppError;
use serde::Serialize;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, OnceLock};
use std::task::{Context, Poll};
use std::time::Duration;

use tokio::net::TcpStream;
use tokio::sync::Semaphore;
use tokio::sync::mpsc;
use tokio::time::{Interval, timeout};

use hyper::body::{Body, Bytes, Frame};

/// Create a shared HTTP agent with sensible defaults for service fingerprinting.
///
/// Uses lazy initialisation via `OnceLock` (same pattern as `routes.rs`).
pub fn get_http_agent() -> &'static ureq::Agent {
    static AGENT: OnceLock<ureq::Agent> = OnceLock::new();
    AGENT.get_or_init(|| {
        ureq::Agent::config_builder()
            .max_redirects(5)
            .timeout_connect(Some(Duration::from_millis(1500)))
            .timeout_global(Some(Duration::from_millis(2000)))
            .build()
            .new_agent()
    })
}

/// Result of scanning a single host:port.
#[derive(Debug, Clone, Serialize)]
pub struct ScanResult {
    pub host: String,
    pub port: u16,
    pub service_name: Option<String>,
    pub icon_slug: Option<String>,
    pub title: Option<String>,
    pub reachable: bool,
}

const SIMPLE_PORTS: &[u16] = &[80, 443, 8080, 8443, 3000, 5000, 8006, 9090, 9443];

const MEDIUM_EXTRA_PORTS: &[u16] = &[
    81, 4443, 8000, 8001, 8002, 8003, 8004, 8005, 8007, 8008, 8009, 8010, 8888, 9000, 9001, 9002,
    9003, 9004, 9005, 9006, 9007, 9008, 9009, 9010,
];

/// Return the port list for a given scan depth.
pub fn get_ports(depth: &str) -> Vec<u16> {
    match depth {
        "simple" => SIMPLE_PORTS.to_vec(),
        "medium" => {
            let mut ports = SIMPLE_PORTS.to_vec();
            ports.extend_from_slice(MEDIUM_EXTRA_PORTS);
            ports
        }
        "deep" => (1..=65535).collect(),
        _ => SIMPLE_PORTS.to_vec(),
    }
}

/// Scan a host on the given ports, returning all open ports with service info.
#[cfg(test)]
async fn scan_host(host: &str, ports: &[u16], timeout_ms: u64) -> Vec<ScanResult> {
    let semaphore = Arc::new(Semaphore::new(50));
    let mut results = Vec::new();

    for chunk in ports.chunks(50) {
        let mut handles = Vec::with_capacity(chunk.len());
        for &port in chunk {
            let host = host.to_string();
            let Ok(permit) = semaphore.clone().acquire_owned().await else {
                continue;
            };

            handles.push(tokio::spawn(async move {
                let _permit = permit;
                scan_port(&host, port, timeout_ms).await
            }));
        }
        for handle in handles {
            if let Ok(Some(result)) = handle.await {
                results.push(result);
            }
        }
    }

    results.sort_by_key(|r| r.port);
    results
}

/// Scan a host on the given ports with progress tracking.
async fn scan_host_with_progress(
    host: &str,
    ports: &[u16],
    timeout_ms: u64,
) -> (Vec<ScanResult>, Arc<AtomicUsize>) {
    let counter = Arc::new(AtomicUsize::new(0));
    let semaphore = Arc::new(Semaphore::new(50));
    let mut results = Vec::new();

    for chunk in ports.chunks(50) {
        let mut handles = Vec::with_capacity(chunk.len());
        for &port in chunk {
            let host = host.to_string();
            let Ok(permit) = semaphore.clone().acquire_owned().await else {
                continue;
            };
            let counter = counter.clone();

            handles.push(tokio::spawn(async move {
                let _permit = permit;
                let result = scan_port(&host, port, timeout_ms).await;
                counter.fetch_add(1, Ordering::SeqCst);
                result
            }));
        }
        for handle in handles {
            if let Ok(Some(result)) = handle.await {
                results.push(result);
            }
        }
    }

    results.sort_by_key(|r| r.port);
    (results, counter)
}

async fn scan_port(host: &str, port: u16, timeout_ms: u64) -> Option<ScanResult> {
    let addr = format!("{}:{}", host, port);
    let dur = Duration::from_millis(timeout_ms);

    // Quick TCP handshake — checks if port is open.
    let _stream = match timeout(dur, TcpStream::connect(&addr)).await {
        Ok(Ok(stream)) => stream,
        _ => return None,
    };
    // Drop probe immediately so server handler can accept ureq's connection.
    drop(_stream);

    let host_owned = host.to_string();
    let (service_name, icon_slug, title, reachable) =
        match tokio::task::spawn_blocking(move || fetch_http_info(&host_owned, port)).await {
            Ok(Ok((name, icon, title))) => (name, icon, title, true),
            Ok(Err(_)) | Err(_) => (None, None, None, false),
        };

    Some(ScanResult {
        host: host.to_string(),
        port,
        service_name,
        icon_slug,
        title,
        reachable,
    })
}

/// HTTP fingerprinting result: (service_name, icon_slug, title).
type HttpInfo = (Option<String>, Option<String>, Option<String>);

pub(crate) fn fetch_http_info(host: &str, port: u16) -> Result<HttpInfo, AppError> {
    let url = format!("http://{}:{}", host, port);

    let response = get_http_agent()
        .get(&url)
        .call()
        .map_err(|e| AppError::Internal(format!("HTTP fetch failed: {e}")))?;

    let status = response.status().as_u16();
    if !(200..=299).contains(&status) {
        return Err(AppError::Internal(format!("HTTP status {}", status)));
    }

    let body_text = response
        .into_body()
        .read_to_string()
        .map_err(|e| AppError::Internal(format!("Failed to read HTTP body: {e}")))?;

    let title = extract_title(&body_text);
    let service_name = identify_service(&title);
    let icon_slug = service_name.as_ref().map(|s| slugify(s));

    Ok((service_name, icon_slug, title))
}

fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let title_start = lower.find("<title")?;
    let gt = lower[title_start..].find('>')?;
    let content_start = title_start + gt + 1;

    let close_tag_pos = lower[content_start..].find("</title>")?;
    let content_end = content_start + close_tag_pos;

    let raw_title = &html[content_start..content_end];

    let decoded = raw_title
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ");

    let normalized: String = decoded.split_whitespace().collect::<Vec<_>>().join(" ");

    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn identify_service(title: &Option<String>) -> Option<String> {
    let t = title.as_ref()?.to_lowercase();

    if t.contains("proxmox") {
        Some("Proxmox".to_string())
    } else if t.contains("pi-hole") || t.contains("pihole") || t.contains("pi hole") {
        Some("Pi-hole".to_string())
    } else if t.contains("synology") {
        Some("Synology".to_string())
    } else if t.contains("portainer") {
        Some("Portainer".to_string())
    } else if t.contains("home assistant") {
        Some("Home Assistant".to_string())
    } else if t.contains("jellyfin") {
        Some("Jellyfin".to_string())
    } else if t.contains("plex") {
        Some("Plex".to_string())
    } else if t.contains("nextcloud") {
        Some("Nextcloud".to_string())
    } else {
        None
    }
}

fn slugify(name: &str) -> String {
    name.to_lowercase().replace(' ', "-")
}

/// Events produced by the scan process and consumed by SSE streaming.
#[derive(Debug)]
enum SseEvent {
    /// A discovered open port with service info.
    Result(ScanResult),
    /// Progress update: how many ports have been scanned so far.
    Progress { scanned: usize, total: usize },
}

/// Guard that resets `scan_in_progress` to `false` when dropped.
pub struct ScanInProgress(pub Arc<AtomicBool>);

impl Drop for ScanInProgress {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

/// Body implementation that streams scan results as SSE events.
pub struct SseScanBody {
    rx: mpsc::Receiver<SseEvent>,
    interval: Interval,
    done: bool,
    _guard: ScanInProgress,
    counter: Option<Arc<AtomicUsize>>,
    total_ports: usize,
    last_emitted: usize,
}

impl Body for SseScanBody {
    type Data = Bytes;
    type Error = std::convert::Infallible;

    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Self::Data>, Self::Error>>> {
        let this = self.get_mut();

        if this.done {
            return Poll::Ready(None);
        }

        match this.rx.poll_recv(cx) {
            Poll::Ready(Some(SseEvent::Result(result))) => {
                let json = serde_json::to_string(&result).unwrap_or_default();
                let data = format!("event: found\ndata: {}\n\n", json);
                return Poll::Ready(Some(Ok(Frame::data(Bytes::from(data)))));
            }
            Poll::Ready(Some(SseEvent::Progress { scanned, total })) => {
                let data = format!(
                    "event: progress\ndata: {}\n\n",
                    serde_json::json!({
                        "scanned": scanned,
                        "total": total
                    })
                );
                this.last_emitted = scanned;
                return Poll::Ready(Some(Ok(Frame::data(Bytes::from(data)))));
            }
            Poll::Ready(None) => {
                this.done = true;
                this._guard.0.store(false, Ordering::SeqCst);
                return Poll::Ready(Some(Ok(Frame::data(Bytes::from("event: done\n\n")))));
            }
            Poll::Pending => {}
        }

        // Emit progress events on the interval tick.
        let mut interval = Pin::new(&mut this.interval);
        let mut polled = false;
        loop {
            match interval.poll_tick(cx) {
                Poll::Ready(_) => {
                    if let Some(ref counter) = this.counter {
                        let scanned = counter.load(Ordering::SeqCst);
                        if scanned > this.last_emitted {
                            this.last_emitted = scanned;
                            let data = format!(
                                "event: progress\ndata: {}\n\n",
                                serde_json::json!({
                                    "scanned": scanned,
                                    "total": this.total_ports
                                })
                            );
                            return Poll::Ready(Some(Ok(Frame::data(Bytes::from(data)))));
                        }
                    }

                    polled = true;
                }
                Poll::Pending => {
                    if polled {
                        return Poll::Pending;
                    }
                    break;
                }
            }
        }

        Poll::Pending
    }
}

/// Run a scan and return a streaming body that yields SSE events.
pub async fn scan_with_sse(host: String, ports: Vec<u16>, guard: ScanInProgress) -> SseScanBody {
    let (tx, rx) = mpsc::channel::<SseEvent>(128);
    let total_ports = ports.len();

    // Emit initial progress event for larger scans.
    if total_ports > 9 {
        let _ = tx
            .send(SseEvent::Progress {
                scanned: 0,
                total: total_ports,
            })
            .await;
    }

    let (results, counter) = scan_host_with_progress(&host, &ports, 2000).await;

    tokio::spawn(async move {
        for result in results {
            if tx.send(SseEvent::Result(result)).await.is_err() {
                return;
            }
        }
    });

    SseScanBody {
        rx,
        interval: tokio::time::interval(Duration::from_secs(1)),
        done: false,
        _guard: guard,
        counter: if total_ports > 9 { Some(counter) } else { None },
        total_ports,
        last_emitted: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn test_detect_open_port() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut buf = [0u8; 1024];
            let _ = stream.read(&mut buf).await;
        });

        let results = scan_host("127.0.0.1", &[port], 1000).await;
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].port, port);
    }

    #[tokio::test]
    async fn test_closed_port() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);

        let results = scan_host("127.0.0.1", &[port], 500).await;
        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn test_title_extraction() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        tokio::spawn(async move {
            // TCP probe from scan_port: accept and drop
            let (probe, _) = listener.accept().await.unwrap();
            drop(probe);

            // ureq HTTP request from fetch_http_info
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 4096];
            let _n = stream.read(&mut buf).await.unwrap_or(0);
            let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><head><title>Home Assistant</title></head><body></body></html>";
            stream.write_all(response.as_bytes()).await.unwrap();
            let _ = stream.shutdown().await;
        });

        let results = scan_host("127.0.0.1", &[port], 1000).await;
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].service_name.as_deref(), Some("Home Assistant"));
        assert_eq!(results[0].icon_slug.as_deref(), Some("home-assistant"));
        assert_eq!(results[0].title.as_deref(), Some("Home Assistant"));
        assert!(results[0].reachable);
    }

    #[test]
    fn test_get_ports_simple() {
        let ports = get_ports("simple");
        assert_eq!(ports, SIMPLE_PORTS);
    }

    #[test]
    fn test_get_ports_medium() {
        let ports = get_ports("medium");
        let mut expected = SIMPLE_PORTS.to_vec();
        expected.extend_from_slice(MEDIUM_EXTRA_PORTS);
        assert_eq!(ports, expected);
    }

    #[tokio::test]
    async fn test_detect_open_port_return_title_reachable() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        tokio::spawn(async move {
            // TCP probe from scan_port: accept and drop
            let (probe, _) = listener.accept().await.unwrap();
            drop(probe);

            // ureq HTTP request from fetch_http_info
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 4096];
            let _n = stream.read(&mut buf).await.unwrap_or(0);
            let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><head><title>Pi-hole</title></head><body></body></html>";
            stream.write_all(response.as_bytes()).await.unwrap();
            let _ = stream.shutdown().await;
        });

        let results = scan_host("127.0.0.1", &[port], 1000).await;
        assert_eq!(results.len(), 1);
        let r = &results[0];
        assert_eq!(r.port, port);
        assert_eq!(r.service_name.as_deref(), Some("Pi-hole"));
        assert_eq!(r.title.as_deref(), Some("Pi-hole"));
        assert!(r.reachable);
    }

    #[tokio::test]
    async fn test_non_http_port_gets_empty_title_not_reachable() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let _ = stream.write_all(b"hello").await;
        });

        let results = scan_host("127.0.0.1", &[port], 1000).await;
        assert_eq!(results.len(), 1);
        let r = &results[0];
        assert_eq!(r.port, port);
        assert_eq!(r.service_name, None);
        assert_eq!(r.title, None);
        assert!(!r.reachable);
    }

    async fn collect_sse_body_poll(mut body: SseScanBody) -> Vec<String> {
        let mut chunks = Vec::new();
        loop {
            let frame = tokio::time::timeout(Duration::from_millis(500), async {
                std::future::poll_fn(|cx| {
                    let pinned = std::pin::Pin::new(&mut body);
                    pinned.poll_frame(cx)
                })
                .await
            })
            .await;
            match frame {
                Ok(Some(Ok(frame))) => {
                    if let Ok(data) = frame.into_data() {
                        chunks.push(String::from_utf8_lossy(&data).to_string());
                    }
                }
                Ok(Some(Err(_))) | Ok(None) | Err(_) => break,
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

    #[tokio::test]
    async fn test_concurrency_limit() {
        let mut listeners = Vec::new();
        let mut ports = Vec::new();
        for _ in 0..5 {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            ports.push(listener.local_addr().unwrap().port());
            listeners.push(listener);
        }

        for listener in listeners {
            tokio::spawn(async move {
                loop {
                    let _ = listener.accept().await;
                }
            });
        }

        let scan_ports: Vec<u16> = ports.iter().cycle().take(100).copied().collect();
        let results = scan_host("127.0.0.1", &scan_ports, 2000).await;
        assert_eq!(results.len(), 100);
    }

    #[tokio::test]
    async fn test_progress_counter_matches_port_count() {
        let mut listeners = Vec::new();
        let mut ports = Vec::new();
        for _ in 0..3 {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            ports.push(listener.local_addr().unwrap().port());
            listeners.push(listener);
        }

        for listener in listeners {
            tokio::spawn(async move {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut buf = [0u8; 1024];
                let _ = stream.read(&mut buf).await;
            });
        }

        let (_results, counter) = scan_host_with_progress("127.0.0.1", &ports, 1000).await;
        let final_count = counter.load(std::sync::atomic::Ordering::SeqCst);
        assert_eq!(final_count, 3);
    }

    #[tokio::test]
    async fn test_progress_counter_is_atomic() {
        let mut listeners_a = Vec::new();
        let mut ports_a = Vec::new();
        for _ in 0..2 {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            ports_a.push(listener.local_addr().unwrap().port());
            listeners_a.push(listener);
        }

        let mut listeners_b = Vec::new();
        let mut ports_b = Vec::new();
        for _ in 0..3 {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            ports_b.push(listener.local_addr().unwrap().port());
            listeners_b.push(listener);
        }

        for listener in listeners_a.into_iter().chain(listeners_b) {
            tokio::spawn(async move {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut buf = [0u8; 1024];
                let _ = stream.read(&mut buf).await;
            });
        }

        let (_, counter_a) = scan_host_with_progress("127.0.0.1", &ports_a, 1000).await;
        let (_, counter_b) = scan_host_with_progress("127.0.0.1", &ports_b, 1000).await;

        let count_a = counter_a.load(std::sync::atomic::Ordering::SeqCst);
        let count_b = counter_b.load(std::sync::atomic::Ordering::SeqCst);
        assert_eq!(count_a, 2);
        assert_eq!(count_b, 3);
    }

    #[tokio::test]
    async fn test_sse_stream_includes_progress_events() {
        let mut listeners = Vec::new();
        let mut ports = Vec::new();
        for _ in 0..10 {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            ports.push(listener.local_addr().unwrap().port());
            listeners.push(listener);
        }

        for listener in listeners {
            tokio::spawn(async move {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut buf = vec![0u8; 1024];
                let n = stream.read(&mut buf).await.unwrap_or(0);
                buf.truncate(n);
                let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><head><title>Home Assistant</title></head><body></body></html>";
                stream.write_all(response.as_bytes()).await.unwrap();
                let _ = stream.shutdown().await;
            });
        }

        let guard = ScanInProgress(Arc::new(AtomicBool::new(true)));
        let body = scan_with_sse("127.0.0.1".into(), ports.clone(), guard).await;
        let chunks = collect_sse_body_poll(body).await;
        let text = chunks.join("");
        let events = parse_sse_events(&text);

        let progress_events: Vec<&(String, String)> =
            events.iter().filter(|(e, _)| e == "progress").collect();
        assert!(
            !progress_events.is_empty(),
            "expected at least one 'progress' event, got events: {events:?}\nraw: {text}"
        );

        for (_, data) in &progress_events {
            let parsed: serde_json::Value =
                serde_json::from_str(data).expect("progress event data must be valid JSON");
            assert!(
                parsed.get("scanned").is_some(),
                "progress event must have 'scanned' field, got: {parsed}"
            );
            assert!(
                parsed.get("total").is_some(),
                "progress event must have 'total' field, got: {parsed}"
            );
        }
    }

    #[tokio::test]
    async fn test_sse_stream_initial_progress_event() {
        let mut listeners = Vec::new();
        let mut ports = Vec::new();
        for _ in 0..10 {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            ports.push(listener.local_addr().unwrap().port());
            listeners.push(listener);
        }

        for listener in listeners {
            tokio::spawn(async move {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut buf = vec![0u8; 1024];
                let n = stream.read(&mut buf).await.unwrap_or(0);
                buf.truncate(n);
                let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><head><title>Home Assistant</title></head><body></body></html>";
                stream.write_all(response.as_bytes()).await.unwrap();
                let _ = stream.shutdown().await;
            });
        }

        let guard = ScanInProgress(Arc::new(AtomicBool::new(true)));
        let body = scan_with_sse("127.0.0.1".into(), ports.clone(), guard).await;
        let chunks = collect_sse_body_poll(body).await;
        let text = chunks.join("");
        let events = parse_sse_events(&text);

        assert!(
            !events.is_empty(),
            "expected at least one event, got none\nraw: {text}"
        );

        let (first_event, first_data) = &events[0];
        assert_eq!(
            first_event, "progress",
            "first SSE event must be 'progress', got '{first_event}' with data '{first_data}'"
        );

        let parsed: serde_json::Value =
            serde_json::from_str(first_data).expect("first progress event data must be valid JSON");
        assert_eq!(
            parsed["scanned"], 0,
            "first progress event must have scanned=0, got: {parsed}"
        );
        assert!(
            parsed["total"].as_u64().is_some_and(|t| t > 0),
            "first progress event must have total>0, got: {parsed}"
        );
    }

    // === Redirect following tests (GREEN: fetch_http_info follows redirects via ureq) ===

    #[tokio::test]
    async fn test_follows_301_redirect() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        tokio::spawn(async move {
            // TCP probe from scan_port: accept and drop
            let (probe, _) = listener.accept().await.unwrap();
            drop(probe);

            // First HTTP request: respond with 301 redirect
            let (mut stream1, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 4096];
            let _n = stream1.read(&mut buf).await;
            let response =
                "HTTP/1.1 301 Moved Permanently\r\nContent-Length: 0\r\nLocation: /final\r\n\r\n";
            stream1.write_all(response.as_bytes()).await.unwrap();
            let _ = stream1.shutdown().await;
            drop(stream1);

            // Followed redirect: serve a page with a known service title
            let (mut stream2, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 4096];
            let _n = stream2.read(&mut buf).await;
            let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n<html><head><title>Pi-hole</title></head><body></body></html>";
            stream2.write_all(response.as_bytes()).await.unwrap();
            let _ = stream2.shutdown().await;
        });

        let results = scan_host("127.0.0.1", &[port], 1000).await;
        assert_eq!(results.len(), 1);
        // GREEN: redirect is now followed via ureq's built-in redirect handler.
        assert_eq!(results[0].service_name.as_deref(), Some("Pi-hole"));
    }

    #[tokio::test]
    async fn test_follows_302_redirect() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        tokio::spawn(async move {
            // TCP probe from scan_port: accept and drop
            let (probe, _) = listener.accept().await.unwrap();
            drop(probe);

            // First HTTP request: respond with 302 redirect
            let (mut stream1, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 4096];
            let _n = stream1.read(&mut buf).await;
            let response = "HTTP/1.1 302 Found\r\nContent-Length: 0\r\nLocation: /final\r\n\r\n";
            stream1.write_all(response.as_bytes()).await.unwrap();
            let _ = stream1.shutdown().await;
            drop(stream1);

            // Followed redirect: serve a page with a known service title
            let (mut stream2, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 4096];
            let _n = stream2.read(&mut buf).await;
            let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n<html><head><title>Pi-hole</title></head><body></body></html>";
            stream2.write_all(response.as_bytes()).await.unwrap();
            let _ = stream2.shutdown().await;
        });

        let results = scan_host("127.0.0.1", &[port], 1000).await;
        assert_eq!(results.len(), 1);
        // GREEN: redirect is now followed via ureq's built-in redirect handler.
        assert_eq!(results[0].service_name.as_deref(), Some("Pi-hole"));
    }

    #[tokio::test]
    async fn test_redirect_loop_handled() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        tokio::spawn(async move {
            loop {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut buf = vec![0u8; 1024];
                let _n = stream.read(&mut buf).await;
                let response = "HTTP/1.1 301 Moved Permanently\r\nLocation: /\r\n\r\n";
                stream.write_all(response.as_bytes()).await.unwrap();
            }
        });

        let result = tokio::time::timeout(
            Duration::from_secs(5),
            scan_host("127.0.0.1", &[port], 1000),
        )
        .await;

        assert!(result.is_ok(), "scan_host must not hang on redirect loop");
        let results = result.unwrap();
        assert_eq!(results.len(), 1);
        // RED: currently passes because fetch_http_info rejects 3xx.
        // Once redirect following lands, this guards against infinite loops.
        assert_eq!(results[0].service_name, None);
        assert!(!results[0].reachable);
    }

    #[tokio::test]
    async fn test_non_http_port_still_reported() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let _n = stream.write_all(b"garbage non-http response").await;
        });

        let results = scan_host("127.0.0.1", &[port], 1000).await;
        assert_eq!(results.len(), 1);
        let r = &results[0];
        assert_eq!(r.port, port);
        // RED: currently passes because fetch_http_info gracefully handles
        // invalid HTTP by returning None. Regression guard for future changes.
        assert_eq!(r.service_name, None);
        assert!(!r.reachable);
    }

    // === Title edge case tests (RED: extract_title is a naive <title> search) ===

    #[test]
    fn test_title_with_attributes() {
        // RED: current extract_title lowercases then looks for literal "<title>",
        // but the input has <title lang="en"> which doesn't match.
        let html = r#"<html><head><title lang="en">My App</title></head></html>"#;
        assert_eq!(extract_title(html), Some("My App".to_string()));
    }

    #[test]
    fn test_title_html_entities() {
        // RED: current extract_title returns raw text including &amp; without decoding.
        let html = "<html><head><title>&amp; Foo</title></head></html>";
        assert_eq!(extract_title(html), Some("& Foo".to_string()));
    }

    #[test]
    fn test_title_multiline_normalized() {
        // RED: current extract_title only trims ends but preserves internal newlines.
        let html = "<html><head><title>\n  Multi\n  Line\n</title></head></html>";
        assert_eq!(extract_title(html), Some("Multi Line".to_string()));
    }

    #[test]
    fn test_title_missing() {
        // Regression guard: extract_title must return None when no <title> exists.
        let html = "<html><body>No title</body></html>";
        assert_eq!(extract_title(html), None);
    }

    #[test]
    fn test_title_corpus() {
        // Corpus of 18 HTML title fixtures: asserts CORRECT expected output.
        // Many cases are RED while extract_title is still naive.
        let fixtures: Vec<(&str, Option<&str>)> = vec![
            ("basic.html", Some("Simple Title")),
            ("attributes.html", Some("Attributed Title")),
            ("entities.html", Some("& Foo & Bar <baz>")),
            ("multiline.html", Some("Multi Line Title")),
            ("uppercase.html", Some("UPPERCASE TITLE")),
            ("mixed-case.html", Some("Mixed Case Title")),
            ("empty.html", None),
            ("missing.html", None),
            ("whitespace-heavy.html", Some("Lots of spaces")),
            ("unicode.html", Some("Dienstüberwachung • Status")),
            ("comment-before.html", Some("old")),
            ("script-before.html", Some("Real")),
            ("nested-tags.html", Some("Welcome to <b>My Site</b>")),
            ("bom-prefix.html", Some("BOM Title")),
            ("meta-refresh.html", Some("Meta Page")),
            ("chunked-body.html", Some("Chunked Home Page")),
            ("proxmox-real.html", Some("Proxmox VE")),
            ("pihole-real.html", Some("Pi-hole")),
        ];

        for (filename, expected) in &fixtures {
            let path = format!("tests/fixtures/titles/{}", filename);
            let html = std::fs::read_to_string(&path)
                .unwrap_or_else(|e| panic!("Failed to read fixture {}: {}", filename, e));

            let result = extract_title(&html);
            let expected_owned = expected.map(|s| s.to_string());
            assert_eq!(
                result, expected_owned,
                "Fixture '{}' failed.\n  expected: {:?}\n  got:      {:?}",
                filename, expected, result
            );
        }
    }

    #[test]
    fn test_scan_result_serialization() {
        let r1 = ScanResult {
            host: "x".into(),
            port: 80,
            service_name: None,
            icon_slug: None,
            title: Some("Foo".into()),
            reachable: true,
        };
        let json1 = serde_json::to_string(&r1).unwrap();
        assert!(json1.contains("\"title\":\"Foo\""));
        assert!(json1.contains("\"reachable\":true"));

        let r2 = ScanResult {
            host: "x".into(),
            port: 80,
            service_name: None,
            icon_slug: None,
            title: None,
            reachable: false,
        };
        let json2 = serde_json::to_string(&r2).unwrap();
        assert!(json2.contains("\"title\":null"));
        assert!(json2.contains("\"reachable\":false"));
    }

    #[tokio::test]
    async fn test_scan_with_redirect_and_title() {
        // Integration test: full pipeline TCP connect → ureq GET → redirect follow
        // → title extract (parser) → entity decode → service identification.
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        tokio::spawn(async move {
            // TCP probe from scan_port: accept and drop
            let (probe, _) = listener.accept().await.unwrap();
            drop(probe);

            // First HTTP request: respond with 301 redirect to /dashboard
            let (mut stream1, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 4096];
            let _n = stream1.read(&mut buf).await;
            let response = "HTTP/1.1 301 Moved Permanently\r\nContent-Length: 0\r\nLocation: /dashboard\r\n\r\n";
            stream1.write_all(response.as_bytes()).await.unwrap();
            let _ = stream1.shutdown().await;
            drop(stream1);

            // Followed redirect: serve page with title containing HTML entities and attributes
            let (mut stream2, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 4096];
            let _n = stream2.read(&mut buf).await;
            let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n<html><head><title lang=\"en\" data-page=\"home\">&amp; My Dashboard &amp; More</title></head><body></body></html>";
            stream2.write_all(response.as_bytes()).await.unwrap();
            let _ = stream2.shutdown().await;
        });

        let results = scan_host("127.0.0.1", &[port], 3000).await;
        assert_eq!(results.len(), 1);
        // Verify pipeline ran end-to-end: port detected, no crash, title extracted via parser,
        // HTML entities decoded, and service identification ran (returns None for unknown titles).
        assert_eq!(results[0].port, port);
        assert_eq!(results[0].service_name, None);
        assert_eq!(results[0].title.as_deref(), Some("& My Dashboard & More"));
        assert!(results[0].reachable);
    }
}
