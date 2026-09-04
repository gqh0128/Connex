use std::collections::HashSet;
use std::env;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use ring::digest::{SHA256, digest};

use crate::domain::ssh_config::{ParsedSshConfig, ParsedSshConfigCandidate};

const MAX_CONFIG_BYTES: usize = 2 * 1024 * 1024;
const MAX_CONFIG_FILES: usize = 64;
const MAX_INCLUDE_DEPTH: usize = 8;

#[derive(Clone, Default)]
pub struct SshConfigScanner;

impl SshConfigScanner {
    pub fn new() -> Self {
        Self
    }

    pub async fn scan_default(&self) -> Result<ParsedSshConfig, SshConfigScannerError> {
        tokio::task::spawn_blocking(scan_default_blocking)
            .await
            .map_err(|_| SshConfigScannerError::Unavailable)?
    }
}

#[derive(Debug)]
pub enum SshConfigScannerError {
    HomeUnavailable,
    NotFound,
    Unavailable,
    TooLarge,
}

impl fmt::Display for SshConfigScannerError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::HomeUnavailable => formatter.write_str("home directory is unavailable"),
            Self::NotFound => formatter.write_str("SSH config was not found"),
            Self::Unavailable => formatter.write_str("SSH config is unavailable"),
            Self::TooLarge => formatter.write_str("SSH config exceeds scan limits"),
        }
    }
}

impl std::error::Error for SshConfigScannerError {}

#[derive(Clone)]
struct Directive {
    keyword: String,
    values: Vec<String>,
    source_path: String,
    line_number: usize,
}

#[derive(Clone)]
struct HostSection {
    patterns: Vec<String>,
    directives: Vec<Directive>,
    source_path: String,
    line_number: usize,
    is_match: bool,
}

struct ScanState {
    ssh_dir: PathBuf,
    home_dir: PathBuf,
    directives: Vec<Directive>,
    fingerprint_input: Vec<u8>,
    active_paths: HashSet<PathBuf>,
    file_count: usize,
    warnings: Vec<String>,
    total_bytes: usize,
}

fn scan_default_blocking() -> Result<ParsedSshConfig, SshConfigScannerError> {
    let home_dir = home_directory().ok_or(SshConfigScannerError::HomeUnavailable)?;
    let ssh_dir = home_dir.join(".ssh");
    let config_path = ssh_dir.join("config");
    if !config_path.is_file() {
        return Err(SshConfigScannerError::NotFound);
    }

    let mut state = ScanState {
        ssh_dir,
        home_dir,
        directives: Vec::new(),
        fingerprint_input: Vec::new(),
        active_paths: HashSet::new(),
        file_count: 0,
        warnings: Vec::new(),
        total_bytes: 0,
    };
    expand_config_file(&config_path, 0, &mut state)?;

    let fingerprint = URL_SAFE_NO_PAD.encode(digest(&SHA256, &state.fingerprint_input));
    let source_path = config_path.to_string_lossy().into_owned();
    let sections = build_sections(state.directives, &mut state.warnings);
    let candidates = build_candidates(&sections, &state.home_dir);

    Ok(ParsedSshConfig {
        source_path,
        fingerprint,
        candidates,
        warnings: state.warnings,
    })
}

fn home_directory() -> Option<PathBuf> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn local_username() -> Option<String> {
    env::var("USER")
        .or_else(|_| env::var("USERNAME"))
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn expand_config_file(
    path: &Path,
    depth: usize,
    state: &mut ScanState,
) -> Result<(), SshConfigScannerError> {
    if depth > MAX_INCLUDE_DEPTH || state.file_count >= MAX_CONFIG_FILES {
        return Err(SshConfigScannerError::TooLarge);
    }

    let canonical_path = fs::canonicalize(path).map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => SshConfigScannerError::NotFound,
        _ => SshConfigScannerError::Unavailable,
    })?;
    if !state.active_paths.insert(canonical_path.clone()) {
        state.warnings.push(format!(
            "已忽略循环引用的 Include：{}",
            canonical_path.to_string_lossy()
        ));
        return Ok(());
    }
    state.file_count += 1;

    let bytes = fs::read(&canonical_path).map_err(|_| SshConfigScannerError::Unavailable)?;
    state.total_bytes = state.total_bytes.saturating_add(bytes.len());
    if state.total_bytes > MAX_CONFIG_BYTES {
        return Err(SshConfigScannerError::TooLarge);
    }
    state
        .fingerprint_input
        .extend_from_slice(canonical_path.to_string_lossy().as_bytes());
    state.fingerprint_input.push(0);
    state.fingerprint_input.extend_from_slice(&bytes);
    state.fingerprint_input.push(0);

    let contents = String::from_utf8_lossy(&bytes);
    for (line_index, raw_line) in contents.lines().enumerate() {
        let line_number = line_index + 1;
        let Some((keyword, raw_value)) = split_directive(raw_line) else {
            continue;
        };
        let values = tokenize(&raw_value);
        if keyword.eq_ignore_ascii_case("include") {
            for pattern in values {
                let include_paths = resolve_include_paths(&pattern, state)?;
                if include_paths.is_empty() {
                    state.warnings.push(format!(
                        "{}:{} 的 Include 未匹配到文件：{}",
                        canonical_path.to_string_lossy(),
                        line_number,
                        pattern
                    ));
                }
                for include_path in include_paths {
                    expand_config_file(&include_path, depth + 1, state)?;
                }
            }
            continue;
        }

        state.directives.push(Directive {
            keyword: keyword.to_ascii_lowercase(),
            values,
            source_path: canonical_path.to_string_lossy().into_owned(),
            line_number,
        });
    }

    state.active_paths.remove(&canonical_path);

    Ok(())
}

fn resolve_include_paths(
    value: &str,
    state: &ScanState,
) -> Result<Vec<PathBuf>, SshConfigScannerError> {
    let expanded = expand_home(value, &state.home_dir);
    let pattern = if expanded.is_absolute() {
        expanded
    } else {
        state.ssh_dir.join(expanded)
    };
    let pattern = pattern.to_string_lossy().into_owned();
    let mut paths = glob::glob(&pattern)
        .map_err(|_| SshConfigScannerError::Unavailable)?
        .filter_map(Result::ok)
        .filter(|path| path.is_file())
        .collect::<Vec<_>>();
    paths.sort();
    Ok(paths)
}

fn split_directive(raw_line: &str) -> Option<(String, String)> {
    let line = strip_comment(raw_line).trim();
    if line.is_empty() {
        return None;
    }
    let split_at = line.char_indices().find_map(|(index, character)| {
        (character.is_whitespace() || character == '=').then_some(index)
    });
    let (keyword, remainder) = match split_at {
        Some(index) => (
            &line[..index],
            line[index..].trim_start_matches([' ', '\t', '=']),
        ),
        None => (line, ""),
    };
    (!keyword.is_empty()).then(|| (keyword.to_owned(), remainder.trim().to_owned()))
}

fn strip_comment(line: &str) -> &str {
    let mut quote = None;
    let mut escaped = false;
    for (index, character) in line.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' {
            escaped = true;
            continue;
        }
        if character == '\'' || character == '"' {
            if quote == Some(character) {
                quote = None;
            } else if quote.is_none() {
                quote = Some(character);
            }
        } else if character == '#' && quote.is_none() {
            return &line[..index];
        }
    }
    line
}

fn tokenize(value: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut current = String::new();
    let mut quote = None;
    let mut escaped = false;
    for character in value.chars() {
        if escaped {
            current.push(character);
            escaped = false;
            continue;
        }
        if character == '\\' {
            escaped = true;
            continue;
        }
        if character == '\'' || character == '"' {
            if quote == Some(character) {
                quote = None;
            } else if quote.is_none() {
                quote = Some(character);
            } else {
                current.push(character);
            }
        } else if character.is_whitespace() && quote.is_none() {
            if !current.is_empty() {
                values.push(std::mem::take(&mut current));
            }
        } else {
            current.push(character);
        }
    }
    if escaped {
        current.push('\\');
    }
    if !current.is_empty() {
        values.push(current);
    }
    values
}

fn build_sections(directives: Vec<Directive>, warnings: &mut Vec<String>) -> Vec<HostSection> {
    let mut sections = vec![HostSection {
        patterns: vec!["*".to_owned()],
        directives: Vec::new(),
        source_path: String::new(),
        line_number: 0,
        is_match: false,
    }];
    let mut warned_about_match = false;

    for directive in directives {
        if directive.keyword == "host" {
            sections.push(HostSection {
                patterns: directive.values,
                directives: Vec::new(),
                source_path: directive.source_path,
                line_number: directive.line_number,
                is_match: false,
            });
        } else if directive.keyword == "match" {
            if !warned_about_match {
                warnings.push("Match 条件块暂不参与基础导入，相关配置已跳过。".to_owned());
                warned_about_match = true;
            }
            sections.push(HostSection {
                patterns: Vec::new(),
                directives: Vec::new(),
                source_path: directive.source_path,
                line_number: directive.line_number,
                is_match: true,
            });
        } else if let Some(section) = sections.last_mut() {
            section.directives.push(directive);
        }
    }
    sections
}

fn build_candidates(sections: &[HostSection], home_dir: &Path) -> Vec<ParsedSshConfigCandidate> {
    let mut seen = HashSet::new();
    let mut candidates = Vec::new();
    for section in sections.iter().filter(|section| !section.is_match) {
        for alias in section.patterns.iter().filter(is_literal_alias) {
            let normalized = alias.to_ascii_lowercase();
            if !seen.insert(normalized) {
                continue;
            }
            candidates.push(resolve_candidate(
                alias,
                &section.source_path,
                section.line_number,
                sections,
                home_dir,
            ));
        }
    }
    candidates
}

fn is_literal_alias(pattern: &&String) -> bool {
    !pattern.starts_with('!') && !pattern.contains(['*', '?']) && !pattern.trim().is_empty()
}

fn resolve_candidate(
    alias: &str,
    source_path: &str,
    line_number: usize,
    sections: &[HostSection],
    home_dir: &Path,
) -> ParsedSshConfigCandidate {
    let mut host = None;
    let mut port = None;
    let mut username = None;
    let mut identity_files = Vec::new();
    let mut proxy = None;

    for section in sections.iter().filter(|section| !section.is_match) {
        if !host_patterns_match(&section.patterns, alias) {
            continue;
        }
        for directive in &section.directives {
            let value = directive.values.first().cloned().unwrap_or_default();
            match directive.keyword.as_str() {
                "hostname" if host.is_none() => host = Some(value),
                "port" if port.is_none() => port = Some(value),
                "user" if username.is_none() => username = Some(value),
                "identityfile" if !value.is_empty() && !value.eq_ignore_ascii_case("none") => {
                    identity_files.push(value)
                }
                "proxyjump" | "proxycommand"
                    if proxy.is_none() && !value.eq_ignore_ascii_case("none") =>
                {
                    proxy = Some(directive.keyword.clone())
                }
                _ => {}
            }
        }
    }

    let mut warnings = Vec::new();
    if identity_files.len() > 1 {
        warnings.push("配置了多个 IdentityFile，基础导入仅使用第一项。".to_owned());
    }
    let local_user = local_username();
    let username = username.or(local_user.clone()).unwrap_or_default();
    let host = expand_host_tokens(host.as_deref().unwrap_or(alias), alias);
    let parsed_port = port
        .as_deref()
        .unwrap_or("22")
        .parse::<u32>()
        .ok()
        .filter(|value| (1..=65_535).contains(value));
    let private_key_path = identity_files.first().map(|path| {
        expand_identity_path(path, home_dir, alias, &host, &username)
            .to_string_lossy()
            .into_owned()
    });
    let has_unsupported_identity_token = identity_files
        .first()
        .is_some_and(|path| has_unsupported_identity_token(path));
    if private_key_path
        .as_deref()
        .is_some_and(|path| !Path::new(path).is_file())
    {
        warnings.push("IdentityFile 当前不可访问，导入后需要检查私钥路径。".to_owned());
    }

    let skipped_reason = if let Some(proxy) = proxy {
        Some(format!("使用了 {proxy}，基础导入暂不支持跳板或代理连接。"))
    } else if host.contains('%') {
        Some("HostName 含有暂不支持的动态令牌。".to_owned())
    } else if has_unsupported_identity_token {
        Some("IdentityFile 含有基础导入暂不支持的动态令牌。".to_owned())
    } else if host.trim().is_empty() {
        Some("HostName 为空。".to_owned())
    } else if parsed_port.is_none() {
        Some("Port 无效，必须在 1 到 65535 之间。".to_owned())
    } else if username.is_empty() {
        Some("未配置 User，且无法读取当前系统用户名。".to_owned())
    } else {
        None
    };

    ParsedSshConfigCandidate {
        key: format!("{}:{}:{}", source_path, line_number, alias),
        alias: alias.to_owned(),
        host,
        port: parsed_port.unwrap_or(22),
        username,
        private_key_path,
        source_path: source_path.to_owned(),
        line_number,
        warnings,
        skipped_reason,
    }
}

fn has_unsupported_identity_token(value: &str) -> bool {
    let mut characters = value.chars();
    while let Some(character) = characters.next() {
        if character != '%' {
            continue;
        }
        match characters.next() {
            Some('%' | 'd' | 'u' | 'h' | 'n' | 'r') => {}
            Some(_) | None => return true,
        }
    }
    false
}

fn host_patterns_match(patterns: &[String], alias: &str) -> bool {
    let mut is_positive_match = false;
    for pattern in patterns {
        let (is_negated, pattern) = pattern
            .strip_prefix('!')
            .map_or((false, pattern.as_str()), |value| (true, value));
        if wildcard_match(pattern, alias) {
            if is_negated {
                return false;
            }
            is_positive_match = true;
        }
    }
    is_positive_match
}

fn wildcard_match(pattern: &str, value: &str) -> bool {
    let pattern = pattern.to_ascii_lowercase().into_bytes();
    let value = value.to_ascii_lowercase().into_bytes();
    let (mut pattern_index, mut value_index) = (0, 0);
    let (mut star_index, mut star_value_index) = (None, 0);
    while value_index < value.len() {
        if pattern_index < pattern.len()
            && (pattern[pattern_index] == b'?' || pattern[pattern_index] == value[value_index])
        {
            pattern_index += 1;
            value_index += 1;
        } else if pattern_index < pattern.len() && pattern[pattern_index] == b'*' {
            star_index = Some(pattern_index);
            pattern_index += 1;
            star_value_index = value_index;
        } else if let Some(star) = star_index {
            pattern_index = star + 1;
            star_value_index += 1;
            value_index = star_value_index;
        } else {
            return false;
        }
    }
    while pattern_index < pattern.len() && pattern[pattern_index] == b'*' {
        pattern_index += 1;
    }
    pattern_index == pattern.len()
}

fn expand_host_tokens(value: &str, alias: &str) -> String {
    value
        .replace("%%", "\0")
        .replace("%h", alias)
        .replace("%n", alias)
        .replace('\0', "%")
}

fn expand_identity_path(
    value: &str,
    home_dir: &Path,
    alias: &str,
    host: &str,
    username: &str,
) -> PathBuf {
    let local_user = local_username().unwrap_or_default();
    let expanded = value
        .replace("%%", "\0")
        .replace("%d", &home_dir.to_string_lossy())
        .replace("%u", &local_user)
        .replace("%h", host)
        .replace("%n", alias)
        .replace("%r", username)
        .replace('\0', "%");
    expand_home(&expanded, home_dir)
}

fn expand_home(value: &str, home_dir: &Path) -> PathBuf {
    if value == "~" {
        return home_dir.to_path_buf();
    }
    if let Some(remainder) = value
        .strip_prefix("~/")
        .or_else(|| value.strip_prefix("~\\"))
    {
        return home_dir.join(remainder);
    }
    PathBuf::from(value)
}
