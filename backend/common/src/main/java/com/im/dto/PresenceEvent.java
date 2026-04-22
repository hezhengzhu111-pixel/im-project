package com.im.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PresenceEvent {

    private String userId;

    private String status;

    private String lastSeen;

    private Long eventTime;

    private String sourceInstanceId;
}
