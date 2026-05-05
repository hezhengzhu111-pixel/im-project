-- Moments (朋友圈) Schema Migration
-- Date: 2026-05-02

USE service_message_service_db;

-- 动态表
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

-- 媒体资源表
CREATE TABLE IF NOT EXISTS moments_media (
    id BIGINT PRIMARY KEY,
    post_id BIGINT NOT NULL,
    type TINYINT NOT NULL COMMENT '0=图片, 1=视频',
    url VARCHAR(512) NOT NULL,
    sort_order TINYINT NOT NULL DEFAULT 0,
    INDEX idx_post_id (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 点赞表
CREATE TABLE IF NOT EXISTS moments_like (
    id BIGINT PRIMARY KEY,
    post_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_post_user (post_id, user_id),
    INDEX idx_post_id (post_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 评论表
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

-- 互动通知表
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
