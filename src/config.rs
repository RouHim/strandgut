//! Configuration loading and validation.
//!
//! Reads `config.toml` (path from `STRANDGUT_CONFIG` or `./config.toml` by default),
//! deserializes it with `serde`, and provides a typed `Config` struct to the rest of the
//! application.  Uses an atomic write pattern (`.tmp` → `fs::rename`) for
//! persisting user settings at runtime.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Top-level application configuration.
#[derive(Debug, PartialEq, Serialize, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub title: String,
    pub language: String,
    pub scan_defaults: String,
    pub services: Vec<Service>,
    #[serde(default)]
    pub background_rotate: bool,
}

/// A single service entry displayed on the homepage.
#[derive(Debug, PartialEq, Serialize, Deserialize, Clone)]
pub struct Service {
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    pub position: Position,
}

/// Grid position of a service card.
#[derive(Debug, PartialEq, Serialize, Deserialize, Clone)]
pub struct Position {
    pub row: usize,
    pub col: usize,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            title: "Strandgut".to_string(),
            language: "en".to_string(),
            scan_defaults: "simple".to_string(),
            services: Vec::new(),
            background_rotate: false,
        }
    }
}

impl Config {
    /// Load config from a TOML file.
    ///
    /// If the file does not exist, returns the default configuration.
    /// If the file exists but cannot be parsed, returns an error.
    pub fn load(path: impl AsRef<Path>) -> Result<Self, Box<dyn std::error::Error>> {
        match fs::read_to_string(path.as_ref()) {
            Ok(content) => {
                let config: Config = toml::from_str(&content)?;
                Ok(config)
            }
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(format!("failed to read config {}: {e}", path.as_ref().display()).into()),
        }
    }

    /// Save config to a TOML file atomically.
    ///
    /// Serializes to TOML, then delegates to [`write_atomic`].
    pub fn save(&self, path: impl AsRef<Path>) -> Result<(), Box<dyn std::error::Error>> {
        let path = path.as_ref();
        let toml_string = toml::to_string_pretty(self)?;
        let result = write_atomic(path, &toml_string);
        if let Err(ref e) = result {
            log::error!("Failed to save config {}: {e}", path.display());
        }
        result
    }
}
/// Write `content` to `path` atomically.
///
/// Writes to `{path}.tmp`, then renames to `{path}`.
/// Ensures the parent directory exists before writing.
fn write_atomic(path: &Path, content: &str) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            format!(
                "failed to create config parent dir {}: {e}",
                parent.display()
            )
        })?;
    }
    let tmp_path = {
        let mut s = path.as_os_str().to_os_string();
        s.push(".tmp");
        PathBuf::from(s)
    };
    fs::write(&tmp_path, content)
        .map_err(|e| format!("failed to write config tmp {}: {e}", tmp_path.display()))?;
    if let Err(e) = fs::rename(&tmp_path, path) {
        log::warn!(
            "Atomic rename failed {} -> {}: {e}, using direct-write fallback",
            tmp_path.display(),
            path.display()
        );
        let _ = fs::remove_file(&tmp_path);
        let _ = fs::remove_file(path);
        let _ = fs::remove_dir_all(path);
        fs::write(path, content)
            .map_err(|e| format!("failed to write config {}: {e}", path.display()))?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;

    fn test_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("strandgut_test_config_{}", name))
    }

    #[test]
    fn test_default() {
        let config = Config::default();
        assert_eq!(config.title, "Strandgut");
        assert_eq!(config.language, "en");
        assert_eq!(config.scan_defaults, "simple");
        assert!(config.services.is_empty());
    }

    #[test]
    fn test_load_valid() {
        let path = test_path("load_valid");
        let toml_content = r#"
title = "Strandgut Test"
language = "de"
scan_defaults = "full"

[[services]]
name = "Example"
url = "https://example.com"
position = { row = 0, col = 0 }
"#;
        fs::write(&path, toml_content).expect("failed to write test file");

        let config = Config::load(&path).expect("failed to load valid config");
        assert_eq!(config.title, "Strandgut Test");
        assert_eq!(config.language, "de");
        assert_eq!(config.scan_defaults, "full");
        assert_eq!(config.services.len(), 1);
        assert_eq!(config.services[0].name, "Example");
        assert_eq!(config.services[0].url, "https://example.com");
        assert_eq!(config.services[0].position.row, 0);
        assert_eq!(config.services[0].position.col, 0);

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn test_load_missing() {
        let path = test_path("load_missing");
        // Ensure file does not exist
        let _ = fs::remove_file(&path);

        let config = Config::load(&path).expect("failed to load missing config");
        assert_eq!(config, Config::default());
    }

    #[test]
    fn test_load_malformed() {
        let path = test_path("load_malformed");
        fs::write(&path, "not valid toml {{{").expect("failed to write test file");

        let result = Config::load(&path);
        assert!(result.is_err());

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn test_save_roundtrip() {
        let path = test_path("save_roundtrip");
        let config = Config {
            title: "Roundtrip".to_string(),
            language: "fr".to_string(),
            scan_defaults: "ping".to_string(),
            services: vec![Service {
                name: "Service A".to_string(),
                url: "https://a.example.com".to_string(),
                icon: Some("globe".to_string()),
                description: None,
                position: Position { row: 1, col: 2 },
            }],
            background_rotate: false,
        };

        config.save(&path).expect("failed to save config");
        let loaded = Config::load(&path).expect("failed to load saved config");
        assert_eq!(loaded, config);

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn test_category_backward_compat() {
        let path = test_path("category_backward_compat");
        let toml_content = r#"
title = "Strandgut"
language = "en"
scan_defaults = "simple"

[[services]]
name = "Old Service"
url = "https://old.example.com"
icon = "globe"
description = "Has a category"
category = "Tools"
position = { row = 0, col = 0 }
"#;
        fs::write(&path, toml_content).expect("failed to write test file");

        let config = Config::load(&path).expect("failed to load config with category");
        assert_eq!(config.services.len(), 1);
        assert_eq!(config.services[0].name, "Old Service");

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn test_background_rotate_default() {
        let config = Config::default();
        assert!(
            !config.background_rotate,
            "background_rotate should default to false"
        );
    }

    #[test]
    fn test_background_rotate_roundtrip() {
        let path = test_path("background_rotate_roundtrip");
        let config = Config {
            title: "Test".to_string(),
            language: "en".to_string(),
            scan_defaults: "simple".to_string(),
            services: Vec::new(),
            background_rotate: true,
        };

        config.save(&path).expect("failed to save config");
        let loaded = Config::load(&path).expect("failed to load saved config");
        assert!(
            loaded.background_rotate,
            "background_rotate should be true after roundtrip"
        );

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn test_write_atomic_rename_failure_falls_back() {
        let dir = test_path("write_atomic_rename_failure");
        let target = dir.join("config.toml");
        // Make the target path an existing directory so `fs::rename` fails (EISDIR).
        fs::create_dir_all(&target).expect("failed to create target dir");

        let result = write_atomic(&target, "key = 'value'");
        // After fallback: directory removed, direct write succeeds → Ok.
        assert!(
            result.is_ok(),
            "rename onto directory should succeed after fallback"
        );

        let _ = fs::remove_dir_all(&dir);
    }
}
