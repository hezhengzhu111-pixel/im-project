-- Admin Audit Log Table
-- Records all admin operations for compliance and security auditing.

CREATE TABLE IF NOT EXISTS service_user_service_db.admin_audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    admin_id BIGINT NOT NULL COMMENT '管理员用户ID',
    admin_username VARCHAR(100) NOT NULL COMMENT '管理员用户名',
    action VARCHAR(100) NOT NULL COMMENT '操作类型 (user:disable, group:dismiss, file:delete, etc.)',
    target_type VARCHAR(50) NOT NULL COMMENT '目标类型 (user, group, file, message, device)',
    target_id VARCHAR(100) COMMENT '目标ID',
    reason TEXT COMMENT '操作原因',
    result VARCHAR(20) NOT NULL DEFAULT 'success' COMMENT '操作结果 (success, failure)',
    ip_address VARCHAR(45) COMMENT '操作者IP地址',
    user_agent TEXT COMMENT '操作者User-Agent',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
    INDEX idx_admin_id (admin_id),
    INDEX idx_action (action),
    INDEX idx_target_type (target_type),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='管理员审计日志表';
