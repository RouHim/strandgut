//! Internationalisation — embedded locale bundles (en + de).
//!
//! Provides a `Locale` enum and a lookup function that returns
//! translated strings for the active language.  The frontend performs
//! browser-language detection via `navigator.language` and requests the
//! matching bundle.
//!
//! ## Language detection
//!
//! `detect_language()` parses an `Accept-Language` HTTP header and returns
//! the first supported language code (`"de"` or `"en"`), defaulting to
//! `"en"` when nothing matches.

/// Parse an `Accept-Language` header and return the first supported language.
///
/// Supported languages: `"de"`, `"en"`.
///
/// # Examples
///
/// ```
/// assert_eq!(i18n::detect_language(Some("de-DE,de;q=0.9,en;q=0.8")), "de");
/// assert_eq!(i18n::detect_language(Some("en-US,en;q=0.9")), "en");
/// assert_eq!(i18n::detect_language(None), "en");
/// assert_eq!(i18n::detect_language(Some("fr-FR")), "en");
/// ```
#[allow(dead_code)]
pub fn detect_language(accept_language: Option<&str>) -> &'static str {
    let Some(header) = accept_language else {
        return "en";
    };
    if header.is_empty() {
        return "en";
    }

    for part in header.split(',') {
        let lang = part.split(';').next().unwrap_or("").trim();
        let primary = lang.split('-').next().unwrap_or("").to_lowercase();
        match primary.as_str() {
            "de" => return "de",
            "en" => return "en",
            _ => continue,
        }
    }
    "en"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_german() {
        assert_eq!(detect_language(Some("de-DE,de;q=0.9,en;q=0.8")), "de");
    }

    #[test]
    fn test_detect_english() {
        assert_eq!(detect_language(Some("en-US,en;q=0.9")), "en");
    }

    #[test]
    fn test_fallback_empty() {
        assert_eq!(detect_language(None), "en");
        assert_eq!(detect_language(Some("")), "en");
    }

    #[test]
    fn test_fallback_unsupported() {
        assert_eq!(detect_language(Some("fr-FR")), "en");
    }

    #[test]
    fn test_fallback_garbage() {
        assert_eq!(detect_language(Some("garbage")), "en");
    }

    #[test]
    fn test_first_match() {
        assert_eq!(detect_language(Some("fr,de;q=0.5")), "de");
    }

    #[test]
    fn test_case_insensitive() {
        assert_eq!(detect_language(Some("DE-de")), "de");
    }
}
