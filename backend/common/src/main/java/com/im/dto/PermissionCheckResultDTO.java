package com.im.dto;

import lombok.Data;

@Data
public class PermissionCheckResultDTO {
    private boolean granted;
    private String reason;
    private Long userId;
    private String permission;
    private String resource;
    private String action;
}
