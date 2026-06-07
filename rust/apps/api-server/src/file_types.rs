use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]

pub(crate) struct FileUploadResponse {
    pub original_filename: String,
    pub filename: String,
    pub url: String,
    pub size: i64,
    pub content_type: String,
    pub category: String,
    pub upload_date: String,
    pub upload_time: i64,
    pub uploader_id: i64,
}

#[derive(Debug, Clone)]
pub(crate) struct KnowledgeFileSaved {
    pub url: String,
    #[allow(dead_code)]
    pub size: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileInfoResponse {
    pub filename: String,
    pub size: i64,
    pub content_type: Option<String>,
    pub last_modified: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileMetadata {
    pub(crate) category: String,
    pub(crate) date: String,
    pub(crate) filename: String,
    pub(crate) original_filename: String,
    pub(crate) uploader_id: Option<i64>,
    pub(crate) size: i64,
    pub(crate) content_type: String,
    pub(crate) created_at: i64,
}

#[derive(Debug, Deserialize)]
pub(crate) struct FileLocator {
    pub(crate) category: String,
    pub(crate) date: String,
    pub(crate) filename: String,
}
