-- E2EE (End-to-End Encryption) Database Migration
-- Date: 2026-05-04

USE service_user_service_db;

-- 用户 E2EE 盐值（恢复码 PBKDF2 专用）
CREATE TABLE IF NOT EXISTS e2ee_user_salts (
    user_id    BIGINT NOT NULL COMMENT '用户ID',
    salt       VARBINARY(32) NOT NULL COMMENT '256位随机盐',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='E2EE用户盐值';

-- 用户公钥 Bundle
CREATE TABLE IF NOT EXISTS prekey_bundles (
    id                       BIGINT NOT NULL AUTO_INCREMENT COMMENT '自增ID',
    user_id                  BIGINT NOT NULL COMMENT '用户ID',
    device_id                VARCHAR(64) NOT NULL COMMENT '设备ID',
    identity_key             VARBINARY(65) NOT NULL COMMENT '身份公钥(ECDH P-256未压缩格式)',
    signed_pre_key           VARBINARY(65) NOT NULL COMMENT '签名预公钥',
    signed_pre_key_signature VARBINARY(64) NOT NULL COMMENT '签名预公钥的ECDSA签名',
    last_active_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最后活跃时间',
    created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_device (user_id, device_id),
    INDEX idx_last_active (last_active_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户公钥Bundle';

-- 一次性预密钥池
CREATE TABLE IF NOT EXISTS one_time_prekeys (
    id         BIGINT NOT NULL AUTO_INCREMENT COMMENT '自增ID',
    user_id    BIGINT NOT NULL COMMENT '用户ID',
    device_id  VARCHAR(64) NOT NULL COMMENT '设备ID',
    public_key VARBINARY(65) NOT NULL COMMENT '一次性预公钥',
    used       TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已使用: 0-否 1-是',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (id),
    INDEX idx_user_device_unused (user_id, device_id, used)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='一次性预密钥池';

-- 恢复码备份
CREATE TABLE IF NOT EXISTS e2ee_key_backups (
    user_id                BIGINT NOT NULL COMMENT '用户ID',
    encrypted_identity_key VARBINARY(256) NOT NULL COMMENT '加密的身份私钥(AES-256-GCM)',
    created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='E2EE恢复码备份';

-- 私聊加密会话状态
CREATE TABLE IF NOT EXISTS e2ee_sessions (
    session_id   VARCHAR(64) NOT NULL COMMENT '会话ID(如 1_2)',
    status       ENUM('plaintext','pending','encrypted') NOT NULL DEFAULT 'plaintext' COMMENT '加密状态',
    requester_id BIGINT NOT NULL COMMENT '发起方用户ID',
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='私聊加密会话状态';

-- 群聊加密状态
CREATE TABLE IF NOT EXISTS e2ee_groups (
    group_id            BIGINT NOT NULL COMMENT '群ID',
    status              ENUM('plaintext','encrypted') NOT NULL DEFAULT 'plaintext' COMMENT '加密状态',
    enabled_by          BIGINT NOT NULL COMMENT '开启者用户ID',
    encrypted_group_key VARBINARY(256) NULL COMMENT '加密的群密钥(管理员备份)',
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='群聊加密状态';

-- Sender Key 存储
CREATE TABLE IF NOT EXISTS e2ee_sender_keys (
    id                    BIGINT NOT NULL AUTO_INCREMENT COMMENT '自增ID',
    group_id              BIGINT NOT NULL COMMENT '群ID',
    sender_id             BIGINT NOT NULL COMMENT '发送者用户ID',
    device_id             VARCHAR(64) NOT NULL COMMENT '发送者设备ID',
    recipient_id          BIGINT NOT NULL COMMENT '接收者用户ID',
    encrypted_sender_key  VARBINARY(256) NOT NULL COMMENT '加密的Sender Key(零知识原则只存密文)',
    counter               INT NOT NULL DEFAULT 0 COMMENT '当前链计数',
    created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_sender_recipient (group_id, sender_id, device_id, recipient_id),
    INDEX idx_group_recipient (group_id, recipient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Sender Key存储';

USE service_message_service_db;

-- messages 表新增字段
ALTER TABLE messages ADD COLUMN encrypted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否E2EE加密: 0-否 1-是';

-- 消息投递表
CREATE TABLE IF NOT EXISTS message_deliveries (
    id          BIGINT NOT NULL AUTO_INCREMENT COMMENT '自增ID',
    message_id  BIGINT NOT NULL COMMENT '消息ID(关联messages.id)',
    device_id   VARCHAR(64) NOT NULL COMMENT '目标设备ID',
    ciphertext  LONGTEXT NOT NULL COMMENT '该设备专属密文',
    header      JSON NULL COMMENT 'Double Ratchet头(ratchet_pubkey/counter/iv)',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (id),
    INDEX idx_message_device (message_id, device_id),
    INDEX idx_device_messages (device_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='消息投递表';
