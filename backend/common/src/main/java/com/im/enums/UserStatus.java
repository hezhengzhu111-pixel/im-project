package com.im.enums;

import lombok.Getter;

/**
 * 用户状态枚举
 */
@Getter
public enum UserStatus {
    ONLINE("online", "在线"),
    OFFLINE("offline", "离线"),
    AWAY("away", "离开"),
    BUSY("busy", "忙碌");

    private final String code;
    private final String description;

    UserStatus(String code, String description) {
        this.code = code;
        this.description = description;
    }

}