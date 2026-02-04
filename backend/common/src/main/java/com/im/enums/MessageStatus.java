package com.im.enums;

import lombok.Getter;

/**
 * 消息状态枚举
 */
@Getter
public enum MessageStatus {
    SENDING("sending", "发送中"),
    SENT("sent", "已发送"),
    DELIVERED("delivered", "已送达"),
    READ("read", "已读"),
    FAILED("failed", "发送失败"),
    OFFLINE("offline", "离线消息");

    private final String code;
    private final String description;

    MessageStatus(String code, String description) {
        this.code = code;
        this.description = description;
    }

}
