//! Runtime icon fetching with file-based cache (Homarr-style).
//!
//! Fetches icon listings from 5 repositories at runtime, caches them
//! to a JSON file on disk, and provides search over the cached data.
//! Each search request reads the cache file from disk (~2 MB, ~5 ms),
//! so there is zero persistent memory overhead.

use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// Maximum age of the cache file before a background refresh is triggered.
const CACHE_MAX_AGE: Duration = Duration::from_secs(7 * 86400); // 7 days

// ---------------------------------------------------------------------------
// Icon entry (minimal field names for compact cache files)
// ---------------------------------------------------------------------------

/// A single icon entry stored in the cache file and returned by search.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IconEntry {
    /// Display name (humanized from filename, e.g. "Plex").
    pub n: String,
    /// Full CDN URL ready for `<img src>`.
    pub u: String,
    /// Source identifier (e.g. "dashboard-icons").
    pub s: String,
}

// ---------------------------------------------------------------------------
// Icon cache
// ---------------------------------------------------------------------------

/// File-backed icon cache.
///
/// The cache lives at `<config_dir>/cache/icons.json`.  Each call to
/// [`search`](IconCache::search) reads the file from disk, deserializes
/// it, filters, and returns matching entries.  The file is refreshed
/// periodically (7 days) or on first startup.
pub struct IconCache {
    cache_path: PathBuf,
    refresh_interval: Duration,
}

impl IconCache {
    /// Create a new cache, deriving the cache path from the config path using
    /// the same logic as `background::get_cache_dir()`.
    pub fn new(config_path: &str) -> Self {
        let config = std::path::Path::new(config_path);
        let cache_dir = config
            .parent()
            .map(|p| p.join("cache"))
            .unwrap_or_else(|| PathBuf::from("./cache"));
        let cache_path = cache_dir.join("icons.json");
        IconCache {
            cache_path,
            refresh_interval: CACHE_MAX_AGE,
        }
    }

    /// Return the cache directory path (creates it if missing).
    fn cache_dir(&self) -> PathBuf {
        self.cache_path
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."))
    }

    /// Ensure the cache directory exists.
    pub fn ensure_cache_dir(&self) -> Result<(), AppError> {
        let dir = self.cache_dir();
        fs::create_dir_all(&dir)
            .map_err(|e| AppError::Internal(format!("{}: {e}", dir.display())))
    }

    /// Check whether the cache file exists and is fresh (within the refresh interval).
    pub fn is_fresh(&self) -> bool {
        match fs::metadata(&self.cache_path) {
            Ok(meta) => match meta.modified() {
                Ok(mtime) => mtime
                    .elapsed()
                    .map(|age| age < self.refresh_interval)
                    .unwrap_or(false),
                Err(_) => false,
            },
            Err(_) => false,
        }
    }

    /// Non-blocking freshness check.  If the cache is missing or stale,
    /// spawns a background task to refresh it.  The caller does not wait.
    pub fn ensure_fresh(&self) {
        if !self.is_fresh() {
            let cache_path = self.cache_path.clone();
            tokio::task::spawn_blocking(move || {
                if let Err(e) = refresh_cache(&cache_path) {
                    log::warn!("Icon cache refresh failed: {e}");
                }
            });
        }
    }

    /// Search the icon cache for entries matching `query`.
    ///
    /// Reads the cache file from disk, deserializes, filters by
    /// case-insensitive substring match, sorts by match quality
    /// (exact → prefix → contains → alphabetical), and limits
    /// to `limit` results.
    ///
    /// Returns an empty vector when the cache file is missing or
    /// unreadable (graceful degradation).
    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<IconEntry>, AppError> {
        let query_lower = query.trim().to_lowercase();
        if query_lower.is_empty() {
            return Ok(Vec::new());
        }

        let data = match fs::read(&self.cache_path) {
            Ok(d) => d,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => {
                log::warn!("Failed to read icon cache: {e}");
                return Ok(Vec::new());
            }
        };

        let mut entries: Vec<IconEntry> = match serde_json::from_slice(&data) {
            Ok(v) => v,
            Err(e) => {
                log::warn!("Failed to parse icon cache: {e}");
                return Ok(Vec::new());
            }
        };

        // Filter: case-insensitive substring match on name
        entries.retain(|e| e.n.to_lowercase().contains(&query_lower));

        // Sort by match quality
        entries.sort_by(|a, b| {
            let a_lower = a.n.to_lowercase();
            let b_lower = b.n.to_lowercase();
            let a_score = match_score(&a_lower, &query_lower);
            let b_score = match_score(&b_lower, &query_lower);
            a_score.cmp(&b_score).then_with(|| a_lower.cmp(&b_lower))
        });

        entries.truncate(limit);
        Ok(entries)
    }
}

/// Score a candidate name against a query.  Lower is better.
fn match_score(candidate: &str, query: &str) -> u8 {
    if candidate == query {
        0 // exact match
    } else if candidate.starts_with(query) {
        1 // prefix match
    } else {
        2 // contains match
    }
}

// ---------------------------------------------------------------------------
// Cache refresh
// ---------------------------------------------------------------------------

/// Fetch all icon sources, merge, and write the cache file atomically.
fn refresh_cache(cache_path: &PathBuf) -> Result<(), AppError> {
    log::info!("Refreshing icon cache…");

    // Fetch from all sources concurrently using std::thread::scope
    // (this runs inside spawn_blocking, so blocking threads are fine).
    let results = std::thread::scope(|s| {
        let t1 = s.spawn(fetch_dashboard_icons);
        let t2 = s.spawn(fetch_selfhst);
        let t3 = s.spawn(fetch_simple_icons);
        let t4 = s.spawn(fetch_papirus);
        let t5 = s.spawn(fetch_homelab_svg);

        vec![
            t1.join().unwrap_or_else(|_| Err("panic".into())),
            t2.join().unwrap_or_else(|_| Err("panic".into())),
            t3.join().unwrap_or_else(|_| Err("panic".into())),
            t4.join().unwrap_or_else(|_| Err("panic".into())),
            t5.join().unwrap_or_else(|_| Err("panic".into())),
        ]
    });

    // Merge + deduplicate by lowercase name (priority order: first seen wins).
    let mut seen = std::collections::HashSet::new();
    let mut merged: Vec<IconEntry> = Vec::new();

    for result in &results {
        match result {
            Ok(entries) => {
                for entry in entries {
                    let key = entry.n.to_lowercase();
                    if seen.insert(key) {
                        merged.push(entry.clone());
                    }
                }
            }
            Err(msg) => {
                log::warn!("Icon source fetch failed: {msg}");
            }
        }
    }

    if merged.is_empty() {
        return Err(AppError::Internal("all icon sources failed".into()));
    }

    // Sort alphabetically for consistent cache file (makes diffs readable).
    merged.sort_by_key(|a| a.n.to_lowercase());

    log::info!(
        "Icon cache: {} entries from {} sources",
        merged.len(),
        results.iter().filter(|r| r.is_ok()).count()
    );

    // Atomic write: .tmp → rename.
    let tmp_path = cache_path.with_extension("tmp");
    if let Some(parent) = tmp_path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            AppError::Internal(format!("failed to create icon cache dir {}: {e}", parent.display()))
        })?;
    }

    let json = serde_json::to_vec(&merged).map_err(|e| AppError::Internal(e.to_string()))?;
    fs::write(&tmp_path, &json).map_err(|e| {
        AppError::Internal(format!("failed to write icon cache {}: {e}", tmp_path.display()))
    })?;
    fs::rename(&tmp_path, cache_path).map_err(|e| {
        AppError::Internal(format!(
            "failed to rename icon cache {} -> {}: {e}",
            tmp_path.display(),
            cache_path.display()
        ))
    })?;

    log::info!("Icon cache written to {}", cache_path.display());
    Ok(())
}

// ---------------------------------------------------------------------------
// Source-specific fetch functions
// ---------------------------------------------------------------------------

/// Fetch Dashboard Icons from the GitHub git/trees API.
fn fetch_dashboard_icons() -> Result<Vec<IconEntry>, String> {
    let url =
        "https://api.github.com/repos/homarr-labs/dashboard-icons/git/trees/main?recursive=true";

    let agent = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(10)))
        .build()
        .new_agent();
    let resp = agent
        .get(url)
        .header("User-Agent", "strandgut/0.1.0")
        .header("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| format!("dashboard-icons request: {e}"))?;

    let body = resp
        .into_body()
        .read_to_string()
        .map_err(|e| format!("dashboard-icons read: {e}"))?;

    #[derive(Deserialize)]
    struct TreeResponse {
        tree: Vec<TreeItem>,
    }
    #[derive(Deserialize)]
    struct TreeItem {
        path: String,
    }

    let parsed: TreeResponse =
        serde_json::from_str(&body).map_err(|e| format!("dashboard-icons parse: {e}"))?;

    let entries: Vec<IconEntry> = parsed
        .tree
        .into_iter()
        .filter(|item| item.path.starts_with("svg/") && item.path.ends_with(".svg"))
        .map(|item| {
            let name = humanize_path(&item.path);
            IconEntry {
                n: name,
                u: format!(
                    "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/{}",
                    item.path
                ),
                s: "dashboard-icons".into(),
            }
        })
        .collect();

    Ok(entries)
}

/// Fetch selfh.st icons via jsDelivr flat file listing.
fn fetch_selfhst() -> Result<Vec<IconEntry>, String> {
    fetch_jsdelivr_flat(
        "gh/selfhst/icons@master",
        |path| path.ends_with(".svg"),
        |path| {
            let name = humanize_path(path);
            IconEntry {
                n: name,
                u: format!("https://cdn.jsdelivr.net/gh/selfhst/icons/{}", path),
                s: "selfh.st".into(),
            }
        },
    )
    .map_err(|e| format!("selfh.st: {e}"))
}

/// Fetch Simple Icons via jsDelivr flat file listing.
fn fetch_simple_icons() -> Result<Vec<IconEntry>, String> {
    fetch_jsdelivr_flat(
        "gh/simple-icons/simple-icons@master",
        |path| path.starts_with("icons/") && path.ends_with(".svg"),
        |path| {
            let stem = std::path::Path::new(path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown");
            IconEntry {
                n: stem.to_string(), // Simple Icons filenames are already CamelCase
                u: format!("https://cdn.simpleicons.org/{}", stem),
                s: "simple-icons".into(),
            }
        },
    )
    .map_err(|e| format!("simple-icons: {e}"))
}

/// Fetch Papirus icons via jsDelivr flat file listing.
fn fetch_papirus() -> Result<Vec<IconEntry>, String> {
    fetch_jsdelivr_flat(
        "gh/PapirusDevelopmentTeam/papirus_icons@master",
        |path| path.ends_with(".svg"),
        |path| {
            let name = humanize_path(path);
            IconEntry {
                n: name,
                u: format!(
                    "https://cdn.jsdelivr.net/gh/PapirusDevelopmentTeam/papirus_icons/{}",
                    path
                ),
                s: "papirus".into(),
            }
        },
    )
    .map_err(|e| format!("papirus: {e}"))
}

/// Fetch Homelab SVG Assets via jsDelivr flat file listing.
fn fetch_homelab_svg() -> Result<Vec<IconEntry>, String> {
    fetch_jsdelivr_flat(
        "gh/loganmarchione/homelab-svg-assets@main",
        |path| path.starts_with("assets/") && path.ends_with(".svg"),
        |path| {
            let name = humanize_path(path);
            IconEntry {
                n: name,
                u: format!(
                    "https://cdn.jsdelivr.net/gh/loganmarchione/homelab-svg-assets/{}",
                    path
                ),
                s: "homelab-svg".into(),
            }
        },
    )
    .map_err(|e| format!("homelab-svg: {e}"))
}

/// Generic jsDelivr flat file listing fetcher.
///
/// Calls `https://data.jsdelivr.com/v1/packages/{pkg}?structure=flat`,
/// filters by `predicate`, and maps each matching path through `mapper`.
fn fetch_jsdelivr_flat<F, M>(pkg: &str, predicate: F, mapper: M) -> Result<Vec<IconEntry>, String>
where
    F: Fn(&str) -> bool,
    M: Fn(&str) -> IconEntry,
{
    let url = format!(
        "https://data.jsdelivr.com/v1/packages/{}?structure=flat",
        pkg
    );

    let resp = ureq::get(&url)
        .call()
        .map_err(|e| format!("{pkg} request: {e}"))?;

    let body = resp
        .into_body()
        .read_to_string()
        .map_err(|e| format!("{pkg} read: {e}"))?;

    #[derive(Deserialize)]
    struct JsDelivrResponse {
        files: Vec<JsDelivrFile>,
    }
    #[derive(Deserialize)]
    struct JsDelivrFile {
        name: String,
    }

    let parsed: JsDelivrResponse =
        serde_json::from_str(&body).map_err(|e| format!("{pkg} parse: {e}"))?;

    let entries: Vec<IconEntry> = parsed
        .files
        .into_iter()
        .filter(|f| predicate(&f.name))
        .map(|f| mapper(&f.name))
        .collect();

    Ok(entries)
}

// ---------------------------------------------------------------------------
// Name humanization
// ---------------------------------------------------------------------------

/// Convert a file path to a human-readable display name.
///
/// Strips directory prefixes, file extension, then replaces hyphens
/// and underscores with spaces and capitalizes each word.
///
/// # Examples
/// - `svg/plex.svg` → `"Plex"`
/// - `icons/home-assistant.svg` → `"Home Assistant"`
/// - `Papirus/64x64/apps/visual-studio-code.svg` → `"Visual Studio Code"`
fn humanize_path(path: &str) -> String {
    // Extract just the filename (last segment after `/`).
    let filename = path.rsplit('/').next().unwrap_or(path);

    // Strip the extension.
    let stem = filename.rsplit('.').next_back().unwrap_or(filename);

    // Replace hyphens and underscores with spaces.
    let spaced = stem.replace(['-', '_'], " ");

    // Capitalize each word.
    spaced
        .split_whitespace()
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                None => String::new(),
                Some(c) => {
                    let mut word = c.to_uppercase().collect::<String>();
                    word.push_str(&chars.as_str().to_lowercase());
                    word
                }
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_humanize_path() {
        assert_eq!(humanize_path("svg/plex.svg"), "Plex");
        assert_eq!(humanize_path("icons/home-assistant.svg"), "Home Assistant");
        assert_eq!(
            humanize_path("Papirus/64x64/apps/visual-studio-code.svg"),
            "Visual Studio Code"
        );
        assert_eq!(humanize_path("simple.svg"), "Simple");
    }

    #[test]
    fn test_match_score() {
        assert!(match_score("plex", "plex") < match_score("plex media", "plex"));
        assert!(match_score("plex media", "plex") < match_score("simple plex", "plex"));
    }

    #[test]
    fn test_cache_new() {
        let cache = IconCache::new("/data/config.toml");
        assert_eq!(cache.cache_path, PathBuf::from("/data/cache/icons.json"));
    }

    #[test]
    fn test_cache_new_no_parent() {
        let cache = IconCache::new("config.toml");
        assert_eq!(cache.cache_path, PathBuf::from("cache/icons.json"));
    }

    #[test]
    fn test_search_empty_query() {
        let cache = IconCache::new("/tmp/nonexistent/config.toml");
        let results = cache.search("", 50).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_missing_cache_file() {
        let cache = IconCache::new("/tmp/nonexistent_icons_test/config.toml");
        let results = cache.search("plex", 50).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_filters_and_sorts() {
        let dir = std::env::temp_dir().join("strandgut_test_icons_sort");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create_dir_all");
        let cache_path = dir.join("icons.json");
        let entries = vec![
            IconEntry {
                n: "Plex".into(),
                u: "https://example.com/plex.svg".into(),
                s: "s1".into(),
            },
            IconEntry {
                n: "Plex Media Server".into(),
                u: "https://example.com/plex-media.svg".into(),
                s: "s2".into(),
            },
            IconEntry {
                n: "Emby".into(),
                u: "https://example.com/emby.svg".into(),
                s: "s3".into(),
            },
            IconEntry {
                n: "Simple Plex".into(),
                u: "https://example.com/simple-plex.svg".into(),
                s: "s4".into(),
            },
        ];

        let json = serde_json::to_vec(&entries).unwrap();
        fs::write(&cache_path, &json).unwrap();

        let cache = IconCache {
            cache_path,
            refresh_interval: CACHE_MAX_AGE,
        };

        let results = cache.search("plex", 50).unwrap();
        assert_eq!(results.len(), 3);
        // Exact match first
        assert_eq!(results[0].n, "Plex");
        // Prefix match second
        assert_eq!(results[1].n, "Plex Media Server");
        // Contains match third
        assert_eq!(results[2].n, "Simple Plex");
    }

    #[test]
    fn test_search_respects_limit() {
        let dir = std::env::temp_dir().join("strandgut_test_icons_limit");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create_dir_all");
        let cache_path = dir.join("icons.json");

        let entries: Vec<IconEntry> = (1..=10)
            .map(|i| IconEntry {
                n: format!("Service {i}"),
                u: format!("https://example.com/s{i}.svg"),
                s: "test".into(),
            })
            .collect();

        let json = serde_json::to_vec(&entries).unwrap();
        fs::write(&cache_path, &json).unwrap();

        let cache = IconCache {
            cache_path,
            refresh_interval: CACHE_MAX_AGE,
        };

        let results = cache.search("service", 3).unwrap();
        assert_eq!(results.len(), 3);
    }

    #[test]
    fn test_is_fresh_no_file() {
        let cache = IconCache {
            cache_path: PathBuf::from("/tmp/nonexistent/icons.json"),
            refresh_interval: CACHE_MAX_AGE,
        };
        assert!(!cache.is_fresh());
    }
}
