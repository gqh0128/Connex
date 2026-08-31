use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::domain::terminal_fonts::TerminalFontFile;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalFontDto {
    pub id: String,
    pub display_name: String,
    pub format: String,
    pub byte_length: u64,
    pub created_at: String,
}

impl From<TerminalFontFile> for TerminalFontDto {
    fn from(font: TerminalFontFile) -> Self {
        Self {
            id: font.id,
            display_name: font.display_name,
            format: font.format.as_storage().to_owned(),
            byte_length: font.byte_length,
            created_at: font.created_at,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportTerminalFontInput {
    pub path: PathBuf,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalFontIdInput {
    pub id: String,
}
