package com.im.service;

import com.im.dto.AuthUserResourceDTO;
import com.im.dto.TokenPairDTO;
import com.im.dto.WsTicketConsumeResultDTO;
import com.im.dto.WsTicketDTO;
import com.im.dto.request.RefreshTokenRequest;
import com.im.metrics.AuthServiceMetrics;
import com.im.util.TokenParser;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthTokenServiceTest {

    @Mock
    private StringRedisTemplate stringRedisTemplate;
    @Mock
    private AuthUserResourceService authUserResourceService;
    @Mock
    private TokenParser tokenParser;
    @Mock
    private ValueOperations<String, String> valueOperations;

    private AuthTokenService service;
    private SimpleMeterRegistry meterRegistry;

    @BeforeEach
    void setUp() {
        service = new AuthTokenService(stringRedisTemplate, authUserResourceService, tokenParser);
        meterRegistry = new SimpleMeterRegistry();
        ReflectionTestUtils.setField(service, "metrics", new AuthServiceMetrics(meterRegistry));
        ReflectionTestUtils.setField(service, "accessSecret", "access-secret-access-secret-access-secret-access-secret-2026");
        ReflectionTestUtils.setField(service, "refreshSecret", "refresh-secret-refresh-secret-refresh-secret-refresh-2026");
        ReflectionTestUtils.setField(service, "accessExpirationMs", 60000L);
        ReflectionTestUtils.setField(service, "refreshExpirationMs", 120000L);
        ReflectionTestUtils.setField(service, "previousRefreshGraceSeconds", 1L);
        ReflectionTestUtils.setField(service, "refreshLockSeconds", 1L);
        lenient().when(stringRedisTemplate.opsForValue()).thenReturn(valueOperations);
        lenient().when(valueOperations.setIfAbsent(anyString(), anyString(), any(Duration.class))).thenReturn(true);
    }

    @Test
    void refreshShouldIssueTokenPairWhenInputValid() {
        TokenParser.TokenParseInfo refreshInfo = validRefreshInfo(1001L, "alice", "jti-1");
        when(tokenParser.parseRefreshToken("refresh-token")).thenReturn(refreshInfo);
        when(valueOperations.get("auth:refresh:jti:1001")).thenReturn("jti-1");

        RefreshTokenRequest request = new RefreshTokenRequest();
        request.setRefreshToken("refresh-token");

        TokenPairDTO result = service.refresh(request);

        assertNotNull(result.getAccessToken());
        assertNotNull(result.getRefreshToken());
        assertEquals(60000L, result.getExpiresInMs());
        assertEquals(120000L, result.getRefreshExpiresInMs());
        verify(stringRedisTemplate).execute(
                any(RedisScript.class),
                eq(List.of("auth:refresh:jti:1001", "auth:refresh:previous:1001:jti-1")),
                anyString(),
                anyString(),
                anyString(),
                anyString()
        );
        verify(authUserResourceService).getOrLoad(1001L);
    }

    @Test
    void refreshShouldRejectWhenStoredJtiMismatch() {
        TokenParser.TokenParseInfo refreshInfo = validRefreshInfo(1002L, "bob", "jti-current");
        when(tokenParser.parseRefreshToken("refresh-token")).thenReturn(refreshInfo);
        when(valueOperations.get("auth:refresh:jti:1002")).thenReturn("jti-old");

        RefreshTokenRequest request = new RefreshTokenRequest();
        request.setRefreshToken("refresh-token");

        SecurityException ex = assertThrows(SecurityException.class, () -> service.refresh(request));
        assertEquals("refreshToken已失效", ex.getMessage());
    }

    @Test
    void refreshShouldRejectWhenAccessTokenNotMatchRefreshToken() {
        TokenParser.TokenParseInfo refreshInfo = validRefreshInfo(1003L, "charlie", "jti-3");
        TokenParser.TokenParseInfo accessInfo = new TokenParser.TokenParseInfo();
        accessInfo.setUserId(9999L);
        when(tokenParser.parseRefreshToken("refresh-token")).thenReturn(refreshInfo);
        when(tokenParser.parseAccessToken("access-token")).thenReturn(accessInfo);

        RefreshTokenRequest request = new RefreshTokenRequest();
        request.setRefreshToken("refresh-token");
        request.setAccessToken("access-token");

        SecurityException ex = assertThrows(SecurityException.class, () -> service.refresh(request));
        assertEquals("accessToken与refreshToken不匹配", ex.getMessage());
    }

    @Test
    void refreshShouldRejectWhenRequestInvalid() {
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> service.refresh(null));
        assertEquals("refreshToken不能为空", ex.getMessage());
    }

    @Test
    void refreshShouldReturnPreviousGraceResultWhenOldJtiRepeated() {
        TokenParser.TokenParseInfo refreshInfo = validRefreshInfo(1008L, "grace", "old-jti");
        when(tokenParser.parseRefreshToken("refresh-token")).thenReturn(refreshInfo);
        when(valueOperations.get("auth:refresh:jti:1008")).thenReturn("new-jti");
        when(valueOperations.get("auth:refresh:previous:1008:old-jti"))
                .thenReturn("access-again\nrefresh-again\n60000\n120000");

        RefreshTokenRequest request = new RefreshTokenRequest();
        request.setRefreshToken("refresh-token");

        TokenPairDTO result = service.refresh(request);

        assertEquals("access-again", result.getAccessToken());
        assertEquals("refresh-again", result.getRefreshToken());
    }

    @Test
    void refreshShouldWaitForPreviousGraceResultWhenConcurrentLockHeld() {
        TokenParser.TokenParseInfo refreshInfo = validRefreshInfo(1009L, "locked", "old-jti");
        when(tokenParser.parseRefreshToken("refresh-token")).thenReturn(refreshInfo);
        when(valueOperations.get("auth:refresh:jti:1009")).thenReturn("old-jti");
        when(valueOperations.setIfAbsent(anyString(), anyString(), any(Duration.class))).thenReturn(false);
        when(valueOperations.get("auth:refresh:previous:1009:old-jti"))
                .thenReturn("access-shared\nrefresh-shared\n60000\n120000");

        RefreshTokenRequest request = new RefreshTokenRequest();
        request.setRefreshToken("refresh-token");

        TokenPairDTO result = service.refresh(request);

        assertEquals("access-shared", result.getAccessToken());
        assertEquals("refresh-shared", result.getRefreshToken());
    }

    @Test
    void refreshShouldReuseConcurrentRotateResult() throws Exception {
        TokenParser.TokenParseInfo refreshInfo = validRefreshInfo(1010L, "concurrent", "old-jti");
        when(tokenParser.parseRefreshToken("refresh-token")).thenReturn(refreshInfo);

        AtomicReference<String> currentJti = new AtomicReference<>("old-jti");
        AtomicReference<String> previousPayload = new AtomicReference<>();
        AtomicReference<String> lockOwner = new AtomicReference<>();
        AtomicInteger rotateCount = new AtomicInteger();
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(2);
        CountDownLatch followerContending = new CountDownLatch(1);
        AtomicReference<TokenPairDTO> firstResult = new AtomicReference<>();
        AtomicReference<TokenPairDTO> secondResult = new AtomicReference<>();
        AtomicReference<Throwable> firstFailure = new AtomicReference<>();
        AtomicReference<Throwable> secondFailure = new AtomicReference<>();

        when(valueOperations.get(anyString())).thenAnswer(invocation -> {
            String key = invocation.getArgument(0);
            if ("auth:refresh:jti:1010".equals(key)) {
                return currentJti.get();
            }
            if ("auth:refresh:previous:1010:old-jti".equals(key)) {
                return previousPayload.get();
            }
            if ("auth:refresh:lock:1010:old-jti".equals(key)) {
                return lockOwner.get();
            }
            return null;
        });
        when(valueOperations.setIfAbsent(eq("auth:refresh:lock:1010:old-jti"), anyString(), any(Duration.class)))
                .thenAnswer(invocation -> {
                    String requestedOwner = invocation.getArgument(1);
                    if (lockOwner.compareAndSet(null, requestedOwner)) {
                        return true;
                    }
                    followerContending.countDown();
                    return false;
                });
        when(stringRedisTemplate.execute(
                any(RedisScript.class),
                eq(List.of("auth:refresh:jti:1010", "auth:refresh:previous:1010:old-jti")),
                anyString(),
                anyString(),
                anyString(),
                anyString()
        )).thenAnswer(invocation -> {
            rotateCount.incrementAndGet();
            assertTrue(followerContending.await(1, TimeUnit.SECONDS));
            currentJti.set(invocation.getArgument(2));
            previousPayload.set(invocation.getArgument(4));
            return 1L;
        });
        when(stringRedisTemplate.execute(
                any(RedisScript.class),
                eq(List.of("auth:refresh:lock:1010:old-jti")),
                anyString()
        )).thenAnswer(invocation -> {
            String releasingOwner = invocation.getArgument(2);
            if (releasingOwner.equals(lockOwner.get())) {
                lockOwner.set(null);
                return 1L;
            }
            return 0L;
        });

        RefreshTokenRequest request = new RefreshTokenRequest();
        request.setRefreshToken("refresh-token");

        Thread first = refreshOnThread(request, ready, start, done, firstResult, firstFailure);
        Thread second = refreshOnThread(request, ready, start, done, secondResult, secondFailure);
        first.start();
        second.start();

        assertTrue(ready.await(1, TimeUnit.SECONDS));
        start.countDown();
        assertTrue(done.await(3, TimeUnit.SECONDS));
        first.join(3000L);
        second.join(3000L);

        assertNull(firstFailure.get());
        assertNull(secondFailure.get());
        assertNotNull(firstResult.get());
        assertNotNull(secondResult.get());
        assertEquals(1, rotateCount.get());
        assertEquals(firstResult.get().getAccessToken(), secondResult.get().getAccessToken());
        assertEquals(firstResult.get().getRefreshToken(), secondResult.get().getRefreshToken());
    }

    @Test
    void refreshShouldRecoverWhenLeadingRotateFails() throws Exception {
        TokenParser.TokenParseInfo refreshInfo = validRefreshInfo(1011L, "recover", "old-jti");
        when(tokenParser.parseRefreshToken("refresh-token")).thenReturn(refreshInfo);

        AtomicReference<String> currentJti = new AtomicReference<>("old-jti");
        AtomicReference<String> previousPayload = new AtomicReference<>();
        AtomicReference<String> lockOwner = new AtomicReference<>();
        AtomicInteger rotateCount = new AtomicInteger();
        AtomicInteger resourceLoads = new AtomicInteger();
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(2);
        CountDownLatch followerContending = new CountDownLatch(1);
        AtomicReference<TokenPairDTO> firstResult = new AtomicReference<>();
        AtomicReference<TokenPairDTO> secondResult = new AtomicReference<>();
        AtomicReference<Throwable> firstFailure = new AtomicReference<>();
        AtomicReference<Throwable> secondFailure = new AtomicReference<>();

        when(valueOperations.get(anyString())).thenAnswer(invocation -> {
            String key = invocation.getArgument(0);
            if ("auth:refresh:jti:1011".equals(key)) {
                return currentJti.get();
            }
            if ("auth:refresh:previous:1011:old-jti".equals(key)) {
                return previousPayload.get();
            }
            if ("auth:refresh:lock:1011:old-jti".equals(key)) {
                return lockOwner.get();
            }
            return null;
        });
        when(valueOperations.setIfAbsent(eq("auth:refresh:lock:1011:old-jti"), anyString(), any(Duration.class)))
                .thenAnswer(invocation -> {
                    String requestedOwner = invocation.getArgument(1);
                    if (lockOwner.compareAndSet(null, requestedOwner)) {
                        return true;
                    }
                    followerContending.countDown();
                    return false;
                });
        when(authUserResourceService.getOrLoad(1011L)).thenAnswer(invocation -> {
            if (resourceLoads.getAndIncrement() == 0) {
                assertTrue(followerContending.await(1, TimeUnit.SECONDS));
                throw new IllegalStateException("warm failed");
            }
            return null;
        });
        when(stringRedisTemplate.execute(
                any(RedisScript.class),
                eq(List.of("auth:refresh:jti:1011", "auth:refresh:previous:1011:old-jti")),
                anyString(),
                anyString(),
                anyString(),
                anyString()
        )).thenAnswer(invocation -> {
            rotateCount.incrementAndGet();
            currentJti.set(invocation.getArgument(2));
            previousPayload.set(invocation.getArgument(4));
            return 1L;
        });
        when(stringRedisTemplate.execute(
                any(RedisScript.class),
                eq(List.of("auth:refresh:lock:1011:old-jti")),
                anyString()
        )).thenAnswer(invocation -> {
            String releasingOwner = invocation.getArgument(2);
            if (releasingOwner.equals(lockOwner.get())) {
                lockOwner.set(null);
                return 1L;
            }
            return 0L;
        });

        RefreshTokenRequest request = new RefreshTokenRequest();
        request.setRefreshToken("refresh-token");

        Thread first = refreshOnThread(request, ready, start, done, firstResult, firstFailure);
        Thread second = refreshOnThread(request, ready, start, done, secondResult, secondFailure);
        first.start();
        second.start();

        assertTrue(ready.await(1, TimeUnit.SECONDS));
        start.countDown();
        assertTrue(done.await(3, TimeUnit.SECONDS));
        first.join(3000L);
        second.join(3000L);

        Throwable failed = firstFailure.get() != null ? firstFailure.get() : secondFailure.get();
        TokenPairDTO succeeded = firstResult.get() != null ? firstResult.get() : secondResult.get();
        assertTrue(failed instanceof IllegalStateException);
        assertNotNull(succeeded);
        assertEquals(1, rotateCount.get());
    }

    @Test
    void refreshShouldPersistPreviousResultLongEnoughForLockWindow() {
        ReflectionTestUtils.setField(service, "previousRefreshGraceSeconds", 1L);
        ReflectionTestUtils.setField(service, "refreshLockSeconds", 5L);

        TokenParser.TokenParseInfo refreshInfo = validRefreshInfo(1012L, "ttl", "old-jti");
        AtomicReference<String> previousResultTtlMs = new AtomicReference<>();
        when(tokenParser.parseRefreshToken("refresh-token")).thenReturn(refreshInfo);
        when(valueOperations.get("auth:refresh:jti:1012")).thenReturn("old-jti");
        when(stringRedisTemplate.execute(
                any(RedisScript.class),
                eq(List.of("auth:refresh:jti:1012", "auth:refresh:previous:1012:old-jti")),
                anyString(),
                anyString(),
                anyString(),
                anyString()
        )).thenAnswer(invocation -> {
            previousResultTtlMs.set(invocation.getArgument(5));
            return 1L;
        });

        RefreshTokenRequest request = new RefreshTokenRequest();
        request.setRefreshToken("refresh-token");

        TokenPairDTO result = service.refresh(request);

        assertNotNull(result.getAccessToken());
        assertNotNull(result.getRefreshToken());
        assertEquals("5000", previousResultTtlMs.get());
    }

    @Test
    void issueWsTicket_ShouldPersistOneTimeTicket() {
        ReflectionTestUtils.setField(service, "wsTicketTtlSeconds", 30L);

        WsTicketDTO result = service.issueWsTicket(1004L, "dora");

        assertNotNull(result.getTicket());
        assertEquals(30000L, result.getExpiresInMs());
        verify(valueOperations).set(eq("auth:ws:ticket:" + result.getTicket()), eq("1004\ndora"), any(Duration.class));
    }

    @Test
    void issueWsTicket_ShouldFallbackUsernameFromUserInfo() {
        ReflectionTestUtils.setField(service, "wsTicketTtlSeconds", 30L);
        AuthUserResourceDTO resource = new AuthUserResourceDTO();
        resource.setUserId(1007L);
        HashMap<String, Object> userInfo = new HashMap<>();
        userInfo.put("username", "cached-user");
        resource.setUserInfo(userInfo);
        when(authUserResourceService.getOrLoad(1007L)).thenReturn(resource);

        WsTicketDTO result = service.issueWsTicket(1007L, " ");

        verify(valueOperations).set(eq("auth:ws:ticket:" + result.getTicket()), eq("1007\ncached-user"), any(Duration.class));
    }

    @Test
    void consumeWsTicket_ShouldReturnAuthoritativeIdentityStoredWhenIssued() {
        ReflectionTestUtils.setField(service, "wsTicketTtlSeconds", 30L);
        ArgumentCaptor<String> keyCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> valueCaptor = ArgumentCaptor.forClass(String.class);

        WsTicketDTO issued = service.issueWsTicket(1005L, "erin");

        verify(valueOperations).set(keyCaptor.capture(), valueCaptor.capture(), any(Duration.class));
        when(stringRedisTemplate.execute(any(RedisScript.class), eq(List.of(keyCaptor.getValue()))))
                .thenReturn(valueCaptor.getValue());

        WsTicketConsumeResultDTO result = service.consumeWsTicket(issued.getTicket(), 1005L);

        assertTrue(result.isValid());
        assertEquals(WsTicketConsumeResultDTO.STATUS_VALID, result.getStatus());
        assertEquals(1005L, result.getUserId());
        assertEquals("erin", result.getUsername());
    }

    @Test
    void consumeWsTicket_ShouldOnlyConsumeOnceSequentially() {
        AtomicReference<String> storedPayload = new AtomicReference<>("1005\nerin");
        when(stringRedisTemplate.execute(any(RedisScript.class), eq(List.of("auth:ws:ticket:ticket-once"))))
                .thenAnswer(invocation -> storedPayload.getAndSet(null));

        WsTicketConsumeResultDTO first = service.consumeWsTicket("ticket-once", 1005L);
        WsTicketConsumeResultDTO second = service.consumeWsTicket("ticket-once", 1005L);

        assertTrue(first.isValid());
        assertEquals(WsTicketConsumeResultDTO.STATUS_VALID, first.getStatus());
        assertEquals(1005L, first.getUserId());
        assertEquals("erin", first.getUsername());
        assertFalse(second.isValid());
        assertEquals(WsTicketConsumeResultDTO.STATUS_INVALID, second.getStatus());
        assertNotNull(second.getError());
        assertNull(second.getUserId());
        assertNull(second.getUsername());
    }

    @Test
    void consumeWsTicket_ShouldOnlyAllowOneConcurrentSuccess() throws Exception {
        AtomicReference<String> storedPayload = new AtomicReference<>("1005\nerin");
        when(stringRedisTemplate.execute(any(RedisScript.class), eq(List.of("auth:ws:ticket:ticket-concurrent"))))
                .thenAnswer(invocation -> storedPayload.getAndSet(null));

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(2);
        AtomicReference<WsTicketConsumeResultDTO> firstResult = new AtomicReference<>();
        AtomicReference<WsTicketConsumeResultDTO> secondResult = new AtomicReference<>();

        Thread first = consumeOnThread("ticket-concurrent", 1005L, ready, start, done, firstResult);
        Thread second = consumeOnThread("ticket-concurrent", 1005L, ready, start, done, secondResult);
        first.start();
        second.start();

        assertTrue(ready.await(1, TimeUnit.SECONDS));
        start.countDown();
        assertTrue(done.await(2, TimeUnit.SECONDS));
        first.join(2000L);
        second.join(2000L);

        WsTicketConsumeResultDTO left = firstResult.get();
        WsTicketConsumeResultDTO right = secondResult.get();
        assertNotNull(left);
        assertNotNull(right);

        int validCount = (left.isValid() ? 1 : 0) + (right.isValid() ? 1 : 0);
        assertEquals(1, validCount);

        WsTicketConsumeResultDTO validResult = left.isValid() ? left : right;
        WsTicketConsumeResultDTO invalidResult = left.isValid() ? right : left;
        assertEquals(WsTicketConsumeResultDTO.STATUS_VALID, validResult.getStatus());
        assertEquals(1005L, validResult.getUserId());
        assertEquals("erin", validResult.getUsername());
        assertEquals(WsTicketConsumeResultDTO.STATUS_INVALID, invalidResult.getStatus());
        assertEquals(1.0, wsTicketConsumeCount("success"));
        assertEquals(1.0, wsTicketConsumeCount("expired_or_missing"));
    }

    @Test
    void consumeWsTicket_ShouldReturnInvalidWhenTicketMissingOrExpired() {
        when(stringRedisTemplate.execute(any(RedisScript.class), eq(List.of("auth:ws:ticket:ticket-missing"))))
                .thenReturn(null);

        WsTicketConsumeResultDTO result = service.consumeWsTicket("ticket-missing", 1005L);

        assertFalse(result.isValid());
        assertEquals(WsTicketConsumeResultDTO.STATUS_INVALID, result.getStatus());
        assertNotNull(result.getError());
        assertNull(result.getUserId());
        assertNull(result.getUsername());
        assertEquals(1.0, wsTicketConsumeCount("expired_or_missing"));
    }

    @Test
    void consumeWsTicket_ShouldReturnAuthoritativeIdentityOnUserMismatch() {
        when(stringRedisTemplate.execute(any(RedisScript.class), eq(List.of("auth:ws:ticket:ticket-2"))))
                .thenReturn("1006\nfrank");

        WsTicketConsumeResultDTO result = service.consumeWsTicket("ticket-2", 2000L);

        assertFalse(result.isValid());
        assertEquals(WsTicketConsumeResultDTO.STATUS_USER_MISMATCH, result.getStatus());
        assertEquals(1006L, result.getUserId());
        assertEquals("frank", result.getUsername());
        assertNotNull(result.getError());
    }

    private Thread refreshOnThread(
            RefreshTokenRequest request,
            CountDownLatch ready,
            CountDownLatch start,
            CountDownLatch done,
            AtomicReference<TokenPairDTO> resultRef,
            AtomicReference<Throwable> failureRef
    ) {
        return new Thread(() -> {
            try {
                ready.countDown();
                awaitLatch(start);
                resultRef.set(service.refresh(request));
            } catch (Throwable ex) {
                failureRef.set(ex);
            } finally {
                done.countDown();
            }
        });
    }

    private Thread consumeOnThread(
            String ticket,
            Long expectedUserId,
            CountDownLatch ready,
            CountDownLatch start,
            CountDownLatch done,
            AtomicReference<WsTicketConsumeResultDTO> resultRef
    ) {
        return new Thread(() -> {
            try {
                ready.countDown();
                awaitLatch(start);
                resultRef.set(service.consumeWsTicket(ticket, expectedUserId));
            } finally {
                done.countDown();
            }
        });
    }

    private void awaitLatch(CountDownLatch latch) {
        try {
            if (!latch.await(2, TimeUnit.SECONDS)) {
                fail("Timed out waiting for latch");
            }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            fail(ex);
        }
    }

    private TokenParser.TokenParseInfo validRefreshInfo(Long userId, String username, String jti) {
        TokenParser.TokenParseInfo info = new TokenParser.TokenParseInfo();
        info.setValid(true);
        info.setExpired(false);
        info.setTokenType("refresh");
        info.setUserId(userId);
        info.setUsername(username);
        info.setJti(jti);
        return info;
    }

    private double wsTicketConsumeCount(String result) {
        return meterRegistry.counter("ws_ticket_consume_results", "result", result).count();
    }
}
