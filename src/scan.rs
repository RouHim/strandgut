//! Async TCP port scanner with service fingerprinting.

use std::pin::Pin;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, OnceLock};
use std::task::{Context, Poll};
use std::time::Duration;

use hyper::body::{Body, Bytes, Frame};
use serde::Serialize;
use tokio::net::TcpStream;
use tokio::sync::Semaphore;
use tokio::sync::mpsc;
use tokio::time::{Interval, timeout};

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

/// Format the terminal `done` SSE frame (`event: done\n\n`).
fn format_done_frame() -> Bytes {
    Bytes::from("event: done\n\n")
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
                return Poll::Ready(Some(Ok(Frame::data(format_found_frame(&result)))));
            }
            Poll::Ready(Some(SseEvent::Progress { scanned, total })) => {
                this.last_emitted = scanned;
                return Poll::Ready(Some(Ok(Frame::data(format_progress_frame(scanned, total)))));
            }
            Poll::Ready(None) => {
                this.done = true;
                this._guard.0.store(false, Ordering::SeqCst);
                return Poll::Ready(Some(Ok(Frame::data(format_done_frame()))));
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
                            return Poll::Ready(Some(Ok(Frame::data(format_progress_frame(
                                scanned,
                                this.total_ports,
                            )))));
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
#[path = "scan_tests.rs"]
mod tests;
