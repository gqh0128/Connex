use std::fmt;
use std::path::{Path, PathBuf};

use uuid::Uuid;

use crate::domain::terminal_fonts::{TerminalFontFile, TerminalFontFormat};
use crate::infrastructure::terminal_fonts::{TerminalFontRepository, TerminalFontRepositoryError};

const MAX_FONT_BYTES: usize = 10 * 1024 * 1024;

#[derive(Clone)]
pub struct TerminalFontService {
    repository: TerminalFontRepository,
    directory: PathBuf,
}

impl TerminalFontService {
    pub fn new(repository: TerminalFontRepository, directory: PathBuf) -> Self {
        Self {
            repository,
            directory,
        }
    }

    pub async fn list(&self) -> Result<Vec<TerminalFontFile>, TerminalFontServiceError> {
        self.repository.list().await.map_err(Into::into)
    }

    pub async fn import(
        &self,
        source_path: PathBuf,
    ) -> Result<TerminalFontFile, TerminalFontServiceError> {
        let display_name = display_name_from_path(&source_path)?;
        let format = format_from_path(&source_path)?;
        let bytes = tokio::fs::read(&source_path)
            .await
            .map_err(|_| TerminalFontServiceError::File)?;
        validate_font_bytes(format, &bytes)?;

        tokio::fs::create_dir_all(&self.directory)
            .await
            .map_err(|_| TerminalFontServiceError::File)?;
        let id = Uuid::new_v4().to_string();
        let stored_file_name = format!("{id}.{}", format.extension());
        let destination = self.directory.join(&stored_file_name);
        tokio::fs::write(&destination, &bytes)
            .await
            .map_err(|_| TerminalFontServiceError::File)?;

        let font = TerminalFontFile {
            id,
            display_name,
            stored_file_name,
            format,
            byte_length: bytes.len() as u64,
            created_at: String::new(),
        };
        if let Err(error) = self.repository.insert(font.clone()).await {
            tokio::fs::remove_file(&destination)
                .await
                .map_err(|_| TerminalFontServiceError::File)?;
            return Err(error.into());
        }

        self.repository
            .find(&font.id)
            .await?
            .ok_or(TerminalFontServiceError::Storage)
    }

    pub async fn read(&self, id: &str) -> Result<Vec<u8>, TerminalFontServiceError> {
        validate_id(id)?;
        let font = self
            .repository
            .find(id)
            .await?
            .ok_or(TerminalFontServiceError::NotFound)?;
        let bytes = tokio::fs::read(self.directory.join(font.stored_file_name))
            .await
            .map_err(|_| TerminalFontServiceError::File)?;
        validate_font_bytes(font.format, &bytes)?;
        Ok(bytes)
    }

    pub async fn delete(&self, id: &str) -> Result<(), TerminalFontServiceError> {
        validate_id(id)?;
        let font = self
            .repository
            .find(id)
            .await?
            .ok_or(TerminalFontServiceError::NotFound)?;
        let path = self.directory.join(font.stored_file_name);
        let bytes = tokio::fs::read(&path)
            .await
            .map_err(|_| TerminalFontServiceError::File)?;
        tokio::fs::remove_file(&path)
            .await
            .map_err(|_| TerminalFontServiceError::File)?;

        if let Err(error) = self.repository.delete(id).await {
            tokio::fs::write(&path, bytes)
                .await
                .map_err(|_| TerminalFontServiceError::File)?;
            return Err(error.into());
        }
        Ok(())
    }
}

fn validate_id(id: &str) -> Result<(), TerminalFontServiceError> {
    Uuid::parse_str(id)
        .map(|_| ())
        .map_err(|_| TerminalFontServiceError::InvalidInput {
            field: "id",
            message: "字体标识无效，请刷新设置后重试。",
        })
}

fn display_name_from_path(path: &Path) -> Result<String, TerminalFontServiceError> {
    let display_name = path
        .file_stem()
        .and_then(|value| value.to_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or(TerminalFontServiceError::InvalidInput {
            field: "path",
            message: "字体文件名无效。",
        })?;
    if display_name.chars().count() > 80 {
        return Err(TerminalFontServiceError::InvalidInput {
            field: "path",
            message: "字体文件名不能超过 80 个字符。",
        });
    }
    Ok(display_name.to_owned())
}

fn format_from_path(path: &Path) -> Result<TerminalFontFormat, TerminalFontServiceError> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase);
    match extension.as_deref() {
        Some("ttf") => Ok(TerminalFontFormat::TrueType),
        Some("otf") => Ok(TerminalFontFormat::OpenType),
        Some("woff") => Ok(TerminalFontFormat::Woff),
        Some("woff2") => Ok(TerminalFontFormat::Woff2),
        _ => Err(TerminalFontServiceError::Unsupported),
    }
}

fn validate_font_bytes(
    format: TerminalFontFormat,
    bytes: &[u8],
) -> Result<(), TerminalFontServiceError> {
    if bytes.is_empty() || bytes.len() > MAX_FONT_BYTES {
        return Err(TerminalFontServiceError::TooLarge);
    }
    let signature = bytes
        .get(..4)
        .ok_or(TerminalFontServiceError::Unsupported)?;
    let is_valid = match format {
        TerminalFontFormat::TrueType => signature == [0, 1, 0, 0] || signature == b"true",
        TerminalFontFormat::OpenType => signature == b"OTTO",
        TerminalFontFormat::Woff => signature == b"wOFF",
        TerminalFontFormat::Woff2 => signature == b"wOF2",
    };
    if !is_valid {
        return Err(TerminalFontServiceError::Unsupported);
    }
    Ok(())
}

#[derive(Debug)]
pub enum TerminalFontServiceError {
    InvalidInput {
        field: &'static str,
        message: &'static str,
    },
    NotFound,
    Unsupported,
    TooLarge,
    File,
    Storage,
}

impl From<TerminalFontRepositoryError> for TerminalFontServiceError {
    fn from(_: TerminalFontRepositoryError) -> Self {
        Self::Storage
    }
}

impl fmt::Display for TerminalFontServiceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("terminal font operation failed")
    }
}

impl std::error::Error for TerminalFontServiceError {}
