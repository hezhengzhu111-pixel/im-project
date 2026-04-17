package com.im.dto;

import com.im.enums.JwtLocalValidationStatus;

public record JwtLocalValidationResult(
        JwtLocalValidationStatus status,
        Long userId,
        String username,
        String tokenType,
        String jti,
        Long issuedAtEpochMs,
        Long expiresAtEpochMs
) {
    public boolean isValid() {
        return status == JwtLocalValidationStatus.VALID;
    }
}
