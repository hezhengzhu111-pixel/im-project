package com.im.task;

import com.im.mapper.MessageMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDateTime;
import java.sql.Timestamp;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * 消息清理定时任务
 * 负责清理过期消息、缓存维护等后台任务
 */
@Slf4j
@Component
public class MessageCleanupTask {

    @Autowired
    private MessageMapper messageMapper;
    
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Autowired
    private JdbcTemplate jdbcTemplate;
    
    /**
     * 清理过期的已删除消息
     * 每天凌晨2点执行
     */
    @Scheduled(cron = "0 0 2 * * ?")
    public void cleanupExpiredMessages() {
        try {
            log.info("开始清理过期消息...");
            
            // 清理30天前的已删除消息
            LocalDateTime expireTime = LocalDateTime.now().minusDays(30);
            int deletedCount = messageMapper.deleteExpiredMessages(expireTime);
            
            log.info("清理过期消息完成，删除了 {} 条记录", deletedCount);
        } catch (Exception e) {
            log.error("清理过期消息失败", e);
        }
    }

    /**
     * 归档90天前消息到 messages_archive
     * 每天凌晨2点10分执行
     */
    @Scheduled(cron = "0 10 2 * * ?")
    public void archiveOldMessages() {
        try {
            LocalDateTime cutoff = LocalDateTime.now().minusDays(90);
            int batch = 5000;
            List<Long> ids = jdbcTemplate.queryForList(
                    "SELECT id FROM messages WHERE created_time < ? ORDER BY created_time ASC LIMIT ?",
                    Long.class,
                    Timestamp.valueOf(cutoff),
                    batch
            );
            if (ids == null || ids.isEmpty()) {
                return;
            }

            String placeholders = String.join(",", ids.stream().map(x -> "?").toList());
            String insertSql = """
                    INSERT IGNORE INTO messages_archive (
                      id, sender_id, receiver_id, group_id, message_type, content, media_url, media_size, media_name,
                      thumbnail_url, duration, location_info, status, is_group_chat, reply_to_message_id, created_time, updated_time, archived_time
                    )
                    SELECT
                      id, sender_id, receiver_id, group_id, message_type, content, media_url, media_size, media_name,
                      thumbnail_url, duration, location_info, status, is_group_chat, reply_to_message_id, created_time, updated_time, NOW()
                    FROM messages
                    WHERE id IN (""" + placeholders + ")";
            jdbcTemplate.update(insertSql, ids.toArray());

            String deleteSql = "DELETE FROM messages WHERE id IN (" + placeholders + ")";
            int deleted = jdbcTemplate.update(deleteSql, ids.toArray());
            log.info("归档完成: cutoff={}, archived={}, deleted={}", cutoff, ids.size(), deleted);
        } catch (Exception e) {
            log.error("归档消息失败", e);
        }
    }
    
    /**
     * 清理过期的缓存
     * 每小时执行一次
     */
    @Scheduled(cron = "0 0 * * * ?")
    public void cleanupExpiredCache() {
        try {
            long ttlSeconds = TimeUnit.HOURS.toSeconds(1);
            int updated = ensureTtlWithScan("conversations:user:*", ttlSeconds, 500);
            log.info("缓存TTL巡检完成: pattern=conversations:user:*, ttlSeconds={}, updated={}", ttlSeconds, updated);
        } catch (Exception e) {
            log.error("清理过期缓存失败", e);
        }
    }

    private int ensureTtlWithScan(String pattern, long ttlSeconds, int batchSize) {
        Integer updated = redisTemplate.execute((RedisConnection connection) -> {
            int count = 0;
            ScanOptions options = ScanOptions.scanOptions()
                    .match(pattern)
                    .count(Math.max(1, batchSize))
                    .build();
            try (Cursor<byte[]> cursor = connection.scan(options)) {
                while (cursor.hasNext()) {
                    byte[] key = cursor.next();
                    Long ttl = connection.ttl(key);
                    if (ttl != null && ttl == -1) {
                        Boolean ok = connection.expire(key, ttlSeconds);
                        if (Boolean.TRUE.equals(ok)) {
                            count++;
                        }
                    }
                }
            }
            return count;
        });
        return updated == null ? 0 : updated;
    }
    
    /**
     * 统计消息数据
     * 每天凌晨1点执行
     */
    @Scheduled(cron = "0 0 1 * * ?")
    public void generateMessageStatistics() {
        try {
            log.info("开始生成消息统计数据...");
            
            LocalDateTime yesterday = LocalDateTime.now().minusDays(1);
            LocalDateTime today = LocalDateTime.now();
            
            // 这里可以添加消息统计逻辑，比如：
            // - 统计昨日消息总数
            // - 统计活跃用户数
            // - 统计群聊活跃度
            // 将统计结果存储到Redis或数据库中
            
            log.info("生成消息统计数据完成");
        } catch (Exception e) {
            log.error("生成消息统计数据失败", e);
        }
    }
    
    /**
     * 预热热点数据缓存
     * 每天早上6点执行
     */
    @Scheduled(cron = "0 0 6 * * ?")
    public void warmupCache() {
        try {
            log.info("开始预热缓存...");
            
            // 这里可以添加缓存预热逻辑，比如：
            // - 预加载活跃用户的会话列表
            // - 预加载热门群聊的最新消息
            // - 预加载用户好友关系等
            
            log.info("预热缓存完成");
        } catch (Exception e) {
            log.error("预热缓存失败", e);
        }
    }
}
