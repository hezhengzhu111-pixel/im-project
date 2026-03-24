package com.im.entity;

import com.im.dto.GroupMemberDTO;
import com.im.enums.MessageType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 消息实体类
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("messages")
public class Message extends BaseEntity {
    
    /**
     * 发送者ID
     */
    @TableField("sender_id")
    private Long senderId;
    
    /**
     * 接收者ID（私聊时使用）
     */
    @TableField("receiver_id")
    private Long receiverId;
    
    /**
     * 群组ID（群聊时使用）
     */
    @TableField("group_id")
    private Long groupId;
    
    /**
     * 消息类型：1-文本，2-图片，3-文件，4-语音，5-视频，6-位置，7-系统消息
     */
    @TableField("message_type")
    private MessageType messageType;
    
    /**
     * 消息内容
     */
    @TableField("content")
    private String content;
    
    /**
     * 媒体文件URL（图片、文件、语音、视频等）
     */
    @TableField("media_url")
    private String mediaUrl;
    
    /**
     * 媒体文件大小（字节）
     */
    @TableField("media_size")
    private Long mediaSize;
    
    /**
     * 媒体文件名
     */
    @TableField("media_name")
    private String mediaName;
    
    /**
     * 缩略图URL（图片、视频等）
     */
    @TableField("thumbnail_url")
    private String thumbnailUrl;
    
    /**
     * 语音/视频时长（秒）
     */
    @TableField("duration")
    private Integer duration;
    
    /**
     * 位置信息（JSON格式：{"latitude": 39.9042, "longitude": 116.4074, "address": "北京市朝阳区"}）
     */
    @TableField("location_info")
    private String locationInfo;
    
    /**
     * 消息状态：1-已发送，2-已送达，3-已读，4-撤回，5-删除
     */
    @TableField("status")
    private Integer status;
    
    /**
     * 是否为群聊消息：0-私聊，1-群聊
     */
    @TableField("is_group_chat")
    private Boolean isGroupChat;
    
    /**
     * 回复的消息ID（引用回复时使用）
     */
    @TableField("reply_to_message_id")
    private Long replyToMessageId;
    
    /**
     * 消息状态常量
     */
    public static class MessageStatus {
        public static final int SENT = 1;      // 已发送
        public static final int DELIVERED = 2; // 已送达
        public static final int READ = 3;      // 已读
        public static final int RECALLED = 4;  // 撤回
        public static final int DELETED = 5;   // 删除
    }
}
