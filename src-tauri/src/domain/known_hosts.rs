#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KnownHostKey {
    pub host: String,
    pub port: u16,
    pub key_algorithm: String,
    pub fingerprint_sha256: String,
}
