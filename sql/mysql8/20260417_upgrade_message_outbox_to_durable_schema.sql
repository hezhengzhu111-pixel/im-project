USE service_message_service_db;

SET @message_outbox_table_schema = DATABASE();

SET @sql = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @message_outbox_table_schema
              AND table_name = 'message_outbox'
              AND column_name = 'sender_id'
        ),
        'SELECT 1',
        'ALTER TABLE message_outbox ADD COLUMN sender_id BIGINT NULL COMMENT ''sender user id'' AFTER id'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @message_outbox_table_schema
              AND table_name = 'message_outbox'
              AND column_name = 'client_message_id'
        ),
        'SELECT 1',
        'ALTER TABLE message_outbox ADD COLUMN client_message_id VARCHAR(64) NULL COMMENT ''client idempotency message id'' AFTER sender_id'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @message_outbox_table_schema
              AND table_name = 'message_outbox'
              AND column_name = 'conversation_id'
        ),
        'SELECT 1',
        'ALTER TABLE message_outbox ADD COLUMN conversation_id VARCHAR(64) NULL COMMENT ''conversation id'' AFTER client_message_id'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @message_outbox_table_schema
              AND table_name = 'message_outbox'
              AND column_name = 'routing_key'
        ),
        'SELECT 1',
        'ALTER TABLE message_outbox ADD COLUMN routing_key VARCHAR(128) NULL COMMENT ''kafka routing key'' AFTER topic'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @message_outbox_table_schema
              AND table_name = 'message_outbox'
              AND column_name = 'event_json'
        ),
        'SELECT 1',
        'ALTER TABLE message_outbox ADD COLUMN event_json LONGTEXT NULL COMMENT ''serialized message event json'' AFTER routing_key'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @message_outbox_table_schema
              AND table_name = 'message_outbox'
              AND column_name = 'dispatch_status'
        ),
        'SELECT 1',
        'ALTER TABLE message_outbox ADD COLUMN dispatch_status VARCHAR(32) NOT NULL DEFAULT ''PENDING'' COMMENT ''dispatch stage: PENDING/RETRY/DISPATCHED/PERSISTED'' AFTER event_json'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @message_outbox_table_schema
              AND table_name = 'message_outbox'
              AND column_name = 'attempt_count'
        ),
        'SELECT 1',
        'ALTER TABLE message_outbox ADD COLUMN attempt_count INT NOT NULL DEFAULT 0 COMMENT ''dispatch attempt count'' AFTER dispatch_status'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @message_outbox_table_schema
              AND table_name = 'message_outbox'
              AND column_name = 'next_attempt_time'
        ),
        'SELECT 1',
        'ALTER TABLE message_outbox ADD COLUMN next_attempt_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT ''next dispatch attempt time'' AFTER attempt_count'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @message_outbox_table_schema
              AND table_name = 'message_outbox'
              AND column_name = 'dispatched_time'
        ),
        'SELECT 1',
        'ALTER TABLE message_outbox ADD COLUMN dispatched_time DATETIME NULL COMMENT ''last successful kafka dispatch time'' AFTER last_error'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @message_outbox_table_schema
              AND table_name = 'message_outbox'
              AND column_name = 'payload'
        ),
        'ALTER TABLE message_outbox MODIFY COLUMN payload TEXT NULL COMMENT ''legacy payload json''',
        'SELECT 1'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @message_outbox_table_schema
              AND table_name = 'message_outbox'
              AND column_name = 'event_type'
        ),
        'ALTER TABLE message_outbox MODIFY COLUMN event_type VARCHAR(64) NULL COMMENT ''legacy event type''',
        'SELECT 1'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @message_outbox_table_schema
              AND table_name = 'message_outbox'
              AND column_name = 'targets_json'
        ),
        'ALTER TABLE message_outbox MODIFY COLUMN targets_json JSON NULL COMMENT ''legacy targets json''',
        'SELECT 1'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @message_outbox_table_schema
              AND table_name = 'message_outbox'
              AND column_name = 'status'
        ),
        'ALTER TABLE message_outbox MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT ''PENDING'' COMMENT ''legacy dispatch status''',
        'SELECT 1'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @message_outbox_table_schema
              AND table_name = 'message_outbox'
              AND column_name = 'attempts'
        ),
        'ALTER TABLE message_outbox MODIFY COLUMN attempts INT NOT NULL DEFAULT 0 COMMENT ''legacy dispatch attempts''',
        'SELECT 1'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @message_outbox_table_schema
              AND table_name = 'message_outbox'
              AND column_name = 'next_retry_at'
        ),
        'ALTER TABLE message_outbox MODIFY COLUMN next_retry_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT ''legacy next retry time''',
        'SELECT 1'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE message_outbox
SET
  event_json = COALESCE(event_json, payload),
  routing_key = COALESCE(
      NULLIF(routing_key, ''),
      NULLIF(message_key, ''),
      CASE
          WHEN JSON_VALID(payload) THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.conversationId')), '')
          ELSE NULL
      END
  ),
  sender_id = COALESCE(
      sender_id,
      CASE
          WHEN JSON_VALID(payload) THEN CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.senderId')), '') AS UNSIGNED)
          ELSE NULL
      END
  ),
  client_message_id = COALESCE(
      client_message_id,
      CASE
          WHEN JSON_VALID(payload) THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.clientMessageId')), '')
          ELSE NULL
      END,
      CASE
          WHEN JSON_VALID(payload) THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.clientMsgId')), '')
          ELSE NULL
      END
  ),
  conversation_id = COALESCE(
      conversation_id,
      CASE
          WHEN JSON_VALID(payload) THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.conversationId')), '')
          ELSE NULL
      END,
      NULLIF(message_key, '')
  ),
  dispatch_status = CASE
      WHEN status = 'FAILED' THEN 'RETRY'
      WHEN status = 'SENDING' THEN CASE WHEN dispatch_status = 'PERSISTED' THEN 'PERSISTED' ELSE 'RETRY' END
      WHEN status = 'SENT' THEN CASE WHEN dispatch_status = 'PERSISTED' THEN 'PERSISTED' ELSE 'DISPATCHED' END
      WHEN dispatch_status IS NULL OR dispatch_status = '' THEN 'PENDING'
      ELSE dispatch_status
  END,
  attempt_count = COALESCE(attempt_count, attempts, 0),
  next_attempt_time = COALESCE(next_attempt_time, next_retry_at, created_time, CURRENT_TIMESTAMP);

SET @sql = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.statistics
            WHERE table_schema = @message_outbox_table_schema
              AND table_name = 'message_outbox'
              AND index_name = 'uk_message_outbox_sender_client_message'
        ),
        'SELECT 1',
        'ALTER TABLE message_outbox ADD UNIQUE KEY uk_message_outbox_sender_client_message (sender_id, client_message_id)'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.statistics
            WHERE table_schema = @message_outbox_table_schema
              AND table_name = 'message_outbox'
              AND index_name = 'idx_message_outbox_dispatch_status_time'
        ),
        'SELECT 1',
        'ALTER TABLE message_outbox ADD KEY idx_message_outbox_dispatch_status_time (dispatch_status, next_attempt_time)'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.statistics
            WHERE table_schema = @message_outbox_table_schema
              AND table_name = 'message_outbox'
              AND index_name = 'idx_message_outbox_conversation_time'
        ),
        'SELECT 1',
        'ALTER TABLE message_outbox ADD KEY idx_message_outbox_conversation_time (conversation_id, created_time)'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
