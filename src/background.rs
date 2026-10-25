//! Background image rotation via the Pexels API.
//!
//! Downloads photos from Pexels based on a search query and periodically
//! rotates the background image displayed on the dashboard.

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

use serde::{Deserialize, Serialize};

use crate::config::Config;
use crate::error::AppError;
use crate::store::ConfigStore;

/// Search query used to fetch background photos from Pexels.
const PEXELS_SEARCH_QUERY: &str = "nordsee";

/// Interval (in seconds) between background image rotations.
pub const ROTATION_INTERVAL_SECS: u64 = 3600;

/// Maximum age (in days) for cached photos before they are re-fetched.
const CACHE_MAX_AGE_DAYS: u64 = 7;

/// Response from the Pexels curated / search API.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct PexelsPhotoResponse {
    pub photos: Vec<PexelsPhoto>,
}

/// A single photo from the Pexels API.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct PexelsPhoto {
    pub id: u64,
    pub width: u32,
    pub height: u32,
    pub url: String,
    pub photographer: String,
    pub photographer_url: String,
    pub photographer_id: u64,
    pub avg_color: String,
    pub src: PexelsSrc,
    pub alt: String,
}

/// Available image URL variants for a Pexels photo.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct PexelsSrc {
    pub original: Option<String>,
    pub large2x: Option<String>,
    pub large: Option<String>,
    pub medium: Option<String>,
    pub small: Option<String>,
    pub portrait: Option<String>,
    pub landscape: Option<String>,
    pub tiny: Option<String>,
}

/// Credit information for the currently displayed background photo.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotoCredit {
    pub photographer: String,
    pub photographer_url: String,
    pub photo_url: String,
}

/// Status of the background rotation feature for API responses.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackgroundStatus {
    pub available: bool,
    pub rotate_enabled: bool,
    pub photo: Option<PhotoCredit>,
}

/// Internal state for the background image rotation system.
#[derive(Debug, Default)]
struct BackgroundState {
    cached_path: Option<PathBuf>,
    credit: Option<PhotoCredit>,
    last_fetch: Option<Instant>,
    fetch_in_progress: bool,
}

/// Pexels-backed background rotation.
///
/// Owns the rotation state machine, the cache file, and the credit sidecar.
/// Callers ask for a status, ensure a rotation, or read the photo; they do not
/// lock state or decide when a fetch is due.
pub struct Background {
    state: Mutex<BackgroundState>,
    photo_path: PathBuf,
    credit_path: PathBuf,
}

impl Background {
    /// Create the rotation module rooted at `cache_dir`.
    ///
    /// State is hydrated from the cached photo and credit sidecar so a restart
    /// keeps serving the current photo and its credit.
    pub fn new(cache_dir: PathBuf) -> Self {
        let photo_path = cache_dir.join("background.jpg");
        let credit_path = cache_dir.join("background.json");
        let state = hydrate(&photo_path, &credit_path);
        Self {
            state: Mutex::new(state),
            photo_path,
            credit_path,
        }
    }

    /// The current status for `GET /api/background/status`.
    pub fn status(&self, config: &Config) -> BackgroundStatus {
        let state = self.lock();
        BackgroundStatus {
            available: pexels_available(),
            rotate_enabled: config.background_rotate,
            photo: state.credit.clone(),
        }
    }

    /// Start a background fetch when rotation is enabled and the photo is due.
    ///
    /// The decision and the in-progress flag are one atomic step, so concurrent
    /// status requests cannot start duplicate fetches.
    pub fn ensure_rotation(self: &Arc<Self>, config: &Config, store: Arc<ConfigStore>) {
        if !pexels_available() || !self.begin_fetch(config) {
            return;
        }

        let background = Arc::clone(self);
        let config = config.clone();
        tokio::spawn(async move {
            let worker = Arc::clone(&background);
            let result =
                tokio::task::spawn_blocking(move || worker.fetch_and_cache(&config, &store)).await;
            if result.is_err() {
                // The blocking task panicked; release the in-progress gate.
                background.reset_fetch();
            }
        });
    }

    /// Read the cached photo, deleting it when stale or corrupt.
    pub fn photo(&self) -> Option<Vec<u8>> {
        match read_cached_photo(&self.photo_path) {
            Ok(bytes) => Some(bytes),
            Err(e) => {
                log::debug!("Background photo unavailable: {e}");
                let mut state = self.lock();
                state.cached_path = None;
                state.credit = None;
                state.last_fetch = None;
                let _ = fs::remove_file(&self.credit_path);
                None
            }
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, BackgroundState> {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn begin_fetch(&self, config: &Config) -> bool {
        if !config.background_rotate {
            return false;
        }

        let mut state = self.lock();
        if state.fetch_in_progress {
            return false;
        }
        let due = state
            .last_fetch
            .map(|last| last.elapsed().as_secs() > ROTATION_INTERVAL_SECS)
            .unwrap_or(true);
        if !due {
            return false;
        }

        state.fetch_in_progress = true;
        true
    }

    fn reset_fetch(&self) {
        self.lock().fetch_in_progress = false;
    }

    fn fetch_and_cache(&self, config: &Config, store: &ConfigStore) -> Result<(), AppError> {
        let result = do_fetch(config, store);

        let mut state = self.lock();
        state.fetch_in_progress = false;

        match result {
            Ok(fetched) => {
                if let Err(e) = write_credit(&self.credit_path, &fetched.credit) {
                    log::warn!("Failed to write background credit: {e}");
                }
                state.cached_path = Some(fetched.path);
                state.credit = Some(fetched.credit);
                state.last_fetch = Some(Instant::now());
                Ok(())
            }
            Err(e) => {
                log::warn!("Background fetch failed: {e}");
                // Back off for one rotation interval instead of retrying on
                // every status request.
                state.last_fetch = Some(Instant::now());
                Err(e)
            }
        }
    }
}

/// A photo downloaded, validated, and cached to disk.
struct FetchedPhoto {
    path: PathBuf,
    credit: PhotoCredit,
}

fn pexels_available() -> bool {
    std::env::var("PEXELS_API_KEY").is_ok_and(|value| !value.is_empty())
}

fn hydrate(photo_path: &Path, credit_path: &Path) -> BackgroundState {
    let Some(metadata) = fs::metadata(photo_path).ok() else {
        return BackgroundState::default();
    };
    let age = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.elapsed().ok())
        .unwrap_or(Duration::ZERO);

    if age > Duration::from_secs(CACHE_MAX_AGE_DAYS * 86400) {
        let _ = fs::remove_file(photo_path);
        let _ = fs::remove_file(credit_path);
        return BackgroundState::default();
    }

    let credit = fs::read(credit_path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<PhotoCredit>(&bytes).ok());

    BackgroundState {
        cached_path: Some(photo_path.to_path_buf()),
        credit,
        last_fetch: Instant::now().checked_sub(age),
        fetch_in_progress: false,
    }
}

fn write_credit(path: &Path, credit: &PhotoCredit) -> Result<(), AppError> {
    let json = serde_json::to_vec_pretty(credit)
        .map_err(|e| AppError::Internal(format!("failed to serialize photo credit: {e}")))?;
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, json).map_err(|e| {
        AppError::Internal(format!(
            "failed to write photo credit {}: {e}",
            tmp_path.display()
        ))
    })?;
    fs::rename(&tmp_path, path).map_err(|e| {
        AppError::Internal(format!(
            "failed to rename photo credit {} -> {}: {e}",
            tmp_path.display(),
            path.display()
        ))
    })
}

/// Fetch a photo from the Pexels API.
pub fn select_best_url(src: &PexelsSrc) -> Option<&str> {
    src.landscape
        .as_deref()
        .or(src.large.as_deref())
        .or(src.medium.as_deref())
        .or(src.original.as_deref())
}

pub fn fetch_pexels_photo(api_key: &str, query: &str) -> Result<PexelsPhoto, AppError> {
    if api_key.is_empty() {
        return Err(AppError::Internal("pexels API key is empty".into()));
    }

    let url = build_pexels_url(query, 80, 1);

    let agent = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(5)))
        .build()
        .new_agent();

    let delays = [1u64, 2, 4];

    for &delay in &delays {
        let mut response = agent
            .get(&url)
            .header("Authorization", api_key)
            .call()
            .map_err(|e| AppError::Internal(format!("pexels request failed: {e}")))?;

        if response.status() == 429 {
            std::thread::sleep(std::time::Duration::from_secs(delay));
            continue;
        }

        let body_bytes = response
            .body_mut()
            .read_to_string()
            .map_err(|e| AppError::Internal(format!("pexels request failed: {e}")))?;

        let mut photo_response: PexelsPhotoResponse = serde_json::from_str(&body_bytes)
            .map_err(|e| AppError::Internal(format!("pexels request failed: {e}")))?;
        if photo_response.photos.is_empty() {
            return Err(AppError::Internal("no results from Pexels".into()));
        }

        let idx = fastrand::usize(..photo_response.photos.len());
        return Ok(photo_response.photos.swap_remove(idx));
    }

    Err(AppError::Internal(
        "pexels request rate limited after all retries".into(),
    ))
}

/// Validate that image data is a supported format (JPEG, PNG, WebP).
pub fn validate_image(data: &[u8]) -> Result<(), AppError> {
    if data.len() < 3 {
        return Err(AppError::Internal("invalid image format".into()));
    }

    // JPEG: first 3 bytes are FF D8 FF
    if data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
        return Ok(());
    }

    // PNG: first 4 bytes are 89 50 4E 47
    if data.len() >= 4 && data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47 {
        return Ok(());
    }

    // WebP: starts with RIFF and contains WEBP at bytes 8-11
    if data.len() >= 12
        && data[0] == b'R'
        && data[1] == b'I'
        && data[2] == b'F'
        && data[3] == b'F'
        && data[8] == b'W'
        && data[9] == b'E'
        && data[10] == b'B'
        && data[11] == b'P'
    {
        return Ok(());
    }

    Err(AppError::Internal("invalid image format".into()))
}

/// Cache a downloaded photo to disk.
pub fn cache_photo(image_data: &[u8], cache_dir: &Path) -> Result<PathBuf, AppError> {
    validate_image(image_data)?;

    fs::create_dir_all(cache_dir).map_err(|e| {
        AppError::Internal(format!(
            "failed to create cache dir {}: {e}",
            cache_dir.display()
        ))
    })?;

    let tmp_path = cache_dir.join("background.tmp");
    let final_path = cache_dir.join("background.jpg");

    let mut tmp_file = fs::File::create(&tmp_path).map_err(|e| {
        AppError::Internal(format!(
            "failed to create cache file {}: {e}",
            tmp_path.display()
        ))
    })?;
    tmp_file.write_all(image_data).map_err(|e| {
        AppError::Internal(format!(
            "failed to write cache file {}: {e}",
            tmp_path.display()
        ))
    })?;
    drop(tmp_file);

    fs::rename(&tmp_path, &final_path).map_err(|e| {
        AppError::Internal(format!(
            "failed to rename cache file {} -> {}: {e}",
            tmp_path.display(),
            final_path.display()
        ))
    })?;

    Ok(final_path)
}

/// Read a cached photo from disk, using a max age of 7 days.
pub fn read_cached_photo(path: &Path) -> Result<Vec<u8>, AppError> {
    read_cached_photo_with_max_age(path, Duration::from_secs(CACHE_MAX_AGE_DAYS * 86400))
}

/// Read a cached photo from disk with a configurable maximum age.
fn read_cached_photo_with_max_age(path: &Path, max_age: Duration) -> Result<Vec<u8>, AppError> {
    if !path.exists() {
        return Err(AppError::Internal("cached photo not found".into()));
    }

    let metadata = fs::metadata(path).map_err(|e| {
        AppError::Internal(format!(
            "failed to read cache metadata {}: {e}",
            path.display()
        ))
    })?;
    let modified = metadata
        .modified()
        .map_err(|e| AppError::Internal(format!("failed to read modification time: {e}")))?;
    let age = SystemTime::now()
        .duration_since(modified)
        .unwrap_or(Duration::ZERO);

    if age > max_age {
        let _ = fs::remove_file(path);
        return Err(AppError::Internal("cached photo expired".into()));
    }
    let bytes = fs::read(path).map_err(|e| {
        AppError::Internal(format!("failed to read cache file {}: {e}", path.display()))
    })?;

    if validate_image(&bytes).is_err() {
        let _ = fs::remove_file(path);
        return Err(AppError::Internal("cached photo corrupted".into()));
    }

    Ok(bytes)
}

/// Build the Pexels API URL for the given search query and page parameters.
pub fn build_pexels_url(query: &str, per_page: u32, page: u32) -> String {
    format!(
        "https://api.pexels.com/v1/search?query={query}&orientation=landscape&per_page={per_page}&page={page}"
    )
}

fn do_fetch(config: &Config, store: &ConfigStore) -> Result<FetchedPhoto, AppError> {
    if !config.background_rotate {
        return Err(AppError::Internal("background rotation disabled".into()));
    }

    let api_key = std::env::var("PEXELS_API_KEY")
        .map_err(|_| AppError::Internal("PEXELS_API_KEY not set".into()))?;

    if api_key.is_empty() {
        return Err(AppError::Internal("PEXELS_API_KEY not set".into()));
    }

    let photo = fetch_pexels_photo(&api_key, PEXELS_SEARCH_QUERY)?;

    let image_url = select_best_url(&photo.src).ok_or_else(|| {
        AppError::Internal("no suitable image URL found in Pexels response".into())
    })?;

    let agent = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(5)))
        .build()
        .new_agent();

    let response = agent
        .get(image_url)
        .call()
        .map_err(|e| AppError::Internal(format!("failed to download image: {e}")))?;

    let mut body: Vec<u8> = Vec::new();
    response
        .into_body()
        .into_reader()
        .read_to_end(&mut body)
        .map_err(|e| AppError::Internal(format!("failed to read image data: {e}")))?;

    let path = cache_photo(&body, store.cache_dir())?;

    Ok(FetchedPhoto {
        path,
        credit: PhotoCredit {
            photographer: photo.photographer.clone(),
            photographer_url: photo.photographer_url.clone(),
            photo_url: image_url.to_string(),
        },
    })
}

#[cfg(test)]
mod tests {
    use std::time::SystemTime;

    use super::*;

    fn test_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("strandgut_test_background_{}", name))
    }

    fn valid_jpeg_bytes() -> Vec<u8> {
        vec![0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]
    }

    fn valid_png_bytes() -> Vec<u8> {
        vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
    }

    fn valid_webp_bytes() -> Vec<u8> {
        let mut data = vec![0x52, 0x49, 0x46, 0x46];
        data.extend_from_slice(&[0x00; 4]);
        data.extend_from_slice(b"WEBP");
        data
    }

    fn set_file_mtime(path: &PathBuf, time: SystemTime) {
        let f = std::fs::File::open(path).unwrap();
        let times = std::fs::FileTimes::new().set_modified(time);
        let _ = f.set_times(times);
    }

    #[test]
    fn test_build_pexels_url() {
        let url = build_pexels_url("nordsee", 1, 1);
        assert!(
            url.contains("api.pexels.com"),
            "URL should contain pexels domain"
        );
        assert!(
            url.contains("nordsee"),
            "URL should contain the search query"
        );
    }

    #[test]
    fn test_fetch_pexels_photo_empty_key() {
        let result = fetch_pexels_photo("", "nordsee");
        assert!(result.is_err(), "empty API key should return an error");
    }

    #[test]
    fn test_select_best_url_landscape() {
        let src = PexelsSrc {
            original: Some("https://example.com/original.jpg".into()),
            large2x: Some("https://example.com/large2x.jpg".into()),
            large: Some("https://example.com/large.jpg".into()),
            medium: Some("https://example.com/medium.jpg".into()),
            small: Some("https://example.com/small.jpg".into()),
            portrait: Some("https://example.com/portrait.jpg".into()),
            landscape: Some("https://example.com/landscape.jpg".into()),
            tiny: Some("https://example.com/tiny.jpg".into()),
        };
        assert_eq!(
            select_best_url(&src),
            Some("https://example.com/landscape.jpg"),
            "landscape variant should be preferred"
        );
    }

    #[test]
    fn test_select_best_url_fallback() {
        let src = PexelsSrc {
            original: None,
            large2x: None,
            large: Some("https://example.com/large.jpg".into()),
            medium: None,
            small: None,
            portrait: None,
            landscape: None,
            tiny: None,
        };
        assert_eq!(
            select_best_url(&src),
            Some("https://example.com/large.jpg"),
            "large variant should be returned when landscape is absent"
        );
    }

    #[test]
    fn test_select_best_url_none() {
        let src = PexelsSrc {
            original: None,
            large2x: None,
            large: None,
            medium: None,
            small: None,
            portrait: None,
            landscape: None,
            tiny: None,
        };
        assert_eq!(
            select_best_url(&src),
            None,
            "all-absent src should return None"
        );
    }

    #[test]
    fn test_validate_image_jpeg() {
        let result = validate_image(&valid_jpeg_bytes());
        assert!(result.is_ok(), "valid JPEG should be Ok");
    }

    #[test]
    fn test_validate_image_png() {
        let result = validate_image(&valid_png_bytes());
        assert!(result.is_ok(), "valid PNG should be Ok");
    }

    #[test]
    fn test_validate_image_webp() {
        let result = validate_image(&valid_webp_bytes());
        assert!(result.is_ok(), "valid WebP should be Ok");
    }

    #[test]
    fn test_validate_image_invalid() {
        let garbage = b"this is not an image";
        let result = validate_image(garbage);
        assert!(result.is_err(), "garbage bytes should be invalid");
        assert_eq!(
            result.unwrap_err().to_string(),
            "internal error: invalid image format"
        );
    }

    #[test]
    fn test_validate_image_too_short() {
        let result = validate_image(&[0xFF, 0xD8]);
        assert!(result.is_err(), "too-short data should be invalid");
    }

    #[test]
    fn test_cache_photo_writes_file() {
        let dir = test_dir("test_cache_photo_writes_file");
        let _ = std::fs::remove_dir_all(&dir);

        let data = valid_jpeg_bytes();
        let result = cache_photo(&data, &dir);
        assert!(
            result.is_ok(),
            "cache_photo should succeed: {:?}",
            result.err()
        );

        let final_path = result.unwrap();
        assert_eq!(final_path.file_name().unwrap(), "background.jpg");
        assert!(final_path.exists(), "background.jpg should exist");

        let written = std::fs::read(&final_path).unwrap();
        assert_eq!(written, data, "cached file should contain original data");

        let tmp_path = dir.join("background.tmp");
        assert!(!tmp_path.exists(), "tmp file should have been removed");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_cache_photo_invalid_format() {
        let dir = test_dir("test_cache_photo_invalid_format");
        let _ = std::fs::remove_dir_all(&dir);

        let garbage = b"not an image";
        let result = cache_photo(garbage, &dir);
        assert!(result.is_err(), "should reject invalid image data");

        assert!(
            !dir.exists()
                || dir
                    .read_dir()
                    .map(|mut d| d.next().is_none())
                    .unwrap_or(true)
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_read_cached_photo_empty_dir() {
        let dir = test_dir("test_read_cached_photo_empty_dir");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let path = dir.join("background.jpg");
        let result = read_cached_photo(&path);
        assert!(result.is_err(), "non-existent file should error");
        assert_eq!(
            result.unwrap_err().to_string(),
            "internal error: cached photo not found"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_stale_cache_purged() {
        let dir = test_dir("test_stale_cache_purged");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let path = dir.join("background.jpg");
        let data = valid_jpeg_bytes();
        std::fs::write(&path, &data).unwrap();

        let eight_days_ago = SystemTime::now() - Duration::from_secs(8 * 86400);
        set_file_mtime(&path, eight_days_ago);

        let zero_max_age = Duration::from_secs(0);
        let result = read_cached_photo_with_max_age(&path, zero_max_age);
        assert!(result.is_err(), "stale cache should error");
        assert_eq!(
            result.unwrap_err().to_string(),
            "internal error: cached photo expired"
        );

        assert!(!path.exists(), "stale file should be deleted");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_corrupt_cache_detected() {
        let dir = test_dir("test_corrupt_cache_detected");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let path = dir.join("background.jpg");
        std::fs::write(&path, b"not a valid image").unwrap();

        let result = read_cached_photo(&path);
        assert!(result.is_err(), "corrupt cache should error");
        assert_eq!(
            result.unwrap_err().to_string(),
            "internal error: cached photo corrupted"
        );

        assert!(!path.exists(), "corrupt file should be deleted");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_get_background_status_no_key() {
        let prev = std::env::var("PEXELS_API_KEY").ok();
        unsafe { std::env::remove_var("PEXELS_API_KEY") };

        let dir = test_dir("status_no_key");
        let _ = std::fs::remove_dir_all(&dir);
        let background = Background::new(dir);
        let config = Config::default();
        let status = background.status(&config);

        assert!(
            !status.available,
            "available should be false when PEXELS_API_KEY is not set"
        );
        assert!(
            !status.rotate_enabled,
            "rotate_enabled should default to false"
        );
        assert!(
            status.photo.is_none(),
            "photo should be None when no cached data"
        );

        if let Some(key) = prev {
            unsafe { std::env::set_var("PEXELS_API_KEY", key) };
        }
    }

    #[test]
    fn test_hydrates_photo_and_credit_from_disk() {
        let dir = test_dir("hydrate");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        std::fs::write(dir.join("background.jpg"), valid_jpeg_bytes()).unwrap();
        let credit = PhotoCredit {
            photographer: "Ada".into(),
            photographer_url: "https://example.com/ada".into(),
            photo_url: "https://example.com/photo.jpg".into(),
        };
        std::fs::write(
            dir.join("background.json"),
            serde_json::to_vec(&credit).unwrap(),
        )
        .unwrap();

        let background = Background::new(dir.clone());
        let status = background.status(&Config::default());

        assert_eq!(status.photo.unwrap().photographer, "Ada");
        assert!(
            background.photo().is_some(),
            "cached photo should be served"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_rotation_is_not_due_when_disabled() {
        let dir = test_dir("rotation_disabled");
        let _ = std::fs::remove_dir_all(&dir);
        let background = Background::new(dir);
        let config = Config::default();

        assert!(!background.begin_fetch(&config));
    }

    #[test]
    fn test_rotation_is_due_without_a_cached_photo() {
        let dir = test_dir("rotation_due");
        let _ = std::fs::remove_dir_all(&dir);
        let background = Background::new(dir);
        let config = Config {
            background_rotate: true,
            ..Config::default()
        };

        assert!(background.begin_fetch(&config));
        assert!(
            !background.begin_fetch(&config),
            "a second call must not start a duplicate fetch"
        );
        background.reset_fetch();
    }

    #[test]
    fn test_rotation_is_not_due_while_fresh() {
        let dir = test_dir("rotation_fresh");
        let _ = std::fs::remove_dir_all(&dir);
        let background = Background::new(dir);
        let config = Config {
            background_rotate: true,
            ..Config::default()
        };
        {
            let mut state = background.lock();
            state.cached_path = Some(PathBuf::from("/tmp/photo.jpg"));
            state.last_fetch = Some(Instant::now());
        }

        assert!(!background.begin_fetch(&config));
    }
}
