use std::collections::{HashMap, HashSet};
use std::fmt;

use uuid::Uuid;

use crate::domain::connections::{ConnectionDraft, ConnectionProfile};
use crate::domain::ssh_config::{
    ConnectionImportMutation, ParsedSshConfigCandidate, SshConfigCandidateStatus,
    SshConfigConflictStrategy, SshConfigImportResult, SshConfigPreview, SshConfigPreviewItem,
};
use crate::infrastructure::connections::{ConnectionRepository, ConnectionRepositoryError};
use crate::infrastructure::credentials::{CredentialStore, CredentialStoreError};
use crate::infrastructure::ssh_config::{SshConfigScanner, SshConfigScannerError};

#[derive(Clone)]
pub struct SshConfigImportService {
    repository: ConnectionRepository,
    credentials: CredentialStore,
    scanner: SshConfigScanner,
}

impl SshConfigImportService {
    pub fn new(
        repository: ConnectionRepository,
        credentials: CredentialStore,
        scanner: SshConfigScanner,
    ) -> Self {
        Self {
            repository,
            credentials,
            scanner,
        }
    }

    pub async fn preview(&self) -> Result<SshConfigPreview, SshConfigImportError> {
        let parsed = self.scanner.scan_default().await?;
        let existing = self.repository.list().await?;
        Ok(build_preview(parsed, &existing))
    }

    pub async fn import(
        &self,
        fingerprint: String,
        selected_keys: Vec<String>,
        strategy: SshConfigConflictStrategy,
    ) -> Result<SshConfigImportResult, SshConfigImportError> {
        if selected_keys.is_empty() {
            return Err(SshConfigImportError::InvalidInput {
                field: "selectedKeys",
                message: "请至少选择一个可导入的连接。",
            });
        }

        let parsed = self.scanner.scan_default().await?;
        if parsed.fingerprint != fingerprint {
            return Err(SshConfigImportError::ConfigChanged);
        }
        let existing = self.repository.list().await?;
        let preview = build_preview(parsed, &existing);
        let selected = selected_keys.into_iter().collect::<HashSet<_>>();
        let known_keys = preview
            .items
            .iter()
            .map(|item| item.candidate.key.as_str())
            .collect::<HashSet<_>>();
        if selected
            .iter()
            .any(|key| !known_keys.contains(key.as_str()))
        {
            return Err(SshConfigImportError::ConfigChanged);
        }

        let mut reserved_names = existing
            .iter()
            .map(|profile| profile.name.to_lowercase())
            .collect::<HashSet<_>>();
        let mut mutations = Vec::new();
        let mut result = SshConfigImportResult::default();

        for item in preview
            .items
            .into_iter()
            .filter(|item| selected.contains(&item.candidate.key))
        {
            if item.status == SshConfigCandidateStatus::Skipped {
                result.skipped_count += 1;
                continue;
            }

            let mut candidate = item.candidate;
            match item.status {
                SshConfigCandidateStatus::Ready => {
                    reserved_names.insert(candidate.alias.to_lowercase());
                    let draft = candidate_to_draft(candidate)?;
                    mutations.push(ConnectionImportMutation::Create {
                        id: Uuid::new_v4().to_string(),
                        draft,
                    });
                    result.imported_count += 1;
                }
                SshConfigCandidateStatus::Conflict => match strategy {
                    SshConfigConflictStrategy::Skip => result.skipped_count += 1,
                    SshConfigConflictStrategy::Overwrite => {
                        let id = item
                            .existing_connection_id
                            .ok_or(SshConfigImportError::ConfigChanged)?;
                        let draft = candidate_to_draft(candidate)?;
                        mutations.push(ConnectionImportMutation::Overwrite { id, draft });
                        result.overwritten_count += 1;
                    }
                    SshConfigConflictStrategy::KeepBoth => {
                        candidate.alias = unique_import_name(&candidate.alias, &mut reserved_names);
                        let draft = candidate_to_draft(candidate)?;
                        mutations.push(ConnectionImportMutation::Create {
                            id: Uuid::new_v4().to_string(),
                            draft,
                        });
                        result.duplicated_count += 1;
                    }
                },
                SshConfigCandidateStatus::Skipped => unreachable!(),
            }
        }

        for mutation in &mutations {
            let ConnectionImportMutation::Overwrite { id, .. } = mutation else {
                continue;
            };
            if existing
                .iter()
                .any(|profile| profile.id == *id && profile.has_stored_credential)
            {
                // Move legacy keyring entries into SQLite first, so the following
                // transaction can remove all stored credentials atomically.
                self.credentials.migrate_legacy(id).await?;
            }
        }

        self.repository.apply_import(mutations).await?;
        Ok(result)
    }
}

fn build_preview(
    parsed: crate::domain::ssh_config::ParsedSshConfig,
    existing: &[ConnectionProfile],
) -> SshConfigPreview {
    let mut existing_by_name = HashMap::<String, Vec<&ConnectionProfile>>::new();
    for profile in existing {
        existing_by_name
            .entry(profile.name.to_lowercase())
            .or_default()
            .push(profile);
    }

    let items = parsed
        .candidates
        .into_iter()
        .map(|candidate| {
            let matches = existing_by_name
                .get(&candidate.alias.to_lowercase())
                .map(Vec::as_slice)
                .unwrap_or_default();
            let validation_error = candidate_to_draft(candidate.clone()).err();
            let (status, existing_connection_id, reason) = if let Some(reason) =
                candidate.skipped_reason.clone().or_else(|| {
                    validation_error.map(|error| match error {
                        SshConfigImportError::InvalidInput { message, .. } => message.to_owned(),
                        _ => "连接配置无效。".to_owned(),
                    })
                }) {
                (SshConfigCandidateStatus::Skipped, None, Some(reason))
            } else if matches.len() > 1 {
                (
                    SshConfigCandidateStatus::Skipped,
                    None,
                    Some("Connex 中存在多个同名连接，无法安全判断覆盖目标。".to_owned()),
                )
            } else if let Some(profile) = matches.first() {
                (
                    SshConfigCandidateStatus::Conflict,
                    Some(profile.id.clone()),
                    Some("Connex 中已有同名连接。".to_owned()),
                )
            } else {
                (SshConfigCandidateStatus::Ready, None, None)
            };

            SshConfigPreviewItem {
                candidate,
                status,
                existing_connection_id,
                reason,
            }
        })
        .collect();

    SshConfigPreview {
        source_path: parsed.source_path,
        fingerprint: parsed.fingerprint,
        items,
        warnings: parsed.warnings,
    }
}

fn candidate_to_draft(
    candidate: ParsedSshConfigCandidate,
) -> Result<ConnectionDraft, SshConfigImportError> {
    let authentication_method = candidate.authentication_method();
    ConnectionDraft::new(
        candidate.alias,
        candidate.host,
        candidate.port,
        candidate.username,
        authentication_method,
        candidate.private_key_path,
    )
    .map_err(|error| SshConfigImportError::InvalidInput {
        field: error.field,
        message: error.message,
    })
}

fn unique_import_name(base: &str, reserved_names: &mut HashSet<String>) -> String {
    for index in 1..=10_000 {
        let suffix = if index == 1 {
            " (导入)".to_owned()
        } else {
            format!(" (导入 {index})")
        };
        let max_base_chars = 80usize.saturating_sub(suffix.chars().count());
        let prefix = base.chars().take(max_base_chars).collect::<String>();
        let candidate = format!("{prefix}{suffix}");
        if reserved_names.insert(candidate.to_lowercase()) {
            return candidate;
        }
    }
    format!("导入连接-{}", Uuid::new_v4())
}

#[derive(Debug)]
pub enum SshConfigImportError {
    InvalidInput {
        field: &'static str,
        message: &'static str,
    },
    HomeUnavailable,
    NotFound,
    FileUnavailable,
    TooLarge,
    ConfigChanged,
    Storage,
    Credentials,
}

impl From<SshConfigScannerError> for SshConfigImportError {
    fn from(error: SshConfigScannerError) -> Self {
        match error {
            SshConfigScannerError::HomeUnavailable => Self::HomeUnavailable,
            SshConfigScannerError::NotFound => Self::NotFound,
            SshConfigScannerError::Unavailable => Self::FileUnavailable,
            SshConfigScannerError::TooLarge => Self::TooLarge,
        }
    }
}

impl From<ConnectionRepositoryError> for SshConfigImportError {
    fn from(_: ConnectionRepositoryError) -> Self {
        Self::Storage
    }
}

impl From<CredentialStoreError> for SshConfigImportError {
    fn from(_: CredentialStoreError) -> Self {
        Self::Credentials
    }
}

impl fmt::Display for SshConfigImportError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidInput { .. } => formatter.write_str("invalid SSH config import"),
            Self::HomeUnavailable => formatter.write_str("home directory is unavailable"),
            Self::NotFound => formatter.write_str("SSH config was not found"),
            Self::FileUnavailable => formatter.write_str("SSH config is unavailable"),
            Self::TooLarge => formatter.write_str("SSH config exceeds scan limits"),
            Self::ConfigChanged => formatter.write_str("SSH config changed after preview"),
            Self::Storage => formatter.write_str("connection storage is unavailable"),
            Self::Credentials => formatter.write_str("credential storage is unavailable"),
        }
    }
}

impl std::error::Error for SshConfigImportError {}
