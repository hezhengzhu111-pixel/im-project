package com.im.dto;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WsPushEvent {

    private String eventId;

    private String eventType;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long messageId;

    private List<Long> targetUserIds;

    /**
     * JSON string payload.
     * MESSAGE event => MessageDTO
     * READ_RECEIPT event => ReadReceiptDTO
     */
    private String payload;

    private LocalDateTime createdAt;

    private Integer version;
}

