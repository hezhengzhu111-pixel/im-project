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
  created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户设置表';

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
  KEY idx_group_member_user (user_id)
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
  created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_messages_sender_client_message (sender_id, client_message_id),
  KEY idx_messages_sender_time (sender_id, created_time),
  KEY idx_messages_receiver_sender_status (receiver_id, sender_id, status),
  KEY idx_messages_group_time (group_id, created_time),
  KEY idx_messages_reply (reply_to_message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='消息表';

CREATE TABLE IF NOT EXISTS messages_archive (
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

SET FOREIGN_KEY_CHECKS = 1;

