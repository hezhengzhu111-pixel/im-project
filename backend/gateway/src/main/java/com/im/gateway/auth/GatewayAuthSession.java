package com.im.gateway.auth;

import com.im.dto.AuthUserResourceDTO;

public record GatewayAuthSession(Long userId,
                                 String username,
                                 AuthUserResourceDTO userResource,
                                 Long expiresAtEpochMs) {
}
