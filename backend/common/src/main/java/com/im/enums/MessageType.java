package com.im.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import lombok.Getter;

import java.util.Arrays;

/**
 * 消息类型枚举
 */
@Getter
public enum MessageType {
    TEXT(1, "文本消息"),
    IMAGE(2, "图片消息"),
    FILE(3, "文件消息"),
    VOICE(4, "语音消息"),
    VIDEO(5, "视频消息"),
    SYSTEM(7, "系统消息");

    @EnumValue
    private final Integer code;
    private final String description;

    MessageType(Integer code, String description) {
        this.code = code;
        this.description = description;
    }

    public static MessageType fromCode(Integer code) {
        if (code == null) {
            return null;
        }
        return Arrays.stream(values())
                .filter(item -> item.code.equals(code))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown message type code: " + code));
    }

}
