CREATE TABLE IF NOT EXISTS group_read_cursor (
  id BIGINT PRIMARY KEY,
  group_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  last_read_at DATETIME NOT NULL,
  created_time DATETIME NOT NULL,
  updated_time DATETIME NOT NULL,
  UNIQUE KEY uk_group_user (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS message_outbox (
  id BIGINT PRIMARY KEY,
  topic VARCHAR(255) NOT NULL,
  message_key VARCHAR(255),
  payload TEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  attempts INT NOT NULL,
  next_retry_at DATETIME NOT NULL,
  last_error TEXT,
  related_message_id BIGINT,
  created_time DATETIME NOT NULL,
  updated_time DATETIME NOT NULL,
  KEY idx_outbox_status_retry (status, next_retry_at),
  KEY idx_outbox_related_topic (related_message_id, topic)
);

COMMENT ON TABLE group_read_cursor IS '群聊阅读游标表';
COMMENT ON COLUMN group_read_cursor.id IS '游标ID（雪花ID）';
COMMENT ON COLUMN group_read_cursor.group_id IS '群组ID';
COMMENT ON COLUMN group_read_cursor.user_id IS '用户ID';
COMMENT ON COLUMN group_read_cursor.last_read_at IS '最后已读时间';
COMMENT ON COLUMN group_read_cursor.created_time IS '创建时间';
COMMENT ON COLUMN group_read_cursor.updated_time IS '更新时间';

COMMENT ON TABLE message_outbox IS '消息发件箱(outbox)事件表';
COMMENT ON COLUMN message_outbox.id IS '事件ID（雪花ID）';
COMMENT ON COLUMN message_outbox.topic IS 'Kafka Topic';
COMMENT ON COLUMN message_outbox.message_key IS 'Kafka Key';
COMMENT ON COLUMN message_outbox.payload IS '事件载荷（JSON）';
COMMENT ON COLUMN message_outbox.status IS '发送状态（PENDING/FAILED/SENT 等）';
COMMENT ON COLUMN message_outbox.attempts IS '已尝试次数';
COMMENT ON COLUMN message_outbox.next_retry_at IS '下次重试时间';
COMMENT ON COLUMN message_outbox.last_error IS '最后一次错误信息';
COMMENT ON COLUMN message_outbox.related_message_id IS '关联的消息ID';
COMMENT ON COLUMN message_outbox.created_time IS '创建时间';
COMMENT ON COLUMN message_outbox.updated_time IS '更新时间';

