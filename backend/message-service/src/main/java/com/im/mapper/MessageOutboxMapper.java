package com.im.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.entity.MessageOutboxEvent;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

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
            SELECT * FROM message_outbox
            WHERE related_message_id = #{relatedMessageId}
              AND topic = #{topic}
            ORDER BY created_time DESC
            LIMIT 1
            """)
    MessageOutboxEvent selectLatestByRelatedMessageIdAndTopic(@Param("relatedMessageId") Long relatedMessageId,
                                                             @Param("topic") String topic);
}

