package com.im.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.message.entity.PendingStatusEventBacklog;
import org.apache.ibatis.annotations.*;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface PendingStatusEventBacklogMapper extends BaseMapper<PendingStatusEventBacklog> {

    @Select("""
            SELECT *
            FROM pending_status_event
            WHERE message_id = #{messageId}
            ORDER BY changed_at ASC, new_status ASC
            """)
    List<PendingStatusEventBacklog> selectByMessageId(@Param("messageId") Long messageId);

    @Delete("""
            DELETE FROM pending_status_event
            WHERE message_id = #{messageId}
              AND new_status = #{newStatus}
            """)
    int deleteByMessageIdAndStatus(@Param("messageId") Long messageId,
                                   @Param("newStatus") Integer newStatus);

    @Select("""
            SELECT COUNT(1) > 0
            FROM pending_status_event
            WHERE message_id = #{messageId}
              AND new_status = #{newStatus}
            """)
    boolean existsByMessageIdAndStatus(@Param("messageId") Long messageId,
                                       @Param("newStatus") Integer newStatus);

    @Select("""
            SELECT DISTINCT message_id
            FROM pending_status_event
            ORDER BY message_id ASC
            """)
    List<Long> selectPendingMessageIds();

    @Update("""
            UPDATE pending_status_event
            SET changed_at = #{changedAt},
                payload_json = #{payloadJson},
                updated_time = CURRENT_TIMESTAMP
            WHERE message_id = #{messageId}
              AND new_status = #{newStatus}
            """)
    int updateExisting(@Param("messageId") Long messageId,
                       @Param("newStatus") Integer newStatus,
                       @Param("changedAt") LocalDateTime changedAt,
                       @Param("payloadJson") String payloadJson);
}
