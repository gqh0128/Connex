#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TerminalFontFormat {
    TrueType,
    OpenType,
    Woff,
    Woff2,
}

impl TerminalFontFormat {
    pub fn from_storage(value: &str) -> Option<Self> {
        match value {
            "truetype" => Some(Self::TrueType),
            "opentype" => Some(Self::OpenType),
            "woff" => Some(Self::Woff),
            "woff2" => Some(Self::Woff2),
            _ => None,
        }
    }

    pub fn as_storage(self) -> &'static str {
        match self {
            Self::TrueType => "truetype",
            Self::OpenType => "opentype",
            Self::Woff => "woff",
            Self::Woff2 => "woff2",
        }
    }

    pub fn extension(self) -> &'static str {
        match self {
            Self::TrueType => "ttf",
            Self::OpenType => "otf",
            Self::Woff => "woff",
            Self::Woff2 => "woff2",
        }
    }
}

#[derive(Clone, Debug)]
pub struct TerminalFontFile {
    pub id: String,
    pub display_name: String,
    pub stored_file_name: String,
    pub format: TerminalFontFormat,
    pub byte_length: u64,
    pub created_at: String,
}
