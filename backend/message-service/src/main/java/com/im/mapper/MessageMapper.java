package com.im.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.entity.Message;
import lombok.Data;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface MessageMapper extends BaseMapper<Message> {

    @Select({
            "<script>",
            "SELECT m.* FROM messages m",
            "JOIN (",
            "  SELECT",
            "    CASE WHEN sender_id = #{userId} THEN receiver_id ELSE sender_id END AS peer_id,",
            "    MAX(id) AS max_id",
            "  FROM messages",
            "  WHERE (",
            "    (sender_id = #{userId} AND receiver_id IN",
            "      <foreach collection='friendIds' item='fid' open='(' separator=',' close=')'>",
            "        #{fid}",
            "      </foreach>",
            "    )",
            "    OR",
            "    (receiver_id = #{userId} AND sender_id IN",
            "      <foreach collection='friendIds' item='fid2' open='(' separator=',' close=')'>",
            "        #{fid2}",
            "      </foreach>",
            "    )",
            "  )",
            "  AND is_group_chat = 0",
            "  AND status &lt;&gt; 5",
            "  GROUP BY peer_id",
            ") t ON m.id = t.max_id",
            "ORDER BY m.created_time DESC",
            "</script>"
    })
    List<Message> selectLastPrivateMessagesBatch(@Param("userId") Long userId, @Param("friendIds") List<Long> friendIds);

    @Select({
            "<script>",
            "SELECT m.* FROM messages m",
            "JOIN (",
            "  SELECT group_id, MAX(id) AS max_id",
            "  FROM messages",
            "  WHERE group_id IN",
            "    <foreach collection='groupIds' item='gid' open='(' separator=',' close=')'>",
            "      #{gid}",
            "    </foreach>",
            "    AND is_group_chat = 1",
            "    AND status &lt;&gt; 5",
            "  GROUP BY group_id",
            ") t ON m.id = t.max_id",
            "ORDER BY m.created_time DESC",
            "</script>"
    })
    List<Message> selectLastGroupMessagesBatch(@Param("groupIds") List<Long> groupIds);

    @Select({
            "<script>",
            "SELECT sender_id AS senderId, COUNT(1) AS cnt",
            "FROM messages",
            "WHERE receiver_id = #{receiverId}",
            "  AND sender_id IN",
            "    <foreach collection='senderIds' item='sid' open='(' separator=',' close=')'>",
            "      #{sid}",
            "    </foreach>",
            "  AND is_group_chat = 0",
            "  AND status = 1",
            "GROUP BY sender_id",
            "</script>"
    })
    List<CountPair> countUnreadPrivateMessagesBatch(@Param("receiverId") Long receiverId, @Param("senderIds") List<Long> senderIds);

    @Select({
            "<script>",
            "SELECT group_id AS groupId, COUNT(1) AS cnt",
            "FROM messages",
            "WHERE group_id IN",
            "  <foreach collection='groupIds' item='gid' open='(' separator=',' close=')'>",
            "    #{gid}",
            "  </foreach>",
            "  AND is_group_chat = 1",
            "  AND sender_id &lt;&gt; #{userId}",
            "  AND status &lt;&gt; 5",
            "  <if test='lastReadTime != null'>",
            "    AND created_time &gt; #{lastReadTime}",
            "  </if>",
            "GROUP BY group_id",
            "</script>"
    })
    List<CountPair> countUnreadGroupMessagesBatch(@Param("groupIds") List<Long> groupIds,
                                                 @Param("userId") Long userId,
                                                 @Param("lastReadTime") LocalDateTime lastReadTime);

    @Select({
            "<script>",
            "SELECT m.group_id AS groupId, COUNT(1) AS cnt",
            "FROM messages m",
            "LEFT JOIN group_read_cursor grc",
            "  ON grc.group_id = m.group_id",
            " AND grc.user_id = #{userId}",
            "WHERE m.group_id IN",
            "  <foreach collection='groupIds' item='gid' open='(' separator=',' close=')'>",
            "    #{gid}",
            "  </foreach>",
            "  AND m.is_group_chat = 1",
            "  AND m.sender_id &lt;&gt; #{userId}",
            "  AND m.status &lt;&gt; 5",
            "  AND (grc.last_read_at IS NULL OR m.created_time &gt; grc.last_read_at)",
            "GROUP BY m.group_id",
            "</script>"
    })
    List<CountPair> countUnreadGroupMessagesByUserCursors(@Param("groupIds") List<Long> groupIds,
                                                           @Param("userId") Long userId);

    @Select("""
            SELECT COUNT(1) FROM messages
            WHERE sender_id = #{senderId}
              AND created_time BETWEEN #{startTime} AND #{endTime}
              AND status <> 5
            """)
    Long countMessagesByTimeRange(@Param("senderId") Long senderId,
                                 @Param("startTime") LocalDateTime startTime,
                                 @Param("endTime") LocalDateTime endTime);

    @Delete("""
            DELETE FROM messages
            WHERE status = 5 AND updated_time < #{expireTime}
            """)
    int deleteExpiredMessages(@Param("expireTime") LocalDateTime expireTime);

    @Data
    class CountPair {
        private Long senderId;
        private Long groupId;
        private Long cnt;
    }
}

