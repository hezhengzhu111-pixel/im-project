package com.im.component;

import com.im.mapper.MessageMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.concurrent.TimeUnit;

/**
 * 消息限流组件
 * 防止用户发送消息过于频繁，避免刷屏和恶意攻击
 */
@Slf4j
@Component
public class MessageRateLimiter {

    @Autowired
    private StringRedisTemplate stringRedisTemplate;
    
    @Autowired
    private MessageMapper messageMapper;
    
    // 限流配置常量
    private static final String RATE_LIMIT_PREFIX = "rate_limit:message:";
    private static final String DAILY_LIMIT_PREFIX = "daily_limit:message:";
    
    // 每分钟最多发送消息数
    private static final int MAX_MESSAGES_PER_MINUTE = 30;
    // 每小时最多发送消息数
    private static final int MAX_MESSAGES_PER_HOUR = 300;
    // 每天最多发送消息数
    private static final int MAX_MESSAGES_PER_DAY = 2000;
    
    /**
     * 检查用户是否可以发送消息
     * @param userId 用户ID
     * @return true表示可以发送，false表示被限流
     */
    public boolean canSendMessage(Long userId) {
        try {
            // 检查分钟级限流
            if (!checkMinuteLimit(userId)) {
                log.warn("用户 {} 触发分钟级限流", userId);
                return false;
            }
            
            // 检查小时级限流
            if (!checkHourLimit(userId)) {
                log.warn("用户 {} 触发小时级限流", userId);
                return false;
            }
            
            // 检查日级限流
            if (!checkDayLimit(userId)) {
                log.warn("用户 {} 触发日级限流", userId);
                return false;
            }
            
            return true;
        } catch (Exception e) {
            log.error("检查消息限流失败，用户ID: {}", userId, e);
            // 出现异常时允许发送，避免影响正常功能
            return true;
        }
    }
    
    /**
     * 记录用户发送消息
     * @param userId 用户ID
     */
    public void recordMessage(Long userId) {
        try {
            long currentTime = System.currentTimeMillis();
            
            // 记录分钟级计数
            String minuteKey = RATE_LIMIT_PREFIX + "minute:" + userId + ":" + (currentTime / 60000);
            stringRedisTemplate.opsForValue().increment(minuteKey);
            stringRedisTemplate.expire(minuteKey, 2, TimeUnit.MINUTES);
            
            // 记录小时级计数
            String hourKey = RATE_LIMIT_PREFIX + "hour:" + userId + ":" + (currentTime / 3600000);
            stringRedisTemplate.opsForValue().increment(hourKey);
            stringRedisTemplate.expire(hourKey, 2, TimeUnit.HOURS);
            
            // 记录日级计数
            String dayKey = DAILY_LIMIT_PREFIX + userId + ":" + (currentTime / 86400000);
            stringRedisTemplate.opsForValue().increment(dayKey);
            stringRedisTemplate.expire(dayKey, 2, TimeUnit.DAYS);
            
        } catch (Exception e) {
            log.error("记录消息发送失败，用户ID: {}", userId, e);
        }
    }
    
    /**
     * 检查分钟级限流
     */
    private boolean checkMinuteLimit(Long userId) {
        long currentTime = System.currentTimeMillis();
        String minuteKey = RATE_LIMIT_PREFIX + "minute:" + userId + ":" + (currentTime / 60000);
        
        String count = stringRedisTemplate.opsForValue().get(minuteKey);
        int messageCount = count != null ? Integer.parseInt(count.toString()) : 0;
        
        return messageCount < MAX_MESSAGES_PER_MINUTE;
    }
    
    /**
     * 检查小时级限流
     */
    private boolean checkHourLimit(Long userId) {
        long currentTime = System.currentTimeMillis();
        String hourKey = RATE_LIMIT_PREFIX + "hour:" + userId + ":" + (currentTime / 3600000);
        
        String count = stringRedisTemplate.opsForValue().get(hourKey);
        int messageCount = count != null ? Integer.parseInt(count.toString()) : 0;
        
        return messageCount < MAX_MESSAGES_PER_HOUR;
    }
    
    /**
     * 检查日级限流
     */
    private boolean checkDayLimit(Long userId) {
        long currentTime = System.currentTimeMillis();
        String dayKey = DAILY_LIMIT_PREFIX + userId + ":" + (currentTime / 86400000);
        
        String count = stringRedisTemplate.opsForValue().get(dayKey);
        int messageCount = count != null ? Integer.parseInt(count.toString()) : 0;
        
        return messageCount < MAX_MESSAGES_PER_DAY;
    }
    
    /**
     * 获取用户今日已发送消息数
     * @param userId 用户ID
     * @return 今日已发送消息数
     */
    public int getTodayMessageCount(Long userId) {
        try {
            long currentTime = System.currentTimeMillis();
            String dayKey = DAILY_LIMIT_PREFIX + userId + ":" + (currentTime / 86400000);
            
            String count = stringRedisTemplate.opsForValue().get(dayKey);
            return count != null ? Integer.parseInt(count.toString()) : 0;
        } catch (Exception e) {
            log.error("获取用户今日消息数失败，用户ID: {}", userId, e);
            return 0;
        }
    }
    
    /**
     * 检查用户是否为高频发送者（基于数据库统计）
     * @param userId 用户ID
     * @return true表示是高频发送者
     */
    public boolean isHighFrequencySender(Long userId) {
        try {
            LocalDateTime oneHourAgo = LocalDateTime.now().minusHours(1);
            LocalDateTime now = LocalDateTime.now();
            
            Long messageCount = messageMapper.countMessagesByTimeRange(userId, oneHourAgo, now);
            
            // 如果一小时内发送超过100条消息，认为是高频发送者
            return messageCount != null && messageCount > 100;
        } catch (Exception e) {
            log.error("检查高频发送者失败，用户ID: {}", userId, e);
            return false;
        }
    }
    
    /**
     * 重置用户限流计数（管理员功能）
     * @param userId 用户ID
     */
    public void resetUserRateLimit(Long userId) {
        try {
            long currentTime = System.currentTimeMillis();
            
            // 删除分钟级计数
            String minuteKey = RATE_LIMIT_PREFIX + "minute:" + userId + ":" + (currentTime / 60000);
            stringRedisTemplate.delete(minuteKey);
            
            // 删除小时级计数
            String hourKey = RATE_LIMIT_PREFIX + "hour:" + userId + ":" + (currentTime / 3600000);
            stringRedisTemplate.delete(hourKey);
            
            // 删除日级计数
            String dayKey = DAILY_LIMIT_PREFIX + userId + ":" + (currentTime / 86400000);
            stringRedisTemplate.delete(dayKey);
            
            log.info("重置用户 {} 的限流计数", userId);
        } catch (Exception e) {
            log.error("重置用户限流计数失败，用户ID: {}", userId, e);
        }
    }
}
