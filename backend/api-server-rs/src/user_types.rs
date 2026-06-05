use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UserSettings {
    pub(crate) privacy: PrivacySettings,
    pub(crate) message: MessageSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PrivacySettings {
    pub(crate) read_receipt: bool,
    pub(crate) online_status: bool,
    pub(crate) stranger_add: bool,
    pub(crate) moments_visible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MessageSettings {
    pub(crate) notification: bool,
    pub(crate) sound: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LoginRequest {
    pub(crate) username: String,
    pub(crate) password: String,
    #[serde(default)]
    pub(crate) remember_me: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RegisterRequest {
    pub(crate) username: String,
    pub(crate) password: String,
    pub(crate) nickname: Option<String>,
    pub(crate) email: Option<String>,
    pub(crate) phone: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateProfileRequest {
    pub(crate) nickname: Option<String>,
    pub(crate) avatar: Option<String>,
    pub(crate) email: Option<String>,
    pub(crate) phone: Option<String>,
    pub(crate) gender: Option<i8>,
    pub(crate) birthday: Option<String>,
    pub(crate) signature: Option<String>,
    pub(crate) location: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChangePasswordRequest {
    pub(crate) current_password: String,
    pub(crate) new_password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodeTargetRequest {
    pub(crate) target: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BindPhoneRequest {
    pub(crate) phone: String,
    pub(crate) code: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BindEmailRequest {
    pub(crate) email: String,
    pub(crate) code: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteAccountRequest {
    pub(crate) password: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct SearchQuery {
    pub(crate) keyword: String,
    #[serde(default = "default_search_type")]
    pub(crate) r#type: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UserDto {
    pub(crate) id: String,
    pub(crate) username: String,
    pub(crate) nickname: String,
    pub(crate) avatar: Option<String>,
    pub(crate) email: Option<String>,
    pub(crate) phone: Option<String>,
    pub(crate) status: String,
    pub(crate) last_login_time: Option<String>,
    pub(crate) create_time: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UserAuthResponse {
    pub(crate) success: bool,
    pub(crate) message: String,
    pub(crate) user: UserDto,
    pub(crate) token: Option<String>,
    pub(crate) refresh_token: Option<String>,
    pub(crate) expires_in_ms: Option<i64>,
    pub(crate) refresh_expires_in_ms: Option<i64>,
    pub(crate) permissions: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpstreamApiResponse<T> {
    pub(crate) code: i32,
    pub(crate) message: String,
    pub(crate) data: Option<T>,
}

pub(crate) struct UserRecord {
    pub(crate) id: i64,
    pub(crate) username: String,
    pub(crate) password: String,
    pub(crate) nickname: Option<String>,
    pub(crate) avatar: Option<String>,
    pub(crate) email: Option<String>,
    pub(crate) phone: Option<String>,
    pub(crate) status: i32,
    pub(crate) last_login_time: Option<chrono::NaiveDateTime>,
    pub(crate) created_time: Option<chrono::NaiveDateTime>,
}

impl UserRecord {
    pub(crate) fn to_dto(&self) -> UserDto {
        UserDto {
            id: self.id.to_string(),
            username: self.username.clone(),
            nickname: self
                .nickname
                .clone()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| self.username.clone()),
            avatar: self.avatar.clone(),
            email: self.email.clone(),
            phone: self.phone.clone(),
            status: "offline".to_string(),
            last_login_time: self.last_login_time.map(|value| value.to_string()),
            create_time: self.created_time.map(|value| value.to_string()),
        }
    }
}

pub(crate) fn default_search_type() -> String {
    "username".to_string()
}

pub(crate) fn default_settings() -> UserSettings {
    UserSettings {
        privacy: PrivacySettings {
            read_receipt: true,
            online_status: true,
            stranger_add: true,
            moments_visible: true,
        },
        message: MessageSettings {
            notification: true,
            sound: true,
        },
    }
}
