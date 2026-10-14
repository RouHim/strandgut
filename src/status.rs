//! Service availability probe for the dashboard default view.
//!
//! The default view checks reachability only when the page is built: the
//! browser asks `GET /api/status` once per load, the server opens one TCP
//! connection to each configured service URL in parallel, and answers with
//! the result. No background timer, no caching — a reload is a fresh check.

use std::time::Duration;

use serde::Serialize;
use tokio::net::TcpStream;
use tokio::time::timeout;

use crate::config::Service;

/// Connection budget for a single service probe.
const PROBE_TIMEOUT: Duration = Duration::from_millis(1000);

/// Reachability of one configured service, as reported to the dashboard.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ServiceStatus {
    pub url: String,
    pub reachable: bool,
}

/// Extract `host:port` from a service URL; the port defaults by scheme
/// (80 for `http`, 443 for `https`).
///
/// Handles paths, query strings, userinfo and bracketed IPv6 literals.
/// Returns `None` for anything without an http(s) scheme or with an
/// unparsable port; the caller reports those as unreachable.
pub fn parse_target(raw: &str) -> Option<(String, u16)> {
    let (rest, default_port) = if let Some(rest) = raw.strip_prefix("http://") {
        (rest, 80u16)
    } else {
        (raw.strip_prefix("https://")?, 443u16)
    };

    let authority = rest.split(['/', '?', '#']).next()?;
    if authority.is_empty() {
        return None;
    }
    // Drop userinfo (`user:pass@host`).
    let host_port = authority.rsplit('@').next()?;

    if let Some(bracketed) = host_port.strip_prefix('[') {
        let (host, tail) = bracketed.split_once(']')?;
        let port = match tail.strip_prefix(':') {
            Some(p) => p.parse().ok()?,
            None => default_port,
        };
        return Some((host.to_string(), port));
    }

    match host_port.rsplit_once(':') {
        Some((host, port)) => {
            let port: u16 = port.parse().ok()?;
            if host.is_empty() {
                return None;
            }
            Some((host.to_string(), port))
        }
        None => Some((host_port.to_string(), default_port)),
    }
}

/// Probe a single target: a completed TCP handshake is reachability.
async fn probe(host: &str, port: u16) -> bool {
    matches!(
        timeout(PROBE_TIMEOUT, TcpStream::connect((host, port))).await,
        Ok(Ok(_))
    )
}

/// Probe every configured service in parallel; the result keeps input order.
pub async fn probe_services(services: &[Service]) -> Vec<ServiceStatus> {
    let handles: Vec<_> = services
        .iter()
        .map(|service| {
            let url = service.url.clone();
            let target = parse_target(&url);
            tokio::spawn(async move {
                let reachable = match target {
                    Some((host, port)) => probe(&host, port).await,
                    None => false,
                };
                ServiceStatus { url, reachable }
            })
        })
        .collect();

    let mut statuses = Vec::with_capacity(handles.len());
    for handle in handles {
        match handle.await {
            Ok(status) => statuses.push(status),
            Err(_) => statuses.push(ServiceStatus {
                url: String::new(),
                reachable: false,
            }),
        }
    }
    statuses
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Position;

    fn service(url: &str) -> Service {
        Service {
            name: "svc".to_string(),
            url: url.to_string(),
            icon: None,
            description: None,
            position: Position { row: 0, col: 0 },
        }
    }

    #[test]
    fn parses_host_with_default_ports() {
        assert_eq!(
            parse_target("http://192.168.0.10"),
            Some(("192.168.0.10".to_string(), 80))
        );
        assert_eq!(
            parse_target("https://nas.local"),
            Some(("nas.local".to_string(), 443))
        );
    }

    #[test]
    fn parses_explicit_port_path_and_userinfo() {
        assert_eq!(
            parse_target("http://192.168.0.11:8095/app?x=1"),
            Some(("192.168.0.11".to_string(), 8095))
        );
        assert_eq!(
            parse_target("https://user:pw@vault.local:8200/ui"),
            Some(("vault.local".to_string(), 8200))
        );
    }

    #[test]
    fn parses_bracketed_ipv6() {
        assert_eq!(
            parse_target("http://[::1]:8123"),
            Some(("::1".to_string(), 8123))
        );
        assert_eq!(
            parse_target("http://[fe80::1%25eth0]"),
            Some(("fe80::1%25eth0".to_string(), 80))
        );
    }

    #[test]
    fn rejects_non_http_and_malformed_urls() {
        assert_eq!(parse_target("ftp://host"), None);
        assert_eq!(parse_target("192.168.0.10:80"), None);
        assert_eq!(parse_target("http://"), None);
        assert_eq!(parse_target("http://host:notaport"), None);
        assert_eq!(parse_target("http://:8080"), None);
    }

    #[tokio::test]
    async fn probe_reports_open_and_closed_ports() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let open_port = listener.local_addr().unwrap().port();

        // A port that is bound but not listening accepts nothing: bind, then drop.
        let closed_port = {
            let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            l.local_addr().unwrap().port()
        };

        let services = vec![
            service(&format!("http://127.0.0.1:{open_port}")),
            service(&format!("http://127.0.0.1:{closed_port}")),
            service("not a url"),
        ];
        let statuses = probe_services(&services).await;

        assert_eq!(statuses.len(), 3);
        assert!(statuses[0].reachable, "bound listener must be reachable");
        assert!(!statuses[1].reachable, "released port must be unreachable");
        assert!(!statuses[2].reachable, "unparsable url must be unreachable");
        assert_eq!(statuses[0].url, format!("http://127.0.0.1:{open_port}"));
    }
}
