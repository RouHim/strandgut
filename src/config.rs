//! Configuration schema.
//!
//! `Config` is the typed TOML shape only. File location, atomic writes and
//! typed persistence errors belong to [`crate::store::ConfigStore`].

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default() {
        let config = Config::default();
        assert_eq!(config.title, "Strandgut");
        assert_eq!(config.language, "en");
        assert_eq!(config.scan_defaults, "simple");
        assert!(config.services.is_empty());
    }

    #[test]
    fn test_toml_roundtrip() {
        let config = Config {
            title: "Roundtrip".to_string(),
            language: "de".to_string(),
            scan_defaults: "medium".to_string(),
            services: vec![Service {
                name: "Service A".to_string(),
                url: "https://a.example.com".to_string(),
                icon: Some("globe".to_string()),
                description: None,
                position: Position { row: 1, col: 2 },
            }],
            background_rotate: true,
        };

        let encoded = toml::to_string_pretty(&config).expect("serialize config");
        let decoded: Config = toml::from_str(&encoded).expect("parse config");

        assert_eq!(decoded, config);
    }

    #[test]
    fn test_category_backward_compat() {
        // `Service` intentionally ignores unknown keys such as the retired
        // `category` field so old config files keep loading.
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

        let config: Config = toml::from_str(toml_content).expect("parse config with category");

        assert_eq!(config.services.len(), 1);
        assert_eq!(config.services[0].name, "Old Service");
    }

    #[test]
    fn test_background_rotate_default() {
        let config = Config::default();
        assert!(
            !config.background_rotate,
            "background_rotate should default to false"
        );
    }
}
