package com.im.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WsTicketConsumeResultDTO {
    public static final String STATUS_VALID = "VALID";
    public static final String STATUS_INVALID = "INVALID";
    public static final String STATUS_USER_MISMATCH = "USER_MISMATCH";

    private boolean valid;
    private String status;
    private Long userId;
    private String username;
    private String error;
}
