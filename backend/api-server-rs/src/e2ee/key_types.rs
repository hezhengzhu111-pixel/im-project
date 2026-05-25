use serde::{Deserialize, Serialize};


// ---------------------------------------------------------------------------
// 常量：字段长度上限
// ---------------------------------------------------------------------------

pub(crate) const MAX_DEVICE_ID_LEN: usize = 64;
pub(crate) const MAX_KEY_FIELD_LEN: usize = 1000;
pub(crate) const MAX_ONE_TIME_KEYS: usize = 200;
pub(crate) const MAX_BACKUP_LEN: usize = 100_000;
pub(crate) const MAX_SALT_LEN: usize = 64;

/// X25519 公钥的字节长度（Signal/X3DH 协议标准）。
pub(crate) const X25519_KEY_BYTES: usize = 32;

/// Ed25519 签名的字节长度。
///
/// 当前协议约定使用 Ed25519 对 signed pre-key 进行签名，签名固定为 64 字节。
/// 如果未来支持其他签名算法（如 ECDSA P-256 的 64–72 字节可变长度），
/// 需要将此处替换为范围校验。
pub(crate) const ED25519_SIGNATURE_BYTES: usize = 64;


/// 上传 PreKey Bundle 的请求体。
///
/// 包含设备公钥材料（identity key、signed pre-key、one-time pre-keys），
/// 客户端上传的一次性预密钥条目（含 ID）。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreKeyEntry {
    pub id: i32,
    pub key: String,
}

/// 服务端仅保存公钥/密文材料，不保存任何私钥。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UploadBundleRequest {
    pub device_id: String,
    pub identity_key: String,
    pub signing_identity_key: String,
    pub signed_pre_key: String,
    pub signed_pre_key_signature: String,
    pub one_time_pre_keys: Vec<PreKeyEntry>,
}

/// PreKey Bundle 响应 DTO。
///
/// 返回目标用户的公钥材料，用于发起 E2EE 会话协商。
/// 仅包含公钥/签名数据，不包含任何私钥。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreKeyBundleDto {
    pub user_id: String,
    pub device_id: String,
    pub identity_key: String,
    pub signing_identity_key: String,
    pub signed_pre_key: String,
    pub signed_pre_key_signature: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub one_time_pre_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub one_time_pre_key_id: Option<i32>,
}

/// 设备公开信息 DTO。
///
/// 返回设备的公钥材料和最后活跃时间，供其他用户查询可用设备。
/// 仅包含公钥数据，不包含私钥。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeviceDto {
    pub user_id: String,
    pub device_id: String,
    pub identity_key: String,
    pub signed_pre_key: String,
    pub last_active_at: String,
}

