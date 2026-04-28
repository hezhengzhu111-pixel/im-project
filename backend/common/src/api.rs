use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse<T>
where
    T: Serialize,
{
    pub code: i32,
    pub message: String,
    pub data: T,
    pub success: bool,
    pub timestamp: i64,
}

impl<T> ApiResponse<T>
where
    T: Serialize,
{
    pub fn success(data: T) -> Self {
        Self {
            code: 200,
            message: "success".to_string(),
            data,
            success: true,
            timestamp: crate::time::now_ms(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorResponse {
    pub code: i32,
    pub message: String,
    pub success: bool,
    pub timestamp: i64,
}

impl ErrorResponse {
    pub fn new(code: i32, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            success: false,
            timestamp: crate::time::now_ms(),
        }
    }
}
