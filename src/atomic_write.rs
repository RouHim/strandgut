//! Atomic file replacement shared by the config store and both caches.
//!
//! Every persistent file this app writes goes through [`write_atomic`], so a
//! process crash or a full disk leaves either the old file or the new one, not
//! a half-written mixture.

use std::fs;
use std::path::{Path, PathBuf};

/// Replace `path` with `bytes` atomically.
///
/// Creates missing parent directories, writes `{path}.tmp`, then renames it
/// over `path`. Failures are returned as messages that name the failing path so
/// callers can surface them without losing the context.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create parent dir {}: {e}", parent.display()))?;
    }

    let tmp_path = {
        let mut s = path.as_os_str().to_os_string();
        s.push(".tmp");
        PathBuf::from(s)
    };

    fs::write(&tmp_path, bytes)
        .map_err(|e| format!("failed to write tmp file {}: {e}", tmp_path.display()))?;

    fs::rename(&tmp_path, path).map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        format!(
            "failed to rename {} -> {}: {e}",
            tmp_path.display(),
            path.display()
        )
    })
}
