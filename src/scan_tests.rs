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
    // ureq follows redirects by default; an infinite loop is bounded by its
    // redirect limit, so scan_host must not hang and reports the port as unreachable.
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
    // fetch_http_info returns Err on invalid HTTP; scan_host records the
    // port as unreachable instead of failing the whole scan.
    assert_eq!(r.service_name, None);
    assert!(!r.reachable);
}

// === Title edge case tests ===

#[test]
fn test_title_with_attributes() {
    // extract_title matches any <title ...> tag, not just a bare <title>.
    let html = r#"<html><head><title lang="en">My App</title></head></html>"#;
    assert_eq!(extract_title(html), Some("My App".to_string()));
}

#[test]
fn test_title_html_entities() {
    // extract_title decodes common HTML entities.
    let html = "<html><head><title>&amp; Foo</title></head></html>";
    assert_eq!(extract_title(html), Some("& Foo".to_string()));
}

#[test]
fn test_title_multiline_normalized() {
    // extract_title collapses internal whitespace to single spaces.
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
    // Corpus of HTML title fixtures: asserts correct expected output.
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
fn test_identify_service_known_titles() {
    assert_eq!(
        identify_service(&Some("Proxmox VE".into())),
        Some("Proxmox".to_string())
    );
    assert_eq!(
        identify_service(&Some("Pi-hole Admin".into())),
        Some("Pi-hole".to_string())
    );
    assert_eq!(
        identify_service(&Some("pi hole dashboard".into())),
        Some("Pi-hole".to_string())
    );
    assert_eq!(
        identify_service(&Some("Synology DiskStation".into())),
        Some("Synology".to_string())
    );
    assert_eq!(
        identify_service(&Some("Portainer".into())),
        Some("Portainer".to_string())
    );
    assert_eq!(
        identify_service(&Some("Home Assistant".into())),
        Some("Home Assistant".to_string())
    );
    assert_eq!(
        identify_service(&Some("Jellyfin".into())),
        Some("Jellyfin".to_string())
    );
    assert_eq!(
        identify_service(&Some("Plex Media Server".into())),
        Some("Plex".to_string())
    );
    assert_eq!(
        identify_service(&Some("Nextcloud".into())),
        Some("Nextcloud".to_string())
    );
}

#[test]
fn test_identify_service_unknown_and_empty() {
    assert_eq!(identify_service(&Some("Random App".into())), None);
    assert_eq!(identify_service(&None), None);
}

#[test]
fn test_slugify() {
    assert_eq!(slugify("Home Assistant"), "home-assistant");
    assert_eq!(slugify("Proxmox"), "proxmox");
    assert_eq!(slugify("My  App"), "my--app");
    assert_eq!(slugify(""), "");
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
        let response =
            "HTTP/1.1 301 Moved Permanently\r\nContent-Length: 0\r\nLocation: /dashboard\r\n\r\n";
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
