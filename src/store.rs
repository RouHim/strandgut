//! Configuration file and data-directory ownership.
//!
//! A [`ConfigStore`] is the single place that knows where `config.toml` lives,
//! where the app's cache directory lives, and how persistence failures are
//! reported. Handlers and feature modules ask the store instead of deriving
//! paths from the config path themselves.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::config::Config;
use crate::error::AppError;

/// Owns the config file path, the app data directory, and the cache directory.
///
/// The cache lives in a `cache/` directory next to the config file. A bare
/// config filename (for example `config.toml`) resolves its data directory to
/// the current directory, so the cache path is deterministically `./cache`.
#[derive(Debug)]
pub struct ConfigStore {
    config_path: PathBuf,
    config_dir: PathBuf,
    cache_dir: PathBuf,
}

impl ConfigStore {
    /// Create a store for `config_path`.
    pub fn new(config_path: impl Into<PathBuf>) -> Self {
        let config_path = config_path.into();
        let config_dir = config_path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."));
        let cache_dir = config_dir.join("cache");
        Self {
            config_path,
            config_dir,
            cache_dir,
        }
    }

    /// The `config.toml` path.
    pub fn config_path(&self) -> &Path {
        &self.config_path
    }

    /// The directory that contains the config file.
    pub fn config_dir(&self) -> &Path {
        &self.config_dir
    }

    /// The directory that contains the icon cache and background photo.
    pub fn cache_dir(&self) -> &Path {
        &self.cache_dir
    }

    /// Load the current config, reading the file on every call.
    ///
    /// A missing file is not an error: it means the default config. A file
    /// that exists but cannot be parsed is a [`AppError::Config`]. Read
    /// failures are [`AppError::Internal`] so they are not mislabeled as
    /// configuration mistakes.
    pub fn load(&self) -> Result<Config, AppError> {
        match fs::read_to_string(&self.config_path) {
            Ok(content) => toml::from_str(&content).map_err(|e| {
                AppError::Config(format!(
                    "failed to parse config {}: {e}",
                    self.config_path.display()
                ))
            }),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Config::default()),
            Err(e) => Err(AppError::Internal(format!(
                "failed to read config {}: {e}",
                self.config_path.display()
            ))),
        }
    }

    /// Save the config atomically.
    pub fn save(&self, config: &Config) -> Result<(), AppError> {
        let toml_string = toml::to_string_pretty(config)
            .map_err(|e| AppError::Internal(format!("failed to serialize config: {e}")))?;
        write_atomic(&self.config_path, &toml_string).map_err(|e| {
            log::error!("Failed to save config {}: {e}", self.config_path.display());
            AppError::Internal(format!(
                "failed to save config {}: {e}",
                self.config_path.display()
            ))
        })
    }

    /// Create the cache directory if it does not exist.
    pub fn ensure_cache_dir(&self) -> Result<(), AppError> {
        fs::create_dir_all(&self.cache_dir).map_err(|e| {
            AppError::Internal(format!(
                "failed to create cache directory {}: {e}",
                self.cache_dir.display()
            ))
        })
    }

    /// Verify that the config directory accepts writes.
    ///
    /// This is a startup canary: it catches read-only mounts before the first
    /// save fails. A failure is returned as a human-readable message; the
    /// caller decides whether it is fatal.
    pub fn check_writable(&self) -> Result<(), String> {
        let canary_path = self.config_dir.join(".write-test");
        match fs::write(&canary_path, b"ok")
            .and_then(|_| fs::read(&canary_path))
            .and_then(|data| {
                let _ = fs::remove_file(&canary_path);
                if data == b"ok" {
                    Ok(())
                } else {
                    Err(io::Error::other("mismatch"))
                }
            }) {
            Ok(()) => Ok(()),
            Err(e) => Err(format!(
                "write test to {} failed: {e}",
                canary_path.display()
            )),
        }
    }
}

/// Write `content` to `path` atomically.
///
/// Writes to `{path}.tmp`, then renames to `{path}`. If the rename fails, it
/// falls back to removing the target and writing directly, preserving the
/// historical behavior for unusual filesystem states.
fn write_atomic(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn test_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("strandgut_test_store_{name}"))
    }

    fn sample_config(title: &str) -> Config {
        Config {
            title: title.to_string(),
            language: "en".to_string(),
            scan_defaults: "simple".to_string(),
            services: Vec::new(),
            background_rotate: false,
        }
    }

    #[test]
    fn missing_file_loads_default_config() {
        let dir = test_dir("missing");
        let _ = fs::remove_dir_all(&dir);
        let store = ConfigStore::new(dir.join("config.toml"));

        assert_eq!(store.load().unwrap(), Config::default());
    }

    #[test]
    fn external_edits_are_visible_on_the_next_load() {
        let dir = test_dir("external_edits");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("config.toml");
        let store = ConfigStore::new(&path);

        fs::write(
            &path,
            "title = \"First\"\nlanguage = \"en\"\nscan_defaults = \"simple\"\nservices = []\n",
        )
        .unwrap();
        assert_eq!(store.load().unwrap().title, "First");

        fs::write(
            &path,
            "title = \"Second\"\nlanguage = \"en\"\nscan_defaults = \"simple\"\nservices = []\n",
        )
        .unwrap();
        assert_eq!(store.load().unwrap().title, "Second");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_roundtrips_through_load() {
        let dir = test_dir("roundtrip");
        let _ = fs::remove_dir_all(&dir);
        let store = ConfigStore::new(dir.join("config.toml"));
        let config = sample_config("Roundtrip");

        store.save(&config).unwrap();

        assert_eq!(store.load().unwrap(), config);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn malformed_file_is_a_config_error() {
        let dir = test_dir("malformed");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("config.toml");
        fs::write(&path, "not valid toml {{{").unwrap();
        let store = ConfigStore::new(&path);

        assert!(matches!(store.load(), Err(AppError::Config(_))));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn cache_dir_sits_beside_the_config() {
        let store = ConfigStore::new("/data/config.toml");
        assert_eq!(store.config_dir(), Path::new("/data"));
        assert_eq!(store.cache_dir(), Path::new("/data/cache"));
    }

    #[test]
    fn bare_config_name_uses_the_current_directory() {
        let store = ConfigStore::new("config.toml");
        assert_eq!(store.config_dir(), Path::new("."));
        assert_eq!(store.cache_dir(), Path::new("./cache"));
    }

    #[test]
    fn ensure_cache_dir_creates_the_directory() {
        let dir = test_dir("ensure_cache");
        let _ = fs::remove_dir_all(&dir);
        let store = ConfigStore::new(dir.join("config.toml"));

        store.ensure_cache_dir().unwrap();

        assert!(store.cache_dir().is_dir());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn check_writable_reports_a_missing_directory() {
        let dir = test_dir("not_writable");
        let _ = fs::remove_dir_all(&dir);
        let store = ConfigStore::new(dir.join("missing").join("config.toml"));

        let err = store.check_writable().unwrap_err();
        assert!(err.contains(".write-test"), "unexpected message: {err}");
    }

    #[test]
    fn write_atomic_rename_failure_falls_back() {
        let dir = test_dir("rename_failure");
        let _ = fs::remove_dir_all(&dir);
        let target = dir.join("config.toml");
        // Make the target path an existing directory so `fs::rename` fails (EISDIR).
        fs::create_dir_all(&target).unwrap();

        let result = write_atomic(&target, "key = 'value'");

        assert!(
            result.is_ok(),
            "rename onto directory should succeed after fallback"
        );
        let _ = fs::remove_dir_all(&dir);
    }
}
