package com.im.gateway.ratelimit;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Flux;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.lenient;

@ExtendWith(MockitoExtension.class)
class GatewayRedisRateLimitServiceTest {

    @Mock
    private ReactiveStringRedisTemplate redisTemplate;

    private FakeConcurrencyRedis fakeRedis;
    private GatewayRedisRateLimitService service;

    @BeforeEach
    void setUp() {
        fakeRedis = new FakeConcurrencyRedis();
        service = new GatewayRedisRateLimitService(redisTemplate, new SimpleMeterRegistry());
        lenient().doAnswer(invocation -> executeScript(invocation.getArgument(0), invocation.getArgument(1), invocation.getArgument(2)))
                .when(redisTemplate)
                .execute(any(RedisScript.class), anyList(), anyList());
    }

    @Test
    void lateReleaseShouldNotRemoveNewPermitAfterLeaseExpires() throws Exception {
        GatewayRateLimitProperties properties = propertiesWithConcurrencyRule("lease-rule", 1, 1);

        GatewayRedisRateLimitService.GatewayRateLimitEvaluation requestA =
                service.evaluate(exchange("/api/messages"), properties).block();
        assertNotNull(requestA);
        assertFalse(requestA.rejected());
        GatewayRedisRateLimitService.ConcurrencyPermit permitA = requestA.permits().get(0);
        assertNotNull(permitA.permitId());
        assertFalse(permitA.permitId().isBlank());

        Thread.sleep(1_200L);

        GatewayRedisRateLimitService.GatewayRateLimitEvaluation requestB =
                service.evaluate(exchange("/api/messages"), properties).block();
        assertNotNull(requestB);
        assertFalse(requestB.rejected());
        GatewayRedisRateLimitService.ConcurrencyPermit permitB = requestB.permits().get(0);
        assertNotEquals(permitA.permitId(), permitB.permitId());
        assertEquals(Set.of(permitB.permitId()), fakeRedis.activePermitIds(permitB.key(), System.currentTimeMillis()));

        requestA.releaseAll().block();

        assertEquals(Set.of(permitB.permitId()), fakeRedis.activePermitIds(permitB.key(), System.currentTimeMillis()));

        requestB.releaseAll().block();
        assertTrue(fakeRedis.activePermitIds(permitB.key(), System.currentTimeMillis()).isEmpty());
    }

    @Test
    void shouldRejectWhenMaxConcurrencyReached() {
        GatewayRateLimitProperties properties = propertiesWithConcurrencyRule("threshold-rule", 1, 5);

        GatewayRedisRateLimitService.GatewayRateLimitEvaluation first =
                service.evaluate(exchange("/api/rooms"), properties).block();
        assertNotNull(first);
        assertFalse(first.rejected());

        GatewayRedisRateLimitService.GatewayRateLimitEvaluation second =
                service.evaluate(exchange("/api/rooms"), properties).block();
        assertNotNull(second);
        assertTrue(second.rejected());
        assertEquals("CONCURRENCY", second.reason());
        assertTrue(second.permits().isEmpty());

        first.releaseAll().block();
    }

    @Test
    void releaseAllShouldReleaseHeldPermit() {
        GatewayRateLimitProperties properties = propertiesWithConcurrencyRule("release-rule", 1, 5);

        GatewayRedisRateLimitService.GatewayRateLimitEvaluation evaluation =
                service.evaluate(exchange("/api/contacts"), properties).block();
        assertNotNull(evaluation);
        assertFalse(evaluation.rejected());
        GatewayRedisRateLimitService.ConcurrencyPermit permit = evaluation.permits().get(0);
        assertEquals(Set.of(permit.permitId()), fakeRedis.activePermitIds(permit.key(), System.currentTimeMillis()));

        evaluation.releaseAll().block();

        assertTrue(fakeRedis.activePermitIds(permit.key(), System.currentTimeMillis()).isEmpty());

        GatewayRedisRateLimitService.GatewayRateLimitEvaluation next =
                service.evaluate(exchange("/api/contacts"), properties).block();
        assertNotNull(next);
        assertFalse(next.rejected());
        next.releaseAll().block();
    }

    @Test
    void expiredPermitShouldNotLeakPermanentlyWhenRequestNeverReleases() throws Exception {
        GatewayRateLimitProperties properties = propertiesWithConcurrencyRule("ttl-rule", 1, 1);

        GatewayRedisRateLimitService.GatewayRateLimitEvaluation interrupted =
                service.evaluate(exchange("/api/files"), properties).block();
        assertNotNull(interrupted);
        assertFalse(interrupted.rejected());
        GatewayRedisRateLimitService.ConcurrencyPermit stalePermit = interrupted.permits().get(0);

        Thread.sleep(1_200L);

        GatewayRedisRateLimitService.GatewayRateLimitEvaluation retry =
                service.evaluate(exchange("/api/files"), properties).block();
        assertNotNull(retry);
        assertFalse(retry.rejected());
        GatewayRedisRateLimitService.ConcurrencyPermit retryPermit = retry.permits().get(0);
        assertNotEquals(stalePermit.permitId(), retryPermit.permitId());

        retry.releaseAll().block();
    }

    @Test
    void singleRuleWithQpsAndConcurrencyShouldUseOneRedisRoundTripPerEvaluation() {
        GatewayRateLimitProperties properties = propertiesWithCombinedRule("roundtrip-rule", 5, 5, 1, 5);
        fakeRedis.resetExecuteCount();

        GatewayRedisRateLimitService.GatewayRateLimitEvaluation evaluation =
                service.evaluate(exchange("/api/messages"), properties).block();

        assertNotNull(evaluation);
        assertFalse(evaluation.rejected());
        assertEquals(1, fakeRedis.executeCount());
        assertEquals(1, evaluation.permits().size());
        evaluation.releaseAll().block();
    }

    @Test
    void shouldApplyQpsAndConcurrencyTogetherWithoutChangingDecisionSemantics() {
        GatewayRateLimitProperties properties = propertiesWithCombinedRule("combined-rule", 2, 2, 1, 5);

        GatewayRedisRateLimitService.GatewayRateLimitEvaluation first =
                service.evaluate(exchange("/api/combined"), properties).block();
        GatewayRedisRateLimitService.GatewayRateLimitEvaluation second =
                service.evaluate(exchange("/api/combined"), properties).block();

        assertNotNull(first);
        assertFalse(first.rejected());
        assertNotNull(second);
        assertTrue(second.rejected());
        assertEquals("CONCURRENCY", second.reason());

        first.releaseAll().block();

        GatewayRedisRateLimitService.GatewayRateLimitEvaluation third =
                service.evaluate(exchange("/api/combined"), properties).block();
        assertNotNull(third);
        assertTrue(third.rejected());
        assertEquals("QPS", third.reason());
    }

    @Test
    void shouldKeepRuleMatchSemanticsAndSkipRedisWhenRuleDoesNotMatch() {
        GatewayRateLimitProperties properties = propertiesWithCombinedRule("path-rule", 5, 5, 1, 5);
        fakeRedis.resetExecuteCount();

        GatewayRedisRateLimitService.GatewayRateLimitEvaluation evaluation =
                service.evaluate(exchange("/actuator/health"), properties).block();

        assertNotNull(evaluation);
        assertFalse(evaluation.rejected());
        assertEquals(0, fakeRedis.executeCount());
        assertTrue(evaluation.permits().isEmpty());
    }

    private Flux<?> executeScript(RedisScript<?> script, List<String> keys, List<String> args) {
        fakeRedis.recordExecute();
        if (keys == null || keys.isEmpty()) {
            return Flux.error(new AssertionError("redis keys missing"));
        }
        if (args.size() == 9) {
            return Flux.defer(() -> Flux.just(fakeRedis.evaluate(keys, args)));
        }
        if (args.size() == 1) {
            return Flux.defer(() -> Flux.just(fakeRedis.release(keys.get(0), args.get(0))));
        }
        return Flux.error(new AssertionError("unexpected redis script args: " + args));
    }

    private GatewayRateLimitProperties propertiesWithConcurrencyRule(String ruleId, int maxConcurrency, int ttlSeconds) {
        GatewayRateLimitProperties properties = new GatewayRateLimitProperties();
        GatewayRateLimitProperties.RuleSet ruleSet = new GatewayRateLimitProperties.RuleSet();
        GatewayRateLimitProperties.Rule rule = new GatewayRateLimitProperties.Rule();
        rule.setId(ruleId);
        rule.setDimension(GatewayRateLimitProperties.Dimension.API);
        rule.setPathPatterns(List.of("/api/**"));
        rule.setMaxConcurrency(maxConcurrency);
        rule.setConcurrencyTtlSeconds(ttlSeconds);
        ruleSet.setRules(List.of(rule));
        properties.getVersions().put(properties.getActiveVersion(), ruleSet);
        return properties;
    }

    private GatewayRateLimitProperties propertiesWithCombinedRule(
            String ruleId,
            int replenishRate,
            int burstCapacity,
            int maxConcurrency,
            int ttlSeconds
    ) {
        GatewayRateLimitProperties properties = propertiesWithConcurrencyRule(ruleId, maxConcurrency, ttlSeconds);
        GatewayRateLimitProperties.Rule rule = properties.getVersions().get(properties.getActiveVersion()).getRules().get(0);
        rule.setReplenishRate(replenishRate);
        rule.setBurstCapacity(burstCapacity);
        rule.setRequestedTokens(1);
        return properties;
    }

    private MockServerWebExchange exchange(String path) {
        return MockServerWebExchange.from(MockServerHttpRequest.get(path).build());
    }

    private static final class FakeConcurrencyRedis {

        private final Map<String, Map<String, Long>> leases = new HashMap<>();
        private final Map<String, TokenBucketState> buckets = new HashMap<>();
        private int executeCount;

        synchronized void recordExecute() {
            executeCount++;
        }

        synchronized void resetExecuteCount() {
            executeCount = 0;
        }

        synchronized int executeCount() {
            return executeCount;
        }

        synchronized String evaluate(List<String> keys, List<String> args) {
            String tokensKey = keys.get(0);
            String concurrencyKey = keys.get(2);

            boolean qpsEnabled = "1".equals(args.get(0));
            long replenishRate = Long.parseLong(args.get(1));
            long burstCapacity = Long.parseLong(args.get(2));
            long requestedTokens = Long.parseLong(args.get(3));
            boolean concurrencyEnabled = "1".equals(args.get(4));
            long maxPermits = Long.parseLong(args.get(5));
            long ttlSeconds = Long.parseLong(args.get(6));
            String permitId = args.get(7);
            long nowMillis = Long.parseLong(args.get(8));

            if (qpsEnabled) {
                TokenBucketState state = buckets.computeIfAbsent(tokensKey, ignored ->
                        new TokenBucketState((double) burstCapacity, nowMillis));
                double deltaSeconds = Math.max(0L, nowMillis - state.lastRefreshedMillis()) / 1000.0d;
                double filledTokens = Math.min(burstCapacity, state.tokens() + (deltaSeconds * replenishRate));
                boolean qpsAllowed = filledTokens >= requestedTokens;
                double newTokens = qpsAllowed ? filledTokens - requestedTokens : filledTokens;
                buckets.put(tokensKey, new TokenBucketState(newTokens, nowMillis));
                if (!qpsAllowed) {
                    return "0|QPS|0|";
                }
            }

            if (concurrencyEnabled) {
                cleanupExpired(concurrencyKey, nowMillis);
                Map<String, Long> active = leases.computeIfAbsent(concurrencyKey, ignored -> new HashMap<>());
                if (active.size() >= maxPermits) {
                    if (active.isEmpty()) {
                        leases.remove(concurrencyKey);
                    }
                    return "0|CONCURRENCY|0|";
                }
                active.put(permitId, nowMillis + ttlSeconds * 1000L);
                return "1|ALLOW|1|" + permitId;
            }

            return "1|ALLOW|0|";
        }

        synchronized long acquire(String key, long maxPermits, long ttlSeconds, String permitId, long nowMillis) {
            cleanupExpired(key, nowMillis);
            Map<String, Long> active = leases.computeIfAbsent(key, ignored -> new HashMap<>());
            if (active.size() >= maxPermits) {
                if (active.isEmpty()) {
                    leases.remove(key);
                }
                return 0L;
            }
            active.put(permitId, nowMillis + ttlSeconds * 1000L);
            return 1L;
        }

        synchronized long release(String key, String permitId) {
            Map<String, Long> active = leases.get(key);
            if (active == null) {
                return 0L;
            }
            Long removed = active.remove(permitId);
            if (active.isEmpty()) {
                leases.remove(key);
            }
            return removed == null ? 0L : 1L;
        }

        synchronized Set<String> activePermitIds(String key, long nowMillis) {
            cleanupExpired(key, nowMillis);
            Map<String, Long> active = leases.get(key);
            return active == null ? Set.of() : new HashSet<>(active.keySet());
        }

        private void cleanupExpired(String key, long nowMillis) {
            Map<String, Long> active = leases.get(key);
            if (active == null) {
                return;
            }
            active.entrySet().removeIf(entry -> entry.getValue() <= nowMillis);
            if (active.isEmpty()) {
                leases.remove(key);
            }
        }

        private record TokenBucketState(double tokens, long lastRefreshedMillis) {
        }
    }
}
