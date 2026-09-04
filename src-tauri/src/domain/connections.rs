#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AuthenticationMethod {
    Password,
    PrivateKey,
    Agent,
}

impl AuthenticationMethod {
    pub fn as_storage_value(self) -> &'static str {
        match self {
            Self::Password => "password",
            Self::PrivateKey => "private_key",
            Self::Agent => "agent",
        }
    }

    pub fn from_storage_value(value: &str) -> Option<Self> {
        match value {
            "password" => Some(Self::Password),
            "private_key" => Some(Self::PrivateKey),
            "agent" => Some(Self::Agent),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ConnectionOrigin {
    Manual,
    SshConfig,
}

impl ConnectionOrigin {
    pub fn as_storage_value(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::SshConfig => "ssh_config",
        }
    }

    pub fn from_storage_value(value: &str) -> Option<Self> {
        match value {
            "manual" => Some(Self::Manual),
            "ssh_config" => Some(Self::SshConfig),
            _ => None,
        }
    }
}

#[derive(Clone, Debug)]
pub struct ConnectionProfile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub authentication_method: AuthenticationMethod,
    pub private_key_path: Option<String>,
    pub has_stored_credential: bool,
    pub created_at: String,
    pub updated_at: String,
    pub last_connected_at: Option<String>,
    pub origin: ConnectionOrigin,
}

#[derive(Clone, Debug)]
pub struct ConnectionDraft {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub authentication_method: AuthenticationMethod,
    pub private_key_path: Option<String>,
}

impl ConnectionDraft {
    pub fn new(
        name: String,
        host: String,
        port: u32,
        username: String,
        authentication_method: AuthenticationMethod,
        private_key_path: Option<String>,
    ) -> Result<Self, ConnectionValidationError> {
        let name = normalize_required("name", name, 80)?;
        let host = normalize_required("host", host, 255)?;
        let username = normalize_required("username", username, 128)?;
        let port =
            u16::try_from(port)
                .ok()
                .filter(|port| *port > 0)
                .ok_or(ConnectionValidationError {
                    field: "port",
                    message: "端口必须在 1 到 65535 之间。",
                })?;

        let private_key_path = private_key_path
            .map(|path| path.trim().to_owned())
            .filter(|path| !path.is_empty());
        let private_key_path = match authentication_method {
            AuthenticationMethod::PrivateKey => {
                Some(private_key_path.ok_or(ConnectionValidationError {
                    field: "privateKeyPath",
                    message: "使用私钥认证时必须选择私钥文件。",
                })?)
            }
            AuthenticationMethod::Password | AuthenticationMethod::Agent => None,
        };

        Ok(Self {
            name,
            host,
            port,
            username,
            authentication_method,
            private_key_path,
        })
    }
}

#[derive(Debug)]
pub struct ConnectionValidationError {
    pub field: &'static str,
    pub message: &'static str,
}

fn normalize_required(
    field: &'static str,
    value: String,
    max_chars: usize,
) -> Result<String, ConnectionValidationError> {
    let value = value.trim().to_owned();

    if value.is_empty() {
        return Err(ConnectionValidationError {
            field,
            message: "此字段不能为空。",
        });
    }

    if value.chars().count() > max_chars {
        return Err(ConnectionValidationError {
            field,
            message: "输入内容过长。",
        });
    }

    Ok(value)
}
