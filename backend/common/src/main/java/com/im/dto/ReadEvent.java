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
public class ReadEvent {

    @JsonSerialize(using = ToStringSerializer.class)
    private Long userId;

    private String conversationId;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long targetUserId;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long groupId;

    private Boolean group;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long lastReadMessageId;

    private LocalDateTime timestamp;
}
