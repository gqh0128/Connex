#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RemoteFileKind {
    Directory,
    File,
    Symlink,
    Other,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RemoteFileEntry {
    pub name: String,
    pub path: String,
    pub kind: RemoteFileKind,
    pub size: Option<u64>,
    pub modified_at: Option<u64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RemoteDirectory {
    pub path: String,
    pub entries: Vec<RemoteFileEntry>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RemoteUploadProgress {
    pub transfer_id: String,
    pub transferred_bytes: u64,
    pub total_bytes: u64,
    pub bytes_per_second: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RemoteUploadResult {
    pub remote_path: String,
    pub total_bytes: u64,
}
