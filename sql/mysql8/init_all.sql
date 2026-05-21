SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS service_user_service_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS service_auth_service_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS service_gateway_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS service_group_service_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS service_message_service_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS service_file_service_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS service_im_server_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS service_log_service_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS service_registry_monitor_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

USE service_user_service_db;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT NOT NULL COMMENT '用户ID（雪花ID）',
  username VARCHAR(50) NOT NULL COMMENT '用户名',
  password VARCHAR(255) NOT NULL COMMENT '密码（BCrypt）',
  nickname VARCHAR(100) NULL COMMENT '昵称',
  avatar VARCHAR(500) NULL COMMENT '头像URL',
  phone VARCHAR(20) NULL COMMENT '手机号',
  email VARCHAR(100) NULL COMMENT '邮箱',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1-正常，0-禁用',
  last_login_time DATETIME NULL COMMENT '最后登录时间',
  im_token VARCHAR(500) NULL COMMENT 'IM Token',
  im_server_url VARCHAR(200) NULL COMMENT 'IM服务器地址',
  created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username),
  KEY idx_users_status (status),
  KEY idx_users_last_login (last_login_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户表';

CREATE TABLE IF NOT EXISTS im_friend (
  id BIGINT NOT NULL COMMENT '好友关系ID（雪花ID）',
  user_id BIGINT NOT NULL COMMENT '用户ID',
  friend_id BIGINT NOT NULL COMMENT '好友用户ID',
  remark VARCHAR(100) NULL COMMENT '好友备注',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '关系状态：1-正常，2-删除，3-拉黑',
  created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_friend_user_friend (user_id, friend_id),
  KEY idx_friend_user_status (user_id, status),
  KEY idx_friend_friend (friend_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='好友关系表';

CREATE TABLE IF NOT EXISTS friend_request (
  id BIGINT NOT NULL COMMENT '好友申请ID（雪花ID）',
  applicant_id BIGINT NOT NULL COMMENT '申请人用户ID',
  target_user_id BIGINT NOT NULL COMMENT '被申请人用户ID',
  status INT NOT NULL COMMENT '申请状态：0-待处理，1-已同意，2-已拒绝',
  apply_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '申请时间',
  apply_reason VARCHAR(200) NULL COMMENT '申请理由',
  reject_reason VARCHAR(200) NULL COMMENT '拒绝理由',
  handle_time DATETIME NULL COMMENT '处理时间',
  PRIMARY KEY (id),
  KEY idx_friend_request_target_status (target_user_id, status),
  KEY idx_friend_request_applicant (applicant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='好友申请表';

CREATE TABLE IF NOT EXISTS user_settings (
  user_id BIGINT NOT NULL COMMENT '用户ID',
  privacy_settings JSON NULL COMMENT '隐私设置',
  message_settings JSON NULL COMMENT '消息设置',
  general_settings JSON NULL COMMENT '通用设置',
  push_settings JSON NULL COMMENT '推送设置',
  created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户设置表';

CREATE TABLE IF NOT EXISTS user_push_devices (
  user_id BIGINT NOT NULL COMMENT '用户ID',
  device_id VARCHAR(128) NOT NULL COMMENT '设备ID',
  platform VARCHAR(16) NOT NULL COMMENT '平台：ANDROID/IOS',
  fcm_token VARCHAR(2048) NOT NULL COMMENT 'FCM 设备令牌',
  app_version VARCHAR(64) NULL COMMENT 'App 版本',
  device_model VARCHAR(128) NULL COMMENT '设备型号',
  os_version VARCHAR(64) NULL COMMENT '系统版本',
  locale VARCHAR(32) NULL COMMENT '语言区域',
  timezone VARCHAR(64) NULL COMMENT '时区',
  token_version BIGINT NOT NULL DEFAULT 1 COMMENT 'Token 版本',
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最后活跃时间',
  last_token_refresh_at DATETIME NULL COMMENT '最后 token 刷新时间',
  disabled_at DATETIME NULL COMMENT '注销时间',
  unregister_reason VARCHAR(32) NULL COMMENT '注销原因',
  created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (user_id, device_id),
  KEY idx_user_push_devices_active (user_id, disabled_at, updated_time),
  KEY idx_user_push_devices_token (fcm_token(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户推送设备表';

CREATE TABLE IF NOT EXISTS user_ai_api_keys (
  id BIGINT NOT NULL COMMENT 'API Key ID',
  user_id BIGINT NOT NULL COMMENT '用户ID',
  provider VARCHAR(32) NOT NULL COMMENT '模型提供商：deepseek/minimax',
  encrypted_api_key VARCHAR(512) NOT NULL COMMENT 'AES-256-GCM 加密的 API Key',
  key_name VARCHAR(128) DEFAULT '' COMMENT '用户自定义标签',
  is_active TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用：1-启用，0-禁用',
  last_validated_at BIGINT DEFAULT NULL COMMENT '最后验证时间（epoch ms）',
  validate_status VARCHAR(32) DEFAULT '' COMMENT '验证状态：ok/invalid/insufficient/error',
  created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_user_ai_keys_user_provider (user_id, provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户 AI API Key 表';

CREATE TABLE IF NOT EXISTS user_ai_settings (
  user_id BIGINT NOT NULL COMMENT '用户ID',
  auto_reply_enabled TINYINT NOT NULL DEFAULT 0 COMMENT '自动回复开关：1-开启，0-关闭',
  auto_reply_persona TEXT NULL COMMENT 'AI 回复人设 Prompt',
  created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户 AI 设置表';

CREATE TABLE IF NOT EXISTS user_knowledge_docs (
  id BIGINT NOT NULL COMMENT '文档ID',
  user_id BIGINT NOT NULL COMMENT '上传用户ID',
  group_id BIGINT DEFAULT NULL COMMENT '群组ID（NULL=个人知识库）',
  file_name VARCHAR(256) NOT NULL COMMENT '原始文件名',
  file_type VARCHAR(32) NOT NULL COMMENT '文件类型：pdf/docx/txt',
  file_size BIGINT NOT NULL COMMENT '文件大小（字节）',
  oss_url VARCHAR(512) NOT NULL COMMENT 'OSS 存储地址',
  chunk_count INT DEFAULT 0 COMMENT '切片数量',
  parse_status VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT '解析状态：pending/parsing/done/failed',
  created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_knowledge_docs_user (user_id),
  KEY idx_knowledge_docs_group (group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户知识库文档表';

-- E2EE 设备注册表
CREATE TABLE IF NOT EXISTS e2ee_devices (
  user_id               BIGINT NOT NULL COMMENT '用户ID',
  device_id             VARCHAR(64) NOT NULL COMMENT '设备ID',
  status                VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT '设备状态: active/deleted',
  identity_key          TEXT NOT NULL COMMENT '身份公钥(Base64)',
  signing_identity_key  TEXT NOT NULL COMMENT 'E2EE signing identity public key(Base64)',
  signed_pre_key        TEXT NOT NULL COMMENT '签名预公钥(Base64)',
  signed_pre_key_signature TEXT NOT NULL COMMENT '签名预公钥签名(Base64)',
  identity_public_key   TEXT NULL COMMENT 'E2EE identity public key',
  fingerprint           VARCHAR(64) NULL COMMENT 'public key fingerprint',
  key_version           INT NOT NULL DEFAULT 1 COMMENT 'device key version',
  revoked_at            DATETIME NULL COMMENT 'device revoke time',
  last_seen_at          DATETIME NULL COMMENT 'last seen time',
  last_active_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最后活跃时间',
  created_time          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_time          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (user_id, device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='E2EE设备注册表';

-- E2EE 一次性预密钥池
CREATE TABLE IF NOT EXISTS e2ee_one_time_pre_keys (
  id           BIGINT NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  user_id      BIGINT NOT NULL COMMENT '用户ID',
  device_id    VARCHAR(64) NOT NULL COMMENT '设备ID',
  pre_key_id   BIGINT NULL COMMENT 'client pre-key id',
  pre_key      TEXT NOT NULL COMMENT '一次性预公钥(Base64)',
  public_key   TEXT NULL COMMENT 'one-time public key',
  consumed     TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已消费: 0-否 1-是',
  claimed_at   DATETIME NULL COMMENT 'claim time',
  claimed_by_user_id BIGINT NULL COMMENT 'claimant user',
  claimed_by_device_id VARCHAR(64) NULL COMMENT 'claimant device',
  created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  consumed_time DATETIME NULL COMMENT '消费时间',
  PRIMARY KEY (id),
  KEY idx_otp_user_device_consumed (user_id, device_id, consumed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='E2EE一次性预密钥池';

-- E2EE 一次性预密钥 claim 幂等表
-- 保证同一 (requester, target, conversation) 组合只消费一个 one-time pre-key，
-- 并发重复请求返回同一个 pre-key 结果。
CREATE TABLE IF NOT EXISTS e2ee_pre_key_claims (
  id                      BIGINT NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  requester_user_id       BIGINT NOT NULL COMMENT 'Claim 方用户ID',
  requester_device_id     VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'Claim 方设备ID（空字符串表示未提供）',
  target_user_id          BIGINT NOT NULL COMMENT '目标用户ID',
  target_device_id        VARCHAR(64) NOT NULL COMMENT '目标设备ID',
  conversation_id         VARCHAR(128) NOT NULL COMMENT '会话ID（p_1_2 或 g_123）',
  one_time_pre_key_row_id BIGINT NULL COMMENT '被消费的 e2ee_one_time_pre_keys.id',
  one_time_pre_key_id     INT NULL COMMENT '客户端 pre-key ID',
  one_time_pre_key        TEXT NULL COMMENT 'One-time pre-key 公钥（Base64）',
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Claim 时间',
  PRIMARY KEY (id),
  UNIQUE KEY uniq_e2ee_prekey_claim (requester_user_id, requester_device_id, target_user_id, target_device_id, conversation_id),
  KEY idx_e2ee_prekey_claim_target (target_user_id, target_device_id, conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='E2EE 一次性预密钥 claim 幂等表';

-- E2EE 私聊加密会话协商表
CREATE TABLE IF NOT EXISTS e2ee_sessions (
  session_id            VARCHAR(64) NOT NULL COMMENT '会话ID',
  requester_id          BIGINT NOT NULL COMMENT '发起方用户ID',
  target_user_id        BIGINT NOT NULL COMMENT '目标用户ID',
  status                VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT '协商状态: pending/encrypted/rejected/plaintext',
  request_payload_json  TEXT NULL COMMENT '协商请求载荷JSON',
  state_version         INT NOT NULL DEFAULT 1 COMMENT '单调状态版本号，用于冲突检测',
  disabled_by           BIGINT NULL COMMENT '禁用方用户ID',
  disabled_at           DATETIME NULL COMMENT '禁用时间',
  created_time          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_time          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (session_id),
  KEY idx_e2ee_sessions_state_version (session_id, state_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='E2EE私聊加密会话协商表';



CREATE TABLE IF NOT EXISTS e2ee_conversation_sessions (
  conversation_id VARCHAR(128) NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  key_id VARCHAR(64) NOT NULL,
  key_version INT NOT NULL DEFAULT 1,
  epoch INT NOT NULL DEFAULT 1,
  created_by_user_id BIGINT NOT NULL,
  sender_device_id VARCHAR(64) NOT NULL,
  recipient_device_ids_json TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  needs_rotation TINYINT(1) NOT NULL DEFAULT 0,
  rotate_reason VARCHAR(32) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id),
  UNIQUE KEY uk_e2ee_conversation_session_id (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='E2EE active conversation session metadata';

CREATE TABLE IF NOT EXISTS e2ee_conversation_session_members (
  id BIGINT NOT NULL AUTO_INCREMENT,
  conversation_id VARCHAR(128) NOT NULL,
  user_id BIGINT NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  key_version INT NOT NULL,
  epoch INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_e2ee_session_member (conversation_id, user_id, device_id, epoch)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='E2EE session recipient metadata';

CREATE TABLE IF NOT EXISTS e2ee_group_epochs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  group_id BIGINT NOT NULL,
  epoch INT NOT NULL,
  key_version INT NOT NULL,
  rotate_reason VARCHAR(32) NOT NULL,
  created_by_user_id BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_e2ee_group_epoch (group_id, epoch)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='E2EE group epoch history';

-- E2EE 密钥备份表
CREATE TABLE IF NOT EXISTS e2ee_key_backups (
  user_id              BIGINT NOT NULL COMMENT '用户ID',
  encrypted_backup_json TEXT NOT NULL COMMENT '加密的备份数据JSON',
  salt                 VARCHAR(64) NOT NULL COMMENT 'PBKDF2盐值(Base64)',
  updated_time         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='E2EE密钥备份表';

-- E2EE group status
CREATE TABLE IF NOT EXISTS e2ee_groups (
  group_id     BIGINT NOT NULL COMMENT 'Group ID',
  status       VARCHAR(20) NOT NULL DEFAULT 'plaintext' COMMENT 'Encryption status: plaintext/encrypted',
  enabled_by   BIGINT NOT NULL COMMENT 'Enabling user ID',
  created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  PRIMARY KEY (group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='E2EE group status';

-- E2EE group sender keys
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

USE service_group_service_db;

CREATE TABLE IF NOT EXISTS im_group (
  id BIGINT NOT NULL COMMENT '群组ID（雪花ID）',
  name VARCHAR(100) NOT NULL COMMENT '群名称',
  avatar VARCHAR(500) NULL COMMENT '群头像URL',
  announcement TEXT NULL COMMENT '群公告',
  owner_id BIGINT NOT NULL COMMENT '群主用户ID',
  type INT NOT NULL DEFAULT 1 COMMENT '群类型：1-普通群，2-公开群',
  max_members INT NOT NULL DEFAULT 500 COMMENT '最大成员数',
  member_count INT NOT NULL DEFAULT 1 COMMENT '当前成员数',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '群状态：1-正常，0-解散',
  created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_group_owner (owner_id),
  KEY idx_group_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='群组表';

CREATE TABLE IF NOT EXISTS im_group_member (
  id BIGINT NOT NULL COMMENT '群成员关系ID（雪花ID）',
  group_id BIGINT NOT NULL COMMENT '群组ID',
  user_id BIGINT NOT NULL COMMENT '用户ID',
  nickname VARCHAR(100) NULL COMMENT '群内昵称',
  role INT NOT NULL DEFAULT 1 COMMENT '成员角色：1-成员，2-管理员，3-群主',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '成员状态：1-正常，0-退出',
  join_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
  created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_group_member_group_user (group_id, user_id),
  KEY idx_group_member_group (group_id),
  KEY idx_group_member_user (user_id),
  KEY idx_group_member_user_status_group (user_id, status, group_id) COMMENT '用户群会话列表查询：WHERE user_id=? AND status=1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='群成员表';

USE service_message_service_db;

CREATE TABLE IF NOT EXISTS accepted_message (
  id BIGINT NOT NULL COMMENT 'accepted message id',
  sender_id BIGINT NOT NULL COMMENT 'sender user id',
  client_message_id VARCHAR(64) NOT NULL COMMENT 'client idempotency message id',
  conversation_id VARCHAR(64) NOT NULL COMMENT 'conversation id',
  ack_stage VARCHAR(32) NOT NULL DEFAULT 'ACCEPTED' COMMENT 'ack stage: ACCEPTED/PERSISTED',
  payload_json LONGTEXT NOT NULL COMMENT 'accepted message snapshot json',
  created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (id),
  UNIQUE KEY uk_accepted_message_sender_client_message (sender_id, client_message_id),
  KEY idx_accepted_message_sender_time (sender_id, created_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='accepted message idempotency table';

CREATE TABLE IF NOT EXISTS message_outbox (
  id BIGINT NOT NULL COMMENT 'outbox id, aligned with message id',
  sender_id BIGINT NOT NULL COMMENT 'sender user id',
  client_message_id VARCHAR(64) NOT NULL COMMENT 'client idempotency message id',
  conversation_id VARCHAR(64) NOT NULL COMMENT 'conversation id',
  topic VARCHAR(100) NOT NULL COMMENT 'kafka topic',
  routing_key VARCHAR(128) NOT NULL COMMENT 'kafka routing key',
  event_json LONGTEXT NOT NULL COMMENT 'serialized message event json',
  dispatch_status VARCHAR(32) NOT NULL DEFAULT 'PENDING' COMMENT 'dispatch stage: PENDING/RETRY/DISPATCHED/PERSISTED',
  attempt_count INT NOT NULL DEFAULT 0 COMMENT 'dispatch attempt count',
  next_attempt_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'next dispatch attempt time',
  last_error VARCHAR(512) NULL COMMENT 'last dispatch error summary',
  dispatched_time DATETIME NULL COMMENT 'last successful kafka dispatch time',
  created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (id),
  UNIQUE KEY uk_message_outbox_sender_client_message (sender_id, client_message_id),
  KEY idx_message_outbox_dispatch_status_time (dispatch_status, next_attempt_time),
  KEY idx_message_outbox_conversation_time (conversation_id, created_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='message durable outbox table';

CREATE TABLE IF NOT EXISTS message_state_outbox (
  id BIGINT NOT NULL COMMENT 'state outbox id',
  idempotency_key VARCHAR(160) NOT NULL COMMENT 'semantic idempotency key',
  event_type VARCHAR(32) NOT NULL COMMENT 'state event type: READ/STATUS_CHANGE',
  topic VARCHAR(100) NOT NULL COMMENT 'kafka topic',
  routing_key VARCHAR(128) NOT NULL COMMENT 'kafka routing key',
  payload_json LONGTEXT NOT NULL COMMENT 'serialized state event payload',
  dispatch_status VARCHAR(32) NOT NULL DEFAULT 'PENDING' COMMENT 'dispatch stage: PENDING/DISPATCHING/RETRY/DISPATCHED',
  attempt_count INT NOT NULL DEFAULT 0 COMMENT 'dispatch attempt count',
  next_attempt_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'next dispatch attempt time',
  last_error VARCHAR(512) NULL COMMENT 'last dispatch error summary',
  dispatched_time DATETIME NULL COMMENT 'last successful kafka dispatch time',
  created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (id),
  UNIQUE KEY uk_message_state_outbox_idempotency (idempotency_key),
  KEY idx_message_state_outbox_dispatch_status_time (dispatch_status, next_attempt_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='durable outbox for read and status state events';

CREATE TABLE IF NOT EXISTS messages (
  conversation_seq BIGINT NULL COMMENT 'group conversation sequence',
  id BIGINT NOT NULL COMMENT '消息ID（雪花ID）',
  sender_id BIGINT NOT NULL COMMENT '发送者用户ID',
  receiver_id BIGINT NULL COMMENT '接收者用户ID（私聊）',
  group_id BIGINT NULL COMMENT '群组ID（群聊）',
  client_message_id VARCHAR(64) NULL COMMENT '客户端幂等消息ID',
  message_type INT NOT NULL COMMENT '消息类型编码（见 MessageType.code）',
  content TEXT NULL COMMENT '消息内容',
  media_url VARCHAR(500) NULL COMMENT '媒体文件URL',
  media_size BIGINT NULL COMMENT '媒体文件大小（字节）',
  media_name VARCHAR(255) NULL COMMENT '媒体文件名',
  thumbnail_url VARCHAR(500) NULL COMMENT '缩略图URL',
  duration INT NULL COMMENT '音视频时长（秒）',
  location_info TEXT NULL COMMENT '位置信息（JSON/文本）',
  encrypted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否E2EE加密',
  e2ee_header TEXT NULL COMMENT 'E2EE Double Ratchet header JSON',
  e2ee_device_id VARCHAR(64) NULL COMMENT 'E2EE sender device ID',
  e2ee_sender_identity_key TEXT NULL COMMENT 'E2EE sender identity public key',
  e2ee_ephemeral_key TEXT NULL COMMENT 'E2EE sender ephemeral public key',
  e2ee_envelope_json JSON NULL COMMENT 'Unified E2EE envelope JSON',
  status INT NOT NULL COMMENT '消息状态：1-已发送，2-已送达，3-已读，4-撤回，5-删除',
  is_group_chat TINYINT NOT NULL DEFAULT 0 COMMENT '是否群聊：1-是，0-否',
  reply_to_message_id BIGINT NULL COMMENT '回复的消息ID',
  created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_messages_sender_client_message (sender_id, client_message_id),
  KEY idx_messages_sender_time (sender_id, created_time),
  KEY idx_messages_receiver_sender_status (receiver_id, sender_id, status),
  KEY idx_messages_group_time (group_id, created_time),
  KEY idx_messages_group_seq (group_id, conversation_seq),
  KEY idx_messages_reply (reply_to_message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='消息表';

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

CREATE TABLE IF NOT EXISTS messages_archive (
  conversation_seq BIGINT NULL COMMENT 'group conversation sequence',
  id BIGINT NOT NULL COMMENT '消息ID（雪花ID）',
  sender_id BIGINT NOT NULL COMMENT '发送者用户ID',
  receiver_id BIGINT NULL COMMENT '接收者用户ID（私聊）',
  group_id BIGINT NULL COMMENT '群组ID（群聊）',
  client_message_id VARCHAR(64) NULL COMMENT '客户端幂等消息ID',
  message_type INT NOT NULL COMMENT '消息类型编码（见 MessageType.code）',
  content TEXT NULL COMMENT '消息内容',
  media_url VARCHAR(500) NULL COMMENT '媒体文件URL',
  media_size BIGINT NULL COMMENT '媒体文件大小（字节）',
  media_name VARCHAR(255) NULL COMMENT '媒体文件名',
  thumbnail_url VARCHAR(500) NULL COMMENT '缩略图URL',
  duration INT NULL COMMENT '音视频时长（秒）',
  location_info TEXT NULL COMMENT '位置信息（JSON/文本）',
  status INT NOT NULL COMMENT '消息状态：1-已发送，2-已送达，3-已读，4-撤回，5-删除',
  is_group_chat TINYINT NOT NULL DEFAULT 0 COMMENT '是否群聊：1-是，0-否',
  reply_to_message_id BIGINT NULL COMMENT '回复的消息ID',
  created_time DATETIME NOT NULL COMMENT '创建时间',
  updated_time DATETIME NOT NULL COMMENT '更新时间',
  archived_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '归档时间',
  PRIMARY KEY (id),
  KEY idx_messages_archive_sender_time (sender_id, created_time),
  KEY idx_messages_archive_receiver_sender_status (receiver_id, sender_id, status),
  KEY idx_messages_archive_group_time (group_id, created_time),
  KEY idx_messages_archive_group_seq (group_id, conversation_seq),
  KEY idx_messages_archive_reply (reply_to_message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='消息归档表（90天之前）';

CREATE TABLE IF NOT EXISTS message_read_status (
  id BIGINT NOT NULL COMMENT '已读记录ID（雪花ID）',
  message_id BIGINT NOT NULL COMMENT '消息ID',
  user_id BIGINT NOT NULL COMMENT '用户ID',
  read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '已读时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_message_read_message_user (message_id, user_id),
  KEY idx_message_read_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='消息已读状态表';

CREATE TABLE IF NOT EXISTS pending_status_event (
  id BIGINT NOT NULL COMMENT 'pending status event id',
  message_id BIGINT NOT NULL COMMENT 'message id waiting for replay',
  new_status INT NOT NULL COMMENT 'target status waiting for replay',
  changed_at DATETIME NOT NULL COMMENT 'status change logical time',
  payload_json LONGTEXT NOT NULL COMMENT 'serialized status change event payload',
  created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (id),
  UNIQUE KEY uk_pending_status_event_message_status (message_id, new_status),
  KEY idx_pending_status_event_message_changed (message_id, changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='durable backlog for out-of-order status events';

CREATE TABLE IF NOT EXISTS group_read_cursor (
  last_read_seq BIGINT NOT NULL DEFAULT 0 COMMENT 'last read group conversation sequence',
  last_read_message_id BIGINT NULL COMMENT 'last read message id',
  id BIGINT NOT NULL COMMENT '游标ID（雪花ID）',
  group_id BIGINT NOT NULL COMMENT '群组ID',
  user_id BIGINT NOT NULL COMMENT '用户ID',
  last_read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最后已读时间',
  created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_group_cursor_group_user (group_id, user_id),
  KEY idx_group_cursor_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='群聊阅读游标表';


CREATE TABLE IF NOT EXISTS private_read_cursor (
  id BIGINT NOT NULL COMMENT 'private read cursor id',
  user_id BIGINT NOT NULL COMMENT 'current user id',
  peer_user_id BIGINT NOT NULL COMMENT 'private conversation peer user id',
  last_read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'last read time',
  created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (id),
  UNIQUE KEY uk_private_cursor_user_peer (user_id, peer_user_id),
  KEY idx_private_cursor_peer (peer_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='private read cursor';

-- Moments (朋友圈)
CREATE TABLE IF NOT EXISTS moments_post (
    id BIGINT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    content TEXT,
    visibility TINYINT NOT NULL DEFAULT 0 COMMENT '0=公开, 1=好友可见, 2=仅自己可见',
    link_url VARCHAR(512),
    link_title VARCHAR(256),
    link_cover VARCHAR(512),
    location VARCHAR(255),
    status TINYINT NOT NULL DEFAULT 0 COMMENT '0=正常, 1=已删除',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id_created (user_id, created_at DESC),
    INDEX idx_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS moments_media (
    id BIGINT PRIMARY KEY,
    post_id BIGINT NOT NULL,
    type TINYINT NOT NULL COMMENT '0=图片, 1=视频',
    url VARCHAR(512) NOT NULL,
    sort_order TINYINT NOT NULL DEFAULT 0,
    INDEX idx_post_id (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS moments_like (
    id BIGINT PRIMARY KEY,
    post_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_post_user (post_id, user_id),
    INDEX idx_post_id (post_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS moments_comment (
    id BIGINT PRIMARY KEY,
    post_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    parent_id BIGINT COMMENT 'NULL=顶级评论',
    content TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_post_id_created (post_id, created_at),
    INDEX idx_parent_id (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS moments_notification (
    id BIGINT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    actor_id BIGINT NOT NULL,
    notification_type VARCHAR(20) NOT NULL COMMENT 'like/comment',
    post_id BIGINT NOT NULL,
    comment_id BIGINT,
    is_read TINYINT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id_created (user_id, created_at DESC),
    INDEX idx_user_id_read (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET FOREIGN_KEY_CHECKS = 1;

