package com.im.dto;

import lombok.Data;

import java.util.List;

@Data
public class GroupMemberPageDTO {
    private List<GroupMemberDTO> members;
    private Long nextCursor;
}