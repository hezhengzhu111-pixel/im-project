package com.im.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.dto.request.GetGroupMembersRequest;
import com.im.dto.request.GetUserRoleRequest;
import com.im.exception.GlobalExceptionHandler;
import com.im.service.GroupService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class GroupControllerAuthorizationTest {

    @Mock
    private GroupService groupService;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new GroupController(groupService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void getGroupMembersShouldRejectNonMember() throws Exception {
        GetGroupMembersRequest request = new GetGroupMembersRequest();
        request.setGroupId(88L);
        request.setLimit(20);
        when(groupService.getUserRoleInGroup(88L, 1L)).thenReturn(0);

        mockMvc.perform(post("/s/members/list")
                        .requestAttr("userId", 1L)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(403));

        verify(groupService, never()).getGroupMembers(anyLong(), any(), anyInt());
    }

    @Test
    void getUserGroupsShouldRejectCrossUserAccess() throws Exception {
        mockMvc.perform(get("/s/user/2")
                        .requestAttr("userId", 1L))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(403));

        verifyNoInteractions(groupService);
    }

    @Test
    void getUserRoleShouldRejectCrossUserAccess() throws Exception {
        GetUserRoleRequest request = new GetUserRoleRequest();
        request.setGroupId(88L);
        request.setUserId(2L);

        mockMvc.perform(post("/s/role/get")
                        .requestAttr("userId", 1L)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(403));

        verifyNoInteractions(groupService);
    }

    @Test
    void getGroupInfoShouldRejectNonMember() throws Exception {
        when(groupService.getUserRoleInGroup(88L, 1L)).thenReturn(0);

        mockMvc.perform(get("/s/88/info")
                        .requestAttr("userId", 1L))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(403));

        verify(groupService, never()).getGroupInfo(anyLong());
    }
}
