package com.im.service.impl;

import com.im.common.PageResult;
import com.im.dto.FriendListDTO;
import com.im.dto.FriendRequestDTO;
import com.im.dto.FriendRequestResponseDTO;
import com.im.mapper.FriendMapper;
import com.im.mapper.FriendRequestMapper;
import com.im.mapper.UserMapper;
import com.im.service.ImService;
import com.im.user.entity.Friend;
import com.im.user.entity.FriendRequest;
import com.im.user.entity.User;
import com.im.util.DTOConverter;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FriendServiceImplTest {

    @Mock
    private FriendMapper friendMapper;
    @Mock
    private FriendRequestMapper friendRequestMapper;
    @Mock
    private UserMapper userMapper;
    @Mock
    private DTOConverter dtoConverter;
    @Mock
    private ImService imService;
    @Mock
    private KafkaTemplate<String, String> kafkaTemplate;

    @Test
    void getFriendList_shouldUseBatchUserQueryAndBatchOnlineQuery() {
        FriendServiceImpl service = new FriendServiceImpl(friendMapper, friendRequestMapper, userMapper, dtoConverter, imService, kafkaTemplate);
        Friend f1 = new Friend();
        f1.setFriendId(2L);
        Friend f2 = new Friend();
        f2.setFriendId(3L);
        when(friendMapper.selectList(any())).thenReturn(List.of(f1, f2));
        User u1 = new User();
        u1.setId(2L);
        u1.setUsername("u2");
        u1.setNickname("nick2");
        u1.setAvatar("a2");
        User u2 = new User();
        u2.setId(3L);
        u2.setUsername("u3");
        u2.setNickname("nick3");
        u2.setAvatar("a3");
        when(userMapper.selectBatchIds(any())).thenReturn(List.of(u1, u2));
        when(imService.checkUsersOnlineStatus(any())).thenReturn(Map.of("2", true, "3", false));

        List<FriendListDTO> result = service.getFriendList(1L);

        assertEquals(2, result.size());
        assertEquals("2", result.get(0).getFriendId());
        assertEquals("u2", result.get(0).getUsername());
        assertEquals("nick2", result.get(0).getNickname());
        assertEquals("a2", result.get(0).getAvatar());
        assertFalse(Boolean.TRUE.equals(result.get(1).getIsOnline()));
        verify(userMapper, times(1)).selectBatchIds(any());
        verify(imService, times(1)).checkUsersOnlineStatus(any());
        verify(userMapper, never()).selectById(any());
    }

    @Test
    void getFriendRequests_shouldUseBatchUserQuery() {
        FriendServiceImpl service = new FriendServiceImpl(friendMapper, friendRequestMapper, userMapper, dtoConverter, imService, kafkaTemplate);
        FriendRequest request = new FriendRequest();
        request.setId(10L);
        request.setApplicantId(2L);
        request.setTargetUserId(1L);
        when(friendRequestMapper.selectList(any())).thenReturn(List.of(request));
        User applicant = new User();
        applicant.setId(2L);
        User target = new User();
        target.setId(1L);
        when(userMapper.selectBatchIds(any())).thenReturn(List.of(applicant, target));
        FriendRequestDTO dto = FriendRequestDTO.builder().id("10").build();
        when(dtoConverter.toFriendRequestDTO(request, applicant, target)).thenReturn(dto);

        PageResult<FriendRequestDTO> page = service.getFriendRequests(1L, null, 20);

        assertEquals(1, page.getContent().size());
        verify(userMapper, times(1)).selectBatchIds(any());
        verify(userMapper, never()).selectById(any());
    }

    @Test
    void getBlockList_shouldFallbackOfflineWhenOnlineStatusNull() {
        FriendServiceImpl service = new FriendServiceImpl(friendMapper, friendRequestMapper, userMapper, dtoConverter, imService, kafkaTemplate);
        Friend blocked = new Friend();
        blocked.setFriendId(4L);
        when(friendMapper.selectList(any())).thenReturn(List.of(blocked));
        User user = new User();
        user.setId(4L);
        user.setUsername("u4");
        when(userMapper.selectBatchIds(any())).thenReturn(List.of(user));
        when(imService.checkUsersOnlineStatus(any())).thenReturn(null);

        List<FriendListDTO> list = service.getBlockList(1L);

        assertEquals(1, list.size());
        assertFalse(Boolean.TRUE.equals(list.get(0).getIsOnline()));
    }

    @Test
    void sendFriendRequest_ShouldFailIfTargetUserDoesNotExist() {
        FriendServiceImpl service = new FriendServiceImpl(friendMapper, friendRequestMapper, userMapper, dtoConverter, imService, kafkaTemplate);
        when(userMapper.selectCount(any())).thenReturn(0L);
        
        FriendRequestResponseDTO response = service.sendFriendRequest(1L, 2L, "hello");
        
        assertFalse(response.isSuccess());
        assertEquals("目标用户不存在", response.getMessage());
    }

    @Test
    void sendFriendRequest_ShouldFailIfAlreadyPending() {
        FriendServiceImpl service = new FriendServiceImpl(friendMapper, friendRequestMapper, userMapper, dtoConverter, imService, kafkaTemplate);
        when(userMapper.selectCount(any())).thenReturn(1L);
        when(friendMapper.selectCount(any())).thenReturn(0L); // Not friends
        
        // Mock dual direction pending check
        when(friendRequestMapper.selectCount(any())).thenReturn(1L); // Has pending
        
        FriendRequestResponseDTO response = service.sendFriendRequest(1L, 2L, "hello");
        
        assertFalse(response.isSuccess());
        assertEquals("已有待处理的好友申请", response.getMessage());
        verify(friendRequestMapper, never()).insert(any(FriendRequest.class));
    }

    @Test
    void sendFriendRequest_ShouldSuccessAndSendSystemNotice() {
        FriendServiceImpl service = new FriendServiceImpl(friendMapper, friendRequestMapper, userMapper, dtoConverter, imService, kafkaTemplate);
        when(userMapper.selectCount(any())).thenReturn(1L);
        when(friendMapper.selectCount(any())).thenReturn(0L); // Not friends
        
        // No pending requests
        when(friendRequestMapper.selectCount(any())).thenReturn(0L);
        
        when(friendRequestMapper.insert(any(FriendRequest.class))).thenReturn(1);
        
        FriendRequestResponseDTO response = service.sendFriendRequest(1L, 2L, "hello");
        
        assertTrue(response.isSuccess());
        assertEquals("好友申请发送成功", response.getMessage());
        
        // Verify bidirectional system notice
        verify(imService, times(2)).sendSystemMessage(anyLong(), any());
    }

    @Test
    void acceptFriendRequest_ShouldPublishFriendInvalidationEvent() {
        FriendServiceImpl service = new FriendServiceImpl(friendMapper, friendRequestMapper, userMapper, dtoConverter, imService, kafkaTemplate);
        FriendRequest request = new FriendRequest();
        request.setId(10L);
        request.setApplicantId(2L);
        request.setTargetUserId(1L);
        request.setStatus(0);
        when(friendRequestMapper.selectById(10L)).thenReturn(request);

        FriendRequestResponseDTO response = service.acceptFriendRequest(1L, 10L);

        assertTrue(response.isSuccess());
        ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(eq("im-authz-cache-invalidation-topic"), eq("friend:1:2"), payloadCaptor.capture());
        assertTrue(payloadCaptor.getValue().contains("\"scope\":\"FRIEND_RELATION\""));
        assertTrue(payloadCaptor.getValue().contains("\"changeType\":\"ADD\""));
        assertTrue(payloadCaptor.getValue().contains("\"userIds\":[1,2]"));
    }

    @Test
    void removeFriend_ShouldPublishFriendInvalidationEvent() {
        FriendServiceImpl service = new FriendServiceImpl(friendMapper, friendRequestMapper, userMapper, dtoConverter, imService, kafkaTemplate);
        when(friendMapper.selectCount(any())).thenReturn(1L);

        FriendRequestResponseDTO response = service.removeFriend(1L, 2L);

        assertTrue(response.isSuccess());
        ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(eq("im-authz-cache-invalidation-topic"), eq("friend:1:2"), payloadCaptor.capture());
        assertTrue(payloadCaptor.getValue().contains("\"changeType\":\"DELETE\""));
    }

    @Test
    void blockUser_ShouldPublishFriendInvalidationEvent() {
        FriendServiceImpl service = new FriendServiceImpl(friendMapper, friendRequestMapper, userMapper, dtoConverter, imService, kafkaTemplate);
        when(friendMapper.selectOne(any())).thenReturn(null);

        FriendRequestResponseDTO response = service.blockUser(1L, 2L);

        assertTrue(response.isSuccess());
        ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(eq("im-authz-cache-invalidation-topic"), eq("friend:1:2"), payloadCaptor.capture());
        assertTrue(payloadCaptor.getValue().contains("\"changeType\":\"BLOCK\""));
    }
}
