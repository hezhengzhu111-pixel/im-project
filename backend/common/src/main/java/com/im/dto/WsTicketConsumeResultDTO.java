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
    private boolean valid;
    private Long userId;
    private String username;
    private String error;
}
