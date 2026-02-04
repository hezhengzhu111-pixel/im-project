package com.im.dto;

import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.Builder;

import java.time.LocalDateTime;

/**
 * 群组信息DTO
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class GroupInfoDTO {
    private Long id;
    private String name;
    private Integer type;
    private String announcement;
    private String avatar;
    private Long ownerId;
    private String ownerName;
    private Integer memberCount;
    private Integer maxMembers;
    private Boolean isMuted;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}