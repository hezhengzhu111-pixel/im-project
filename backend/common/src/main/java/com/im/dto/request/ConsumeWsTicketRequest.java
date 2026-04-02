package com.im.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class ConsumeWsTicketRequest {
    @NotBlank
    private String ticket;

    @NotNull
    private Long userId;
}
