package com.im.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.message.entity.MessageStateOutbox;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface MessageStateOutboxMapper extends BaseMapper<MessageStateOutbox> {

    @Select("""
            <script>
            SELECT *
            FROM message_state_outbox
            WHERE (
                    dispatch_status IN ('PENDING', 'RETRY')
                    AND next_attempt_time &lt;= #{now}
                  )
               OR (
                    dispatch_status = 'DISPATCHING'
                    AND next_attempt_time &lt;= #{now}
                  )
            ORDER BY created_time ASC, id ASC
            LIMIT #{limit}
            </script>
            """)
    List<MessageStateOutbox> selectDispatchableBatch(@Param("now") LocalDateTime now,
                                                     @Param("limit") int limit);

    @Update("""
            UPDATE message_state_outbox
            SET dispatch_status = 'DISPATCHING',
                next_attempt_time = #{leaseUntil},
                last_error = NULL
            WHERE id = #{id}
              AND (
                    (dispatch_status IN ('PENDING', 'RETRY') AND next_attempt_time <= #{now})
                    OR
                    (dispatch_status = 'DISPATCHING' AND next_attempt_time <= #{now})
                  )
            """)
    int markDispatchingById(@Param("id") Long id,
                            @Param("now") LocalDateTime now,
                            @Param("leaseUntil") LocalDateTime leaseUntil);

    @Update("""
            UPDATE message_state_outbox
            SET dispatch_status = 'DISPATCHED',
                dispatched_time = #{dispatchedTime},
                last_error = NULL
            WHERE id = #{id}
            """)
    int markDispatchedById(@Param("id") Long id,
                           @Param("dispatchedTime") LocalDateTime dispatchedTime);

    @Update("""
            UPDATE message_state_outbox
            SET dispatch_status = 'RETRY',
                attempt_count = attempt_count + 1,
                next_attempt_time = #{nextAttemptTime},
                last_error = #{lastError}
            WHERE id = #{id}
            """)
    int markRetryById(@Param("id") Long id,
                      @Param("nextAttemptTime") LocalDateTime nextAttemptTime,
                      @Param("lastError") String lastError);
}
