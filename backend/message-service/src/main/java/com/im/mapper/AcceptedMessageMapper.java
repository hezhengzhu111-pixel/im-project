package com.im.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.message.entity.AcceptedMessage;
import org.apache.ibatis.annotations.*;

@Mapper
public interface AcceptedMessageMapper extends BaseMapper<AcceptedMessage> {

    @Select("""
            SELECT *
            FROM accepted_message
            WHERE sender_id = #{senderId}
              AND client_message_id = #{clientMessageId}
            LIMIT 1
            """)
    AcceptedMessage selectBySenderIdAndClientMessageId(@Param("senderId") Long senderId,
                                                       @Param("clientMessageId") String clientMessageId);

    @Delete("""
            DELETE FROM accepted_message
            WHERE sender_id = #{senderId}
              AND client_message_id = #{clientMessageId}
              AND id = #{messageId}
            """)
    int deleteBySenderIdAndClientMessageIdAndMessageId(@Param("senderId") Long senderId,
                                                       @Param("clientMessageId") String clientMessageId,
                                                       @Param("messageId") Long messageId);

    @Update("""
            UPDATE accepted_message
            SET ack_stage = #{ackStage}
            WHERE id = #{messageId}
            """)
    int updateAckStageById(@Param("messageId") Long messageId,
                           @Param("ackStage") String ackStage);
}
