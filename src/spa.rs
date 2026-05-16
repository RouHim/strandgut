//! Embedded SPA asset serving with correct MIME types and SPA fallback.
//!
//! Uses `include_bytes!` to bundle the `assets/` directory at compile time,
//! then serves files with the correct `Content-Type` header.  Unknown
//! asset paths fall back to `index.html` so that client-side routing
//! (SPA) works without server-side route awareness.

use crate::error::AppError;
use http_body_util::{BodyExt, Full};
use hyper::body::Bytes;
use hyper::{Response, header};

/// Type-erased HTTP body used for all SPA responses.
type BoxBody = http_body_util::combinators::UnsyncBoxBody<Bytes, hyper::Error>;

/// A static asset embedded at compile time via `include_bytes!`.
struct AssetData {
    pub data: &'static [u8],
}

/// Look up an embedded asset by its path (relative to `assets/`).
///
/// Returns `None` if the path is not recognised — callers should fall
/// back to [`serve_index`] for SPA routing.
fn get_asset(path: &str) -> Option<AssetData> {
    let data: &'static [u8] = match path {
        "css/reset.css" => include_bytes!("../assets/css/reset.css"),
        "css/tokens.css" => include_bytes!("../assets/css/tokens.css"),
        "css/themes.css" => include_bytes!("../assets/css/themes.css"),
        "css/layout.css" => include_bytes!("../assets/css/layout.css"),
        "css/components.css" => include_bytes!("../assets/css/components.css"),
        "css/animations.css" => include_bytes!("../assets/css/animations.css"),
        "css/style.css" => include_bytes!("../assets/css/style.css"),
        "js/app.js" => include_bytes!("../assets/js/app.js"),
        "js/api.js" => include_bytes!("../assets/js/api.js"),
        "js/state.js" => include_bytes!("../assets/js/state.js"),
        "js/grid.js" => include_bytes!("../assets/js/grid.js"),
        "js/icon-picker.js" => include_bytes!("../assets/js/icon-picker.js"),
        "js/drag.js" => include_bytes!("../assets/js/drag.js"),
        "js/edit.js" => include_bytes!("../assets/js/edit.js"),
        "js/add-dialog.js" => include_bytes!("../assets/js/add-dialog.js"),
        "js/scan.js" => include_bytes!("../assets/js/scan.js"),
        "js/theme.js" => include_bytes!("../assets/js/theme.js"),
        "js/pill-switch.js" => include_bytes!("../assets/js/pill-switch.js"),
        "js/background.js" => include_bytes!("../assets/js/background.js"),
        "js/ping.js" => include_bytes!("../assets/js/ping.js"),
        "js/i18n/en.js" => include_bytes!("../assets/js/i18n/en.js"),
        "js/i18n/de.js" => include_bytes!("../assets/js/i18n/de.js"),
        "img/logo.svg" => include_bytes!("../assets/img/logo.svg"),
        "img/background.webp" => include_bytes!("../assets/img/background.webp"),
        "index.html" => include_bytes!("../assets/index.html"),
        _ => return None,
    };
    Some(AssetData { data })
}

/// Serve a static asset from the embedded `assets/` directory.
///
/// 1. Strips the leading `/assets/` prefix (if present).
/// 2. Looks up the file via [`get_asset`].
/// 3. If found, returns it with the correct MIME type.
/// 4. If **not** found, falls back to [`serve_index`] (SPA routing).
///
/// This means the server never returns 404 for asset routes — any missing
/// file is served the application shell instead, letting the client-side
/// router handle the URL.
pub fn serve_asset(path: &str) -> Result<Response<BoxBody>, AppError> {
    let stripped = path.strip_prefix("/assets/").unwrap_or(path);
    // Strip query parameters (e.g. ?v=0.1.0) so they don't break
    // the asset lookup.
    let clean = stripped.split('?').next().unwrap_or(stripped);

    match get_asset(clean) {
        Some(file) => {
            let content_type = detect_mime(clean);
            let body = Full::new(Bytes::from(file.data.to_vec()))
                .map_err(|never| match never {})
                .boxed_unsync();
            Ok(Response::builder()
                .header(header::CONTENT_TYPE, content_type)
                .header(header::CACHE_CONTROL, "public, max-age=3600")
                .body(body)
                .expect("asset response built from valid parts"))
        }
        None => serve_index(),
    }
}

/// Serve the SPA entry point (`index.html`).
///
/// Used for the root path and as a fallback for any route the router does
/// not recognise.  Returns [`AppError::NotFound`] only if `index.html`
/// itself is missing (should never happen in a correctly built binary).
pub fn serve_index() -> Result<Response<BoxBody>, AppError> {
    match get_asset("index.html") {
        Some(file) => {
            let body = Full::new(Bytes::from(file.data.to_vec()))
                .map_err(|never| match never {})
                .boxed_unsync();
            Ok(Response::builder()
                .header(header::CONTENT_TYPE, "text/html")
                .header(header::CACHE_CONTROL, "no-cache")
                .body(body)
                .expect("index response built from valid parts"))
        }
        None => Err(AppError::NotFound("index.html".into())),
    }
}

/// Map a file path to its MIME type string.
///
/// Recognises the common web extensions used by the Strandgut front-end.
/// Falls back to `application/octet-stream` for unknown extensions.
fn detect_mime(path: &str) -> &'static str {
    if path.ends_with(".js") {
        return "application/javascript";
    }
    if path.ends_with(".css") {
        return "text/css";
    }
    if path.ends_with(".html") {
        return "text/html";
    }
    if path.ends_with(".svg") {
        return "image/svg+xml";
    }
    if path.ends_with(".webp") {
        return "image/webp";
    }
    "application/octet-stream"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_assets_embedded() {
        assert!(get_asset("index.html").is_some());
        assert!(get_asset("css/style.css").is_some());
        assert!(get_asset("js/app.js").is_some());
    }

    #[test]
    fn test_serve_index_ok() {
        let resp = serve_index().expect("serve_index should succeed");
        assert_eq!(resp.status(), 200);
        assert_eq!(
            resp.headers().get(header::CONTENT_TYPE).unwrap(),
            "text/html"
        );
        assert_eq!(
            resp.headers().get(header::CACHE_CONTROL).unwrap(),
            "no-cache"
        );
    }

    #[test]
    fn test_serve_asset_without_prefix() {
        let resp = serve_asset("css/style.css").expect("serve_asset should succeed");
        assert_eq!(resp.status(), 200);
        assert_eq!(
            resp.headers().get(header::CONTENT_TYPE).unwrap(),
            "text/css"
        );
        assert_eq!(
            resp.headers().get(header::CACHE_CONTROL).unwrap(),
            "public, max-age=3600"
        );
    }

    #[test]
    fn test_serve_asset_with_prefix() {
        let resp =
            serve_asset("/assets/js/app.js").expect("serve_asset with prefix should succeed");
        assert_eq!(resp.status(), 200);
        assert_eq!(
            resp.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/javascript"
        );
        assert_eq!(
            resp.headers().get(header::CACHE_CONTROL).unwrap(),
            "public, max-age=3600"
        );
    }

    #[test]
    fn test_serve_unknown_asset_falls_back_to_index() {
        let resp = serve_asset("nonexistent/file.js").expect("fallback should succeed");
        assert_eq!(resp.status(), 200);
        assert_eq!(
            resp.headers().get(header::CONTENT_TYPE).unwrap(),
            "text/html"
        );
    }

    #[test]
    fn test_serve_asset_svg_mime() {
        let resp = serve_asset("img/logo.svg").expect("serve_asset should succeed");
        assert_eq!(resp.status(), 200);
        assert_eq!(
            resp.headers().get(header::CONTENT_TYPE).unwrap(),
            "image/svg+xml"
        );
    }

    #[test]
    fn test_serve_asset_strips_query_params() {
        let resp = serve_asset("css/style.css?v=0.1.0").expect("serve_asset should succeed");
        assert_eq!(resp.status(), 200);
        assert_eq!(
            resp.headers().get(header::CACHE_CONTROL).unwrap(),
            "public, max-age=3600"
        );
    }

    #[test]
    fn test_serve_index_cache_control() {
        let resp = serve_index().expect("serve_index should succeed");
        assert_eq!(resp.status(), 200);
        assert_eq!(
            resp.headers().get(header::CACHE_CONTROL).unwrap(),
            "no-cache"
        );
    }
}
