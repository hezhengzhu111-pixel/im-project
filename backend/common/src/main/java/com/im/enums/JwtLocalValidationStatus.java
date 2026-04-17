package com.im.enums;

public enum JwtLocalValidationStatus {
    VALID,
    EXPIRED,
    INVALID_SIGNATURE_OR_MALFORMED,
    MISSING_REQUIRED_CLAIMS
}
