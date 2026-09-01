use std::collections::BTreeSet;
use std::fmt;

use font_kit::family_name::FamilyName;
use font_kit::properties::Properties;
use font_kit::source::SystemSource;

const MAX_FAMILY_NAME_CHARS: usize = 80;

pub fn list_system_monospace_fonts() -> Result<Vec<String>, SystemFontRepositoryError> {
    let source = SystemSource::new();
    let families = source
        .all_families()
        .map_err(|_| SystemFontRepositoryError)?;
    let mut monospace_families = BTreeSet::new();

    for family in families {
        let family = family.trim();
        if !is_valid_family_name(family) {
            continue;
        }
        let Ok(handle) =
            source.select_best_match(&[FamilyName::Title(family.to_owned())], &Properties::new())
        else {
            continue;
        };
        let Ok(font) = handle.load() else {
            continue;
        };
        if font.is_monospace() {
            monospace_families.insert(family.to_owned());
        }
    }

    Ok(monospace_families.into_iter().collect())
}

fn is_valid_family_name(family: &str) -> bool {
    !family.is_empty()
        && family.chars().count() <= MAX_FAMILY_NAME_CHARS
        && !family.chars().any(char::is_control)
}

#[derive(Debug)]
pub struct SystemFontRepositoryError;

impl fmt::Display for SystemFontRepositoryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("system font enumeration failed")
    }
}

impl std::error::Error for SystemFontRepositoryError {}
