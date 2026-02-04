package com.im.constants;

/**
 * IM系统常量类
 * 统一管理系统中使用的常量值
 * 
 * @author IM Team
 * @version 1.0.0
 */
public final class ImConstants {
    
    private ImConstants() {
        // 私有构造函数，防止实例化
    }
    
    /**
     * 消息相关常量
     */
    public static final class Message {
        public static final String INVALID_SENDER = "发送者ID不能为空";
        public static final String INVALID_RECEIVER = "接收者ID不能为空";
        public static final String INVALID_GROUP = "群组ID不能为空";
        public static final String INVALID_CONTENT = "消息内容不能为空";
        public static final String INVALID_TYPE = "消息类型不能为空";
    }


    /**
     * 心跳检测相关常量
     */
    public static final class Heartbeat {
        public static final String PING_MESSAGE = "ping";
    }
}