package com.im.dto.request;

import lombok.Data;

@Data
public class CheckPermissionRequest {
    private Long userId;
    private String permission;
    private String resource;
    private String action;
}
