package com.im.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.message.entity.MessageOutbox;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface MessageOutboxMapper extends BaseMapper<MessageOutbox> {

    @Select("""
            SELECT *
            FROM message_outbox
            WHERE sender_id = #{senderId}
              AND client_message_id = #{clientMessageId}
            LIMIT 1
            """)
    MessageOutbox selectBySenderIdAndClientMessageId(@Param("senderId") Long senderId,
                                                     @Param("clientMessageId") String clientMessageId);

    @Select("""
            <script>
            SELECT *
            FROM message_outbox
            WHERE dispatch_status IN ('PENDING', 'RETRY')
              AND next_attempt_time &lt;= #{now}
            ORDER BY created_time ASC, id ASC
            LIMIT #{limit}
            </script>
            """)
    List<MessageOutbox> selectDispatchableBatch(@Param("now") LocalDateTime now,
                                                @Param("limit") int limit);

    @Update("""
            UPDATE message_outbox
            SET dispatch_status = 'DISPATCHED',
                dispatched_time = #{dispatchedTime},
                last_error = NULL
            WHERE id = #{messageId}
            """)
    int markDispatchedById(@Param("messageId") Long messageId,
                           @Param("dispatchedTime") LocalDateTime dispatchedTime);

    @Update("""
            UPDATE message_outbox
            SET dispatch_status = 'RETRY',
                attempt_count = attempt_count + 1,
                next_attempt_time = #{nextAttemptTime},
                last_error = #{lastError}
            WHERE id = #{messageId}
            """)
    int markRetryById(@Param("messageId") Long messageId,
                      @Param("nextAttemptTime") LocalDateTime nextAttemptTime,
                      @Param("lastError") String lastError);

    @Update("""
            UPDATE message_outbox
            SET dispatch_status = 'PERSISTED'
            WHERE id = #{messageId}
            """)
    int markPersistedById(@Param("messageId") Long messageId);
}
