package com.im.service.support;

import com.im.dto.UserDTO;
import com.im.feign.GroupServiceFeignClient;
import com.im.feign.UserServiceFeignClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Arrays;
import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserProfileCacheTest {

    @Mock
    private RedisTemplate<String, Object> redisTemplate;
    @Mock
    private ValueOperations<String, Object> valueOperations;
    @Mock
    private UserServiceFeignClient userServiceFeignClient;
    @Mock
    private GroupServiceFeignClient groupServiceFeignClient;

    private UserProfileCache cache;

    @BeforeEach
    void setUp() {
        cache = new UserProfileCache(redisTemplate, userServiceFeignClient, groupServiceFeignClient);
        ReflectionTestUtils.setField(cache, "userCacheKeyPrefix", "user:brief:");
        ReflectionTestUtils.setField(cache, "userCacheTtlMinutes", 10L);
        ReflectionTestUtils.setField(cache, "userCacheL1TtlSeconds", 60L);
        ReflectionTestUtils.setField(cache, "userCacheL1MaxSize", 10_000L);
        ReflectionTestUtils.setField(cache, "friendCacheKeyPrefix", "message:friend:");
        ReflectionTestUtils.setField(cache, "friendCacheL1TtlSeconds", 30L);
        ReflectionTestUtils.setField(cache, "friendCacheL2TtlSeconds", 60L);
        ReflectionTestUtils.setField(cache, "friendCacheL1MaxSize", 20_000L);
        ReflectionTestUtils.setField(cache, "groupMemberCacheKeyPrefix", "message:group:member:");
        ReflectionTestUtils.setField(cache, "groupMemberCacheL1TtlSeconds", 30L);
        ReflectionTestUtils.setField(cache, "groupMemberCacheL2TtlSeconds", 60L);
        ReflectionTestUtils.setField(cache, "groupMemberCacheL1MaxSize", 30_000L);
        ReflectionTestUtils.setField(cache, "groupMemberIdsCacheKeyPrefix", "message:group:members:");
        ReflectionTestUtils.setField(cache, "groupMemberIdsCacheL1TtlSeconds", 15L);
        ReflectionTestUtils.setField(cache, "groupMemberIdsCacheL2TtlSeconds", 30L);
        ReflectionTestUtils.setField(cache, "groupMemberIdsCacheL1MaxSize", 5_000L);
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        cache.initCaches();
    }

    @Test
    void getUser_ShouldUseL1AfterFirstLoad() {
        UserDTO user = user(1L, "alice");
        when(valueOperations.get("user:brief:1")).thenReturn(null);
        when(userServiceFeignClient.getUser(1L)).thenReturn(user);

        assertEquals(user, cache.getUser(1L));
        clearInvocations(valueOperations, userServiceFeignClient);

        assertEquals(user, cache.getUser(1L));

        verifyNoInteractions(valueOperations, userServiceFeignClient);
    }

    @Test
    void getUser_ShouldBackfillL1FromL2() {
        UserDTO user = user(1L, "alice");
        when(valueOperations.get("user:brief:1")).thenReturn(user);

        assertEquals(user, cache.getUser(1L));
        verify(valueOperations).get("user:brief:1");
        verify(userServiceFeignClient, never()).getUser(anyLong());

        clearInvocations(valueOperations, userServiceFeignClient);
        assertEquals(user, cache.getUser(1L));
        verifyNoInteractions(valueOperations, userServiceFeignClient);
    }

    @Test
    void getUser_ShouldLoadFeignAndBackfillCachesOnMiss() {
        UserDTO user = user(1L, "alice");
        when(valueOperations.get("user:brief:1")).thenReturn(null);
        when(userServiceFeignClient.getUser(1L)).thenReturn(user);

        assertEquals(user, cache.getUser(1L));

        verify(userServiceFeignClient).getUser(1L);
        verify(valueOperations).set("user:brief:1", user, 10L, TimeUnit.MINUTES);
    }

    @Test
    void getUser_ShouldFallbackToFeignWhenRedisFails() {
        UserDTO user = user(1L, "alice");
        when(valueOperations.get("user:brief:1")).thenThrow(new RuntimeException("redis down"));
        when(userServiceFeignClient.getUser(1L)).thenReturn(user);

        assertEquals(user, cache.getUser(1L));

        verify(userServiceFeignClient).getUser(1L);
    }

    @Test
    void isFriend_ShouldUseL2AndBackfillL1() {
        when(valueOperations.get("message:friend:1:2")).thenReturn(Boolean.TRUE);

        assertTrue(cache.isFriend(1L, 2L));
        verify(userServiceFeignClient, never()).isFriend(anyLong(), anyLong());

        clearInvocations(valueOperations, userServiceFeignClient);
        assertTrue(cache.isFriend(1L, 2L));
        verifyNoInteractions(valueOperations, userServiceFeignClient);
    }

    @Test
    void isFriend_ShouldLoadFeignAndCacheFalseOnMiss() {
        when(valueOperations.get("message:friend:1:2")).thenReturn(null);
        when(userServiceFeignClient.isFriend(1L, 2L)).thenReturn(false);

        assertFalse(cache.isFriend(1L, 2L));

        verify(userServiceFeignClient).isFriend(1L, 2L);
        verify(valueOperations).set("message:friend:1:2", false, 60L, TimeUnit.SECONDS);
    }

    @Test
    void friendInvalidation_ShouldEvictCachesAndRefetchAuthoritativeRelationImmediately() {
        when(valueOperations.get("message:friend:1:2")).thenReturn(Boolean.TRUE, null);
        when(userServiceFeignClient.isFriend(1L, 2L)).thenReturn(false);

        assertTrue(cache.isFriend(1L, 2L));
        clearInvocations(redisTemplate, valueOperations, userServiceFeignClient);

        cache.onAuthorizationCacheInvalidation("""
                {"scope":"FRIEND_RELATION","changeType":"DELETE","userIds":[1,2]}
                """);

        assertFalse(cache.isFriend(1L, 2L));
        verify(redisTemplate).delete("message:friend:1:2");
        verify(redisTemplate).delete("message:friend:2:1");
        verify(userServiceFeignClient).isFriend(1L, 2L);
    }

    @Test
    void isGroupMember_ShouldLoadFeignAndBackfillCachesOnMiss() {
        when(valueOperations.get("message:group:member:8:1")).thenReturn(null);
        when(groupServiceFeignClient.isMember(8L, 1L)).thenReturn(true);

        assertTrue(cache.isGroupMember(8L, 1L));

        verify(groupServiceFeignClient).isMember(8L, 1L);
        verify(valueOperations).set("message:group:member:8:1", true, 60L, TimeUnit.SECONDS);
    }

    @Test
    void getGroupMemberIds_ShouldConvertRedisListAndBackfillL1() {
        when(valueOperations.get("message:group:members:8"))
                .thenReturn(Arrays.asList(1, "2", 3L, "bad", null));

        assertEquals(List.of(1L, 2L, 3L), cache.getGroupMemberIds(8L));
        verify(groupServiceFeignClient, never()).memberIds(anyLong());

        clearInvocations(valueOperations, groupServiceFeignClient);
        assertEquals(List.of(1L, 2L, 3L), cache.getGroupMemberIds(8L));
        verifyNoInteractions(valueOperations, groupServiceFeignClient);
    }

    @Test
    void getGroupMemberIds_ShouldLoadFeignAndBackfillCachesOnMiss() {
        when(valueOperations.get("message:group:members:8")).thenReturn(null);
        when(groupServiceFeignClient.memberIds(8L)).thenReturn(List.of(1L, 2L, 3L));

        assertEquals(List.of(1L, 2L, 3L), cache.getGroupMemberIds(8L));

        verify(groupServiceFeignClient).memberIds(8L);
        verify(valueOperations).set(eq("message:group:members:8"), eq(List.of(1L, 2L, 3L)),
                eq(30L), eq(TimeUnit.SECONDS));
    }

    @Test
    void groupMembershipInvalidation_ShouldEvictMemberCachesAndRefetchAuthoritativeList() {
        when(valueOperations.get("message:group:members:8")).thenReturn(List.of(1L, 2L, 3L), null);
        when(groupServiceFeignClient.memberIds(8L)).thenReturn(List.of(1L, 3L));

        assertEquals(List.of(1L, 2L, 3L), cache.getGroupMemberIds(8L));
        clearInvocations(redisTemplate, valueOperations, groupServiceFeignClient);

        cache.onAuthorizationCacheInvalidation("""
                {"scope":"GROUP_MEMBERSHIP","changeType":"KICK","groupId":8,"userIds":[2]}
                """);

        assertEquals(List.of(1L, 3L), cache.getGroupMemberIds(8L));
        verify(redisTemplate).delete("message:group:members:8");
        verify(redisTemplate).delete("message:group:member:8:2");
        verify(groupServiceFeignClient).memberIds(8L);
    }

    @Test
    void duplicateInvalidation_ShouldBeIdempotent() {
        String payload = """
                {"scope":"FRIEND_RELATION","changeType":"DELETE","userIds":[1,2]}
                """;

        assertDoesNotThrow(() -> cache.onAuthorizationCacheInvalidation(payload));
        assertDoesNotThrow(() -> cache.onAuthorizationCacheInvalidation(payload));

        verify(redisTemplate, times(2)).delete("message:friend:1:2");
        verify(redisTemplate, times(2)).delete("message:friend:2:1");
    }

    private UserDTO user(Long id, String username) {
        return UserDTO.builder()
                .id(String.valueOf(id))
                .username(username)
                .nickname(username)
                .avatar("avatar-" + id)
                .build();
    }
}
