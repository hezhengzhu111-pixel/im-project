package com.im.dto.request;

import lombok.Data;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@Data
public class SendSystemMessageRequest {

    @NotNull(message = "receiverId cannot be null")
    private Long receiverId;

    @NotBlank(message = "content cannot be blank")
    private String content;

    /**
     * Optional system sender id. Defaults to configured system sender id when null.
     */
    private Long senderId;
}

