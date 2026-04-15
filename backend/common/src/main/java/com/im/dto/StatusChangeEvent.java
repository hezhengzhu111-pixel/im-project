package com.im.dto;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StatusChangeEvent {

    @JsonSerialize(using = ToStringSerializer.class)
    private Long messageId;

    private String conversationId;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long operatorUserId;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long senderId;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long receiverId;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long groupId;

    private Boolean group;
    private Integer newStatus;
    private String statusText;
    private LocalDateTime changedAt;
    private MessageDTO payload;
}
