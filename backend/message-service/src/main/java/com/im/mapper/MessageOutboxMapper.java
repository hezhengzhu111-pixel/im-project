package com.im.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.message.entity.MessageOutboxEvent;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface MessageOutboxMapper extends BaseMapper<MessageOutboxEvent> {

    @Select("""
            SELECT * FROM message_outbox
            WHERE status IN ('PENDING','FAILED')
              AND next_retry_at <= #{now}
            ORDER BY next_retry_at ASC
            LIMIT #{limit}
            """)
    List<MessageOutboxEvent> selectDueEvents(@Param("now") LocalDateTime now, @Param("limit") int limit);

    @Select("""
            SELECT id FROM message_outbox
            WHERE status IN ('PENDING','FAILED')
              AND attempts < #{maxAttempts}
              AND next_retry_at <= #{now}
            ORDER BY next_retry_at ASC
            LIMIT #{limit}
            """)
    List<Long> selectDueEventIds(@Param("now") LocalDateTime now,
                                 @Param("limit") int limit,
                                 @Param("maxAttempts") int maxAttempts);

    @Update("""
            UPDATE message_outbox
            SET status = 'SENDING'
            WHERE id = #{id}
              AND status IN ('PENDING','FAILED')
              AND attempts < #{maxAttempts}
              AND next_retry_at <= #{now}
            """)
    int claimEventForSending(@Param("id") Long id,
                             @Param("now") LocalDateTime now,
                             @Param("maxAttempts") int maxAttempts);

    @Update("""
            UPDATE message_outbox
            SET status = 'SENT',
                last_error = NULL,
                next_retry_at = #{now}
            WHERE id = #{id}
              AND status = 'SENDING'
            """)
    int markSent(@Param("id") Long id, @Param("now") LocalDateTime now);

    @Update("""
            UPDATE message_outbox
            SET status = 'FAILED',
                attempts = attempts + 1,
                last_error = #{lastError},
                next_retry_at = #{nextRetryAt}
            WHERE id = #{id}
              AND status = 'SENDING'
            """)
    int markFailed(@Param("id") Long id,
                   @Param("lastError") String lastError,
                   @Param("nextRetryAt") LocalDateTime nextRetryAt);

    @Update("""
            UPDATE message_outbox
            SET status = 'FAILED',
                attempts = attempts + 1,
                last_error = 'stuck in SENDING, auto recovered',
                next_retry_at = #{now}
            WHERE status = 'SENDING'
              AND attempts < #{maxAttempts}
              AND updated_time < #{staleBefore}
            """)
    int recoverStuckSending(@Param("now") LocalDateTime now,
                            @Param("staleBefore") LocalDateTime staleBefore,
                            @Param("maxAttempts") int maxAttempts);

    @Select("""
            SELECT * FROM message_outbox
            WHERE related_message_id = #{relatedMessageId}
              AND topic = #{topic}
            ORDER BY created_time DESC
            LIMIT 1
            """)
    MessageOutboxEvent selectLatestByRelatedMessageIdAndTopic(@Param("relatedMessageId") Long relatedMessageId,
                                                             @Param("topic") String topic);
}

