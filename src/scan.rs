//! Async TCP port scanner with service fingerprinting.

use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::task::{Context, Poll};
use std::time::Duration;

use hyper::body::{Body, Bytes, Frame};
use serde::Serialize;
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio::time::timeout;

use crate::error::AppError;

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

/// Scan one chunk of ports concurrently.
///
/// The chunk size is the scanner's concurrency budget; `run_scan` feeds
/// chunks of at most 50 ports.
async fn scan_chunk(host: &str, ports: &[u16], timeout_ms: u64) -> Vec<ScanResult> {
    let mut handles = Vec::with_capacity(ports.len());

    for &port in ports {
        let host = host.to_string();
        handles.push(tokio::spawn(async move {
            scan_port(&host, port, timeout_ms).await
        }));
    }

    let mut results = Vec::new();
    for handle in handles {
        if let Ok(Some(result)) = handle.await {
            results.push(result);
        }
    }

    results.sort_by_key(|r| r.port);
    results
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
    /// Scan-level failure, sent instead of results; `host_not_found` is the
    /// one code the client translates.
    Error(String),
}

/// The scan gate is already held by another scan.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScanBusy;

/// Guard that resets `scan_in_progress` to `false` when dropped.
pub struct ScanInProgress(Arc<AtomicBool>);

impl ScanInProgress {
    /// Atomically acquire the scan gate.
    ///
    /// Acquire before parsing the request so every early return releases the
    /// gate through `Drop`.
    pub fn try_acquire(flag: Arc<AtomicBool>) -> Result<Self, ScanBusy> {
        flag.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map(|_| Self(flag))
            .map_err(|_| ScanBusy)
    }
}

impl Drop for ScanInProgress {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

/// Format a `found` SSE frame (`event: found\ndata: <json>\n\n`).
fn format_found_frame(result: &ScanResult) -> Bytes {
    let json = serde_json::to_string(result).unwrap_or_default();
    Bytes::from(format!("event: found\ndata: {json}\n\n"))
}

/// Format a `progress` SSE frame (`event: progress\ndata: <json>\n\n`).
fn format_progress_frame(scanned: usize, total: usize) -> Bytes {
    Bytes::from(format!(
        "event: progress\ndata: {}\n\n",
        serde_json::json!({
            "scanned": scanned,
            "total": total
        })
    ))
}

/// Format an `error` SSE frame (`event: error\ndata: <code>\n\n`).
fn format_error_frame(code: &str) -> Bytes {
    Bytes::from(format!("event: error\ndata: {code}\n\n"))
}

/// Format the terminal `done` SSE frame (`event: done\n\n`).
fn format_done_frame() -> Bytes {
    Bytes::from("event: done\n\n")
}

/// Body implementation that streams scan results as SSE events.
///
/// The producer owns the scan lifecycle; this body only turns events into
/// frames and releases the in-progress guard when dropped.
pub struct SseScanBody {
    rx: mpsc::Receiver<SseEvent>,
    done: bool,
    _guard: ScanInProgress,
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
                Poll::Ready(Some(Ok(Frame::data(format_found_frame(&result)))))
            }
            Poll::Ready(Some(SseEvent::Progress { scanned, total })) => {
                Poll::Ready(Some(Ok(Frame::data(format_progress_frame(scanned, total)))))
            }
            Poll::Ready(Some(SseEvent::Error(code))) => {
                this.done = true;
                Poll::Ready(Some(Ok(Frame::data(format_error_frame(&code)))))
            }
            Poll::Ready(None) => {
                this.done = true;
                Poll::Ready(Some(Ok(Frame::data(format_done_frame()))))
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

/// Run a scan and return a streaming body that yields events immediately.
///
/// The HTTP response can be sent before the first port is scanned; the
/// producer writes progress and results into the channel as it goes.
pub fn scan_with_sse(host: String, ports: Vec<u16>, guard: ScanInProgress) -> SseScanBody {
    let (tx, rx) = mpsc::channel::<SseEvent>(128);
    tokio::spawn(run_scan(host, ports, tx));
    SseScanBody {
        rx,
        done: false,
        _guard: guard,
    }
}

async fn run_scan(host: String, ports: Vec<u16>, tx: mpsc::Sender<SseEvent>) {
    let total_ports = ports.len();

    // A host that does not resolve is a different sentence from a host with no
    // services; resolve once up front and fail the scan loudly.
    if tokio::net::lookup_host((host.as_str(), 0)).await.is_err() {
        let _ = tx.send(SseEvent::Error("host_not_found".to_string())).await;
        return;
    }

    // Emit an initial progress event for larger scans.
    if total_ports > 9
        && tx
            .send(SseEvent::Progress {
                scanned: 0,
                total: total_ports,
            })
            .await
            .is_err()
    {
        return;
    }

    let mut scanned = 0;
    for chunk in ports.chunks(50) {
        let results = scan_chunk(&host, chunk, 2000).await;
        scanned += chunk.len();

        for result in results {
            if tx.send(SseEvent::Result(result)).await.is_err() {
                return;
            }
        }

        if total_ports > 9
            && tx
                .send(SseEvent::Progress {
                    scanned,
                    total: total_ports,
                })
                .await
                .is_err()
        {
            return;
        }
    }
}

#[cfg(test)]
#[path = "scan_tests.rs"]
mod tests;
