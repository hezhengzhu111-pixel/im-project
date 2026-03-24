package com.im.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class ReadReceiptDTO {
    private String conversationId;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long readerId;

    @JsonProperty("to_user_id")
    @JsonSerialize(using = ToStringSerializer.class)
    private Long toUserId;

    @JsonProperty("read_at")
    private LocalDateTime readAt;

    @JsonProperty("last_read_message_id")
    @JsonSerialize(using = ToStringSerializer.class)
    private Long lastReadMessageId;
}
