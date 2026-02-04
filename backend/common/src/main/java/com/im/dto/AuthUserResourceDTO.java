package com.im.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class AuthUserResourceDTO {
    private Long userId;
    private String username;
    private Map<String, Object> userInfo;
    private List<String> resourcePermissions;
    private Map<String, Object> dataScopes;
}

