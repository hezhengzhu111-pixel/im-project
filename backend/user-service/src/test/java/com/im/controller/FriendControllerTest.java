package com.im.controller;

import com.im.common.PageResult;
import com.im.dto.ApiResponse;
import com.im.dto.FriendListDTO;
import com.im.dto.FriendRequestDTO;
import com.im.dto.FriendRequestResponseDTO;
import com.im.dto.request.AcceptFriendRequestRequest;
import com.im.dto.request.SendFriendRequestRequest;
import com.im.service.FriendService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FriendControllerTest {

    @Mock
    private FriendService friendService;

    @InjectMocks
    private FriendController friendController;

    @Test
    void sendFriendRequest_Success() {
        SendFriendRequestRequest request = new SendFriendRequestRequest();
        request.setTargetUserId("2");
        request.setReason("hi");
        
        FriendRequestResponseDTO serviceResponse = FriendRequestResponseDTO.success("success", 100L);
        when(friendService.sendFriendRequest(1L, 2L, "hi")).thenReturn(serviceResponse);
        
        ApiResponse<FriendRequestResponseDTO> response = friendController.sendFriendRequest(1L, request);
        
        assertEquals(200, response.getCode());
        assertEquals("success", response.getData().getMessage());
    }

    @Test
    void sendFriendRequest_Failure() {
        SendFriendRequestRequest request = new SendFriendRequestRequest();
        request.setTargetUserId("2");
        
        FriendRequestResponseDTO serviceResponse = FriendRequestResponseDTO.error("failed");
        when(friendService.sendFriendRequest(1L, 2L, null)).thenReturn(serviceResponse);
        
        ApiResponse<FriendRequestResponseDTO> response = friendController.sendFriendRequest(1L, request);
        
        assertEquals(400, response.getCode());
        assertEquals("failed", response.getMessage());
    }

    @Test
    void getFriendList_ShouldReturnList() {
        FriendListDTO dto = new FriendListDTO();
        dto.setFriendId("2");
        when(friendService.getFriendList(1L)).thenReturn(Collections.singletonList(dto));
        
        ApiResponse<List<FriendListDTO>> response = friendController.getFriendList(1L);
        
        assertEquals(200, response.getCode());
        assertEquals(1, response.getData().size());
    }

    @Test
    void getFriendRequests_ShouldReturnPage() {
        PageResult<FriendRequestDTO> page = new PageResult<>();
        page.setContent(Collections.emptyList());
        when(friendService.getFriendRequests(1L, "10", 20)).thenReturn(page);
        
        ApiResponse<PageResult<FriendRequestDTO>> response = friendController.getFriendRequests(1L, "10", 20);
        
        assertEquals(200, response.getCode());
    }
}
