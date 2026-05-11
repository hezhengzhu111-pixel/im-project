-- E2EE (End-to-End Encryption) database migration.
-- Idempotent on MySQL 8.0 via INFORMATION_SCHEMA checks.

USE service_user_service_db;

CREATE TABLE IF NOT EXISTS e2ee_devices (
    user_id                    BIGINT NOT NULL COMMENT 'User ID',
    device_id                  VARCHAR(64) NOT NULL COMMENT 'Device ID',
    status                     VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT 'Device status: active/deleted',
    identity_key               TEXT NOT NULL COMMENT 'ECDH identity public key(Base64)',
    signing_identity_key       TEXT NOT NULL COMMENT 'Signing identity public key(Base64)',
    signed_pre_key             TEXT NOT NULL COMMENT 'Signed pre-key(Base64)',
    signed_pre_key_signature   TEXT NOT NULL COMMENT 'Signed pre-key signature(Base64)',
    last_active_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Last active time',
    created_time               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
    updated_time               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
    PRIMARY KEY (user_id, device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='E2EE device registry';

DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER //
CREATE PROCEDURE add_column_if_missing(
    IN target_table VARCHAR(64),
    IN target_column VARCHAR(64),
    IN column_definition TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = target_table
          AND COLUMN_NAME = target_column
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', target_table, '` ADD COLUMN `', target_column, '` ', column_definition);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END//
DELIMITER ;

CALL add_column_if_missing(
    'e2ee_devices',
    'status',
    'VARCHAR(20) NOT NULL DEFAULT ''active'' COMMENT ''Device status: active/deleted'' AFTER `device_id`'
);
CALL add_column_if_missing(
    'e2ee_devices',
    'signing_identity_key',
    'TEXT NULL COMMENT ''Signing identity public key(Base64)'' AFTER `identity_key`'
);
CALL add_column_if_missing(
    'e2ee_devices',
    'signed_pre_key_signature',
    'TEXT NULL COMMENT ''Signed pre-key signature(Base64)'' AFTER `signed_pre_key`'
);
CALL add_column_if_missing(
    'e2ee_devices',
    'last_active_at',
    'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT ''Last active time'''
);
CALL add_column_if_missing(
    'e2ee_devices',
    'created_time',
    'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT ''Created time'''
);
CALL add_column_if_missing(
    'e2ee_devices',
    'updated_time',
    'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT ''Updated time'''
);
DROP PROCEDURE IF EXISTS add_column_if_missing;

UPDATE e2ee_devices
SET signing_identity_key = identity_key
WHERE (signing_identity_key IS NULL OR signing_identity_key = '')
  AND identity_key IS NOT NULL
  AND identity_key <> '';

-- Legacy rows without a signed-pre-key signature cannot pass X3DH verification.
-- The next client refresh re-uploads the bundle and reactivates the same device_id.
UPDATE e2ee_devices
SET status = 'deleted'
WHERE signed_pre_key_signature IS NULL
   OR signed_pre_key_signature = ''
   OR signing_identity_key IS NULL
   OR signing_identity_key = '';

CREATE TABLE IF NOT EXISTS e2ee_one_time_pre_keys (
    id             BIGINT NOT NULL AUTO_INCREMENT COMMENT 'Auto increment ID',
    user_id        BIGINT NOT NULL COMMENT 'User ID',
    device_id      VARCHAR(64) NOT NULL COMMENT 'Device ID',
    pre_key        TEXT NOT NULL COMMENT 'One-time pre-key(Base64)',
    consumed       TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Consumed flag: 0=no, 1=yes',
    created_time   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
    consumed_time  DATETIME NULL COMMENT 'Consumed time',
    PRIMARY KEY (id),
    KEY idx_otp_user_device_consumed (user_id, device_id, consumed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='E2EE one-time pre-key pool';

CREATE TABLE IF NOT EXISTS e2ee_sessions (
    session_id            VARCHAR(64) NOT NULL COMMENT 'Session ID',
    requester_id          BIGINT NOT NULL COMMENT 'Requester user ID',
    target_user_id        BIGINT NOT NULL COMMENT 'Target user ID',
    status                VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'Negotiation status: pending/encrypted/rejected/plaintext',
    request_payload_json  TEXT NULL COMMENT 'Negotiation request payload JSON',
    created_time          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
    updated_time          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
    PRIMARY KEY (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='E2EE private session negotiation';

CREATE TABLE IF NOT EXISTS e2ee_key_backups (
    user_id                 BIGINT NOT NULL COMMENT 'User ID',
    encrypted_backup_json   TEXT NOT NULL COMMENT 'Encrypted backup JSON',
    salt                    VARCHAR(64) NOT NULL COMMENT 'PBKDF2 salt(Base64)',
    updated_time            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
    PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='E2EE key backup';

CREATE TABLE IF NOT EXISTS e2ee_groups (
    group_id     BIGINT NOT NULL COMMENT 'Group ID',
    status       VARCHAR(20) NOT NULL DEFAULT 'plaintext' COMMENT 'Encryption status: plaintext/encrypted',
    enabled_by   BIGINT NOT NULL COMMENT 'Enabling user ID',
    created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
    updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
    PRIMARY KEY (group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='E2EE group status';

CREATE TABLE IF NOT EXISTS e2ee_sender_keys (
    group_id              BIGINT NOT NULL COMMENT 'Group ID',
    sender_id             BIGINT NOT NULL COMMENT 'Sender user ID',
    device_id             VARCHAR(64) NOT NULL COMMENT 'Sender device ID',
    recipient_id          BIGINT NOT NULL COMMENT 'Recipient user ID',
    encrypted_sender_key  TEXT NOT NULL COMMENT 'Encrypted sender key',
    created_time          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
    updated_time          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
    PRIMARY KEY (group_id, sender_id, device_id, recipient_id),
    KEY idx_e2ee_sender_keys_recipient (recipient_id, device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='E2EE group sender keys';

USE service_message_service_db;

DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER //
CREATE PROCEDURE add_column_if_missing(
    IN target_table VARCHAR(64),
    IN target_column VARCHAR(64),
    IN column_definition TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = target_table
          AND COLUMN_NAME = target_column
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', target_table, '` ADD COLUMN `', target_column, '` ', column_definition);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END//
DELIMITER ;

CALL add_column_if_missing(
    'messages',
    'encrypted',
    'TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''E2EE encrypted flag: 0=no, 1=yes'''
);
CALL add_column_if_missing(
    'messages',
    'e2ee_header',
    'TEXT NULL COMMENT ''E2EE Double Ratchet header JSON'''
);
CALL add_column_if_missing(
    'messages',
    'e2ee_device_id',
    'VARCHAR(64) NULL COMMENT ''E2EE sender device ID'''
);
CALL add_column_if_missing(
    'messages',
    'e2ee_sender_identity_key',
    'TEXT NULL COMMENT ''E2EE sender identity public key'''
);
CALL add_column_if_missing(
    'messages',
    'e2ee_ephemeral_key',
    'TEXT NULL COMMENT ''E2EE sender ephemeral public key'''
);
DROP PROCEDURE IF EXISTS add_column_if_missing;

CREATE TABLE IF NOT EXISTS message_deliveries (
    id          BIGINT NOT NULL AUTO_INCREMENT COMMENT 'Auto increment ID',
    message_id  BIGINT NOT NULL COMMENT 'Message ID',
    device_id   VARCHAR(64) NOT NULL COMMENT 'Target device ID',
    ciphertext  LONGTEXT NOT NULL COMMENT 'Device-specific ciphertext',
    header      JSON NULL COMMENT 'Double Ratchet header',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
    PRIMARY KEY (id),
    INDEX idx_message_device (message_id, device_id),
    INDEX idx_device_messages (device_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='E2EE message deliveries';
