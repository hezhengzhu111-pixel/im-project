package com.im.gateway.ratelimit;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.cloud.gateway.support.ServerWebExchangeUtils;

import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

@Component
@Slf4j
public class GatewayRedisRateLimitService {

    private static final RedisScript<Long> TOKEN_BUCKET_SCRIPT = script("ratelimit/token_bucket.lua");
    private static final RedisScript<Long> CONCURRENCY_ACQUIRE_SCRIPT = script("ratelimit/concurrency_acquire.lua");
    private static final RedisScript<Long> CONCURRENCY_RELEASE_SCRIPT = script("ratelimit/concurrency_release.lua");

    private final ReactiveStringRedisTemplate redisTemplate;
    private final MeterRegistry meterRegistry;
    private final AntPathMatcher pathMatcher = new AntPathMatcher();

    public GatewayRedisRateLimitService(ReactiveStringRedisTemplate redisTemplate, MeterRegistry meterRegistry) {
        this.redisTemplate = redisTemplate;
        this.meterRegistry = meterRegistry;
    }

    public Mono<GatewayRateLimitEvaluation> evaluate(ServerWebExchange exchange, GatewayRateLimitProperties properties) {
        GatewayRateLimitProperties.RuleSet ruleSet = activeRuleSet(properties);
        if (ruleSet == null || !ruleSet.isEnabled() || ruleSet.getRules() == null || ruleSet.getRules().isEmpty()) {
            return Mono.just(GatewayRateLimitEvaluation.allow(Collections.emptyList()));
        }
        GatewayRequestContext context = GatewayRequestContext.from(exchange);
        Mono<GatewayRateLimitEvaluation> pipeline = Mono.just(GatewayRateLimitEvaluation.allow(new ArrayList<>()));
        for (GatewayRateLimitProperties.Rule rule : ruleSet.getRules()) {
            pipeline = pipeline.flatMap(current -> applyRule(properties, ruleSet, rule, context, current));
        }
        return pipeline;
    }

    private Mono<GatewayRateLimitEvaluation> applyRule(
            GatewayRateLimitProperties properties,
            GatewayRateLimitProperties.RuleSet ruleSet,
            GatewayRateLimitProperties.Rule rule,
            GatewayRequestContext context,
            GatewayRateLimitEvaluation current
    ) {
        if (current.rejected()) {
            return Mono.just(current);
        }
        if (rule == null || !rule.isEnabled() || !matches(rule, context)) {
            return Mono.just(current);
        }
        if (!inGray(ruleSet.getGrayPercent(), ruleSet.getGrayBy(), context)
                || !inGray(rule.getGrayPercent(), rule.getGrayBy(), context)) {
            return Mono.just(current);
        }

        Mono<GatewayRateLimitEvaluation> afterQps = currentQps(rule, context)
                .flatMap(allowed -> {
                    if (allowed) {
                        recordDecision(properties, rule, "allow", "qps");
                        return Mono.just(current);
                    }
                    recordDecision(properties, rule, properties.getMode() == GatewayRateLimitProperties.Mode.SHADOW
                            ? "shadow_reject" : "reject", "qps");
                    return Mono.just(current.reject(rule.getId(), "QPS", properties.getMode() == GatewayRateLimitProperties.Mode.SHADOW));
                });

        return afterQps.flatMap(state -> {
            if (state.rejected() || rule.getMaxConcurrency() <= 0) {
                return Mono.just(state);
            }
            return acquireConcurrency(rule, context)
                    .map(permit -> {
                        if (permit.allowed()) {
                            recordDecision(properties, rule, "allow", "concurrency");
                            return state.withPermit(permit);
                        }
                        recordDecision(properties, rule, properties.getMode() == GatewayRateLimitProperties.Mode.SHADOW
                                ? "shadow_reject" : "reject", "concurrency");
                        return state.reject(rule.getId(), "CONCURRENCY", properties.getMode() == GatewayRateLimitProperties.Mode.SHADOW);
                    });
        });
    }

    private Mono<Boolean> currentQps(GatewayRateLimitProperties.Rule rule, GatewayRequestContext context) {
        if (rule.getReplenishRate() <= 0 || rule.getBurstCapacity() <= 0) {
            return Mono.just(true);
        }
        String baseKey = baseKey(rule, context);
        if (!StringUtils.hasText(baseKey)) {
            return Mono.just(true);
        }
        List<String> keys = List.of(baseKey + ":tokens", baseKey + ":ts");
        List<String> args = List.of(
                String.valueOf(rule.getReplenishRate()),
                String.valueOf(rule.getBurstCapacity()),
                String.valueOf(Math.max(1, rule.getRequestedTokens())),
                String.valueOf(System.currentTimeMillis())
        );
        return timeRedis("token_bucket", redisTemplate.execute(TOKEN_BUCKET_SCRIPT, keys, args)
                .next()
                .defaultIfEmpty(0L)
                .map(result -> result != null && result == 1L));
    }

    private Mono<ConcurrencyPermit> acquireConcurrency(GatewayRateLimitProperties.Rule rule, GatewayRequestContext context) {
        String baseKey = baseKey(rule, context);
        if (!StringUtils.hasText(baseKey)) {
            return Mono.just(ConcurrencyPermit.allowed(null, Mono.empty()));
        }
        String key = baseKey + ":concurrency";
        List<String> keys = List.of(key);
        List<String> args = List.of(
                String.valueOf(rule.getMaxConcurrency()),
                String.valueOf(Math.max(1, rule.getConcurrencyTtlSeconds()))
        );
        return timeRedis("concurrency_acquire", redisTemplate.execute(CONCURRENCY_ACQUIRE_SCRIPT, keys, args)
                .next()
                .defaultIfEmpty(0L)
                .map(result -> {
                    if (result != null && result == 1L) {
                        Mono<Void> release = timeRedis("concurrency_release",
                                redisTemplate.execute(CONCURRENCY_RELEASE_SCRIPT, keys, List.of())
                                        .next()
                                        .onErrorResume(ex -> {
                                            log.warn("release concurrency permit failed: key={}", key, ex);
                                            return Mono.just(0L);
                                        })
                                        .then());
                        return ConcurrencyPermit.allowed(key, release);
                    }
                    return ConcurrencyPermit.rejected(key);
                }));
    }

    private <T> Mono<T> timeRedis(String operation, Mono<T> action) {
        Timer.Sample sample = Timer.start(meterRegistry);
        return action.doOnSuccess(ignore -> sample.stop(meterRegistry.timer(
                        "im.gateway.rate_limit.redis.latency",
                        "operation", operation,
                        "result", "success"
                )))
                .doOnError(error -> sample.stop(meterRegistry.timer(
                        "im.gateway.rate_limit.redis.latency",
                        "operation", operation,
                        "result", "error"
                )));
    }

    private void recordDecision(
            GatewayRateLimitProperties properties,
            GatewayRateLimitProperties.Rule rule,
            String result,
            String reason
    ) {
        meterRegistry.counter(
                "im.gateway.rate_limit.decisions",
                "version", safe(properties.getActiveVersion()),
                "rule", safe(rule.getId()),
                "dimension", rule.getDimension().name(),
                "reason", reason,
                "result", result,
                "mode", properties.getMode().name()
        ).increment();
    }

    private GatewayRateLimitProperties.RuleSet activeRuleSet(GatewayRateLimitProperties properties) {
        if (properties == null || !properties.isEnabled() || properties.getMode() == GatewayRateLimitProperties.Mode.DISABLED) {
            return null;
        }
        if (properties.getVersions() == null || properties.getVersions().isEmpty()) {
            return null;
        }
        GatewayRateLimitProperties.RuleSet direct = properties.getVersions().get(properties.getActiveVersion());
        if (direct != null) {
            return direct;
        }
        return properties.getVersions().values().stream().findFirst().orElse(null);
    }

    private boolean matches(GatewayRateLimitProperties.Rule rule, GatewayRequestContext context) {
        return matchesMethod(rule.getMethods(), context.method())
                && matchesPaths(rule.getPathPatterns(), context.path())
                && matchesRoutes(rule.getRouteIds(), context.routeId());
    }

    private boolean matchesMethod(List<String> methods, String method) {
        if (methods == null || methods.isEmpty()) {
            return true;
        }
        for (String configured : methods) {
            if (configured != null && configured.equalsIgnoreCase(method)) {
                return true;
            }
        }
        return false;
    }

    private boolean matchesPaths(List<String> patterns, String path) {
        if (patterns == null || patterns.isEmpty()) {
            return true;
        }
        for (String pattern : patterns) {
            if (StringUtils.hasText(pattern) && pathMatcher.match(pattern.trim(), path)) {
                return true;
            }
        }
        return false;
    }

    private boolean matchesRoutes(List<String> routeIds, String routeId) {
        if (routeIds == null || routeIds.isEmpty()) {
            return true;
        }
        if (!StringUtils.hasText(routeId)) {
            return false;
        }
        return routeIds.stream().filter(StringUtils::hasText).anyMatch(id -> id.trim().equals(routeId));
    }

    private boolean inGray(int percent, GatewayRateLimitProperties.GrayBy grayBy, GatewayRequestContext context) {
        if (percent >= 100) {
            return true;
        }
        if (percent <= 0) {
            return false;
        }
        String value = switch (grayBy == null ? GatewayRateLimitProperties.GrayBy.IP : grayBy) {
            case USER -> context.userId();
            case PATH -> context.path();
            case TRACE -> context.traceId();
            case ROUTE -> context.routeId();
            case IP -> context.clientIp();
        };
        if (!StringUtils.hasText(value)) {
            return false;
        }
        int bucket = Math.floorMod(value.hashCode(), 100);
        return bucket < percent;
    }

    private String baseKey(GatewayRateLimitProperties.Rule rule, GatewayRequestContext context) {
        String identity = switch (rule.getDimension()) {
            case GLOBAL -> "global";
            case IP -> context.clientIp();
            case USER -> context.userId();
            case API -> context.path();
            case USER_API -> context.userId() + ":" + context.path();
            case IP_API -> context.clientIp() + ":" + context.path();
        };
        if (!StringUtils.hasText(identity)) {
            return null;
        }
        String ruleId = StringUtils.hasText(rule.getId()) ? rule.getId().trim() : "anonymous";
        return "im:gateway:rate-limit:" + ruleId + ":" + identity;
    }

    private String safe(String value) {
        return StringUtils.hasText(value) ? value.trim() : "unknown";
    }

    private static RedisScript<Long> script(String path) {
        DefaultRedisScript<Long> script = new DefaultRedisScript<>();
        script.setLocation(new ClassPathResource(path));
        script.setResultType(Long.class);
        return script;
    }

    public record GatewayRateLimitEvaluation(
            boolean rejected,
            boolean shadowOnly,
            String ruleId,
            String reason,
            List<ConcurrencyPermit> permits
    ) {
        static GatewayRateLimitEvaluation allow(List<ConcurrencyPermit> permits) {
            return new GatewayRateLimitEvaluation(false, false, "", "", permits);
        }

        GatewayRateLimitEvaluation withPermit(ConcurrencyPermit permit) {
            List<ConcurrencyPermit> updated = new ArrayList<>(permits);
            updated.add(permit);
            return new GatewayRateLimitEvaluation(rejected, shadowOnly, ruleId, reason, updated);
        }

        GatewayRateLimitEvaluation reject(String newRuleId, String newReason, boolean shadow) {
            return new GatewayRateLimitEvaluation(true, shadow, newRuleId, newReason, permits);
        }

        public Mono<Void> releaseAll() {
            if (permits == null || permits.isEmpty()) {
                return Mono.empty();
            }
            List<Mono<Void>> releases = permits.stream()
                    .filter(Objects::nonNull)
                    .filter(ConcurrencyPermit::allowed)
                    .map(ConcurrencyPermit::release)
                    .toList();
            return releases.isEmpty() ? Mono.empty() : Mono.whenDelayError(releases);
        }
    }

    public record ConcurrencyPermit(boolean allowed, String key, Mono<Void> release) {
        static ConcurrencyPermit allowed(String key, Mono<Void> release) {
            return new ConcurrencyPermit(true, key, release == null ? Mono.empty() : release);
        }

        static ConcurrencyPermit rejected(String key) {
            return new ConcurrencyPermit(false, key, Mono.empty());
        }
    }

    public record GatewayRequestContext(
            String clientIp,
            String userId,
            String path,
            String routeId,
            String method,
            String traceId
    ) {
        static GatewayRequestContext from(ServerWebExchange exchange) {
            String forwarded = exchange.getRequest().getHeaders().getFirst("X-Forwarded-For");
            String clientIp = StringUtils.hasText(forwarded)
                    ? forwarded.split(",", 2)[0].trim()
                    : exchange.getRequest().getHeaders().getFirst("X-Real-IP");
            if (!StringUtils.hasText(clientIp) && exchange.getRequest().getRemoteAddress() != null) {
                clientIp = exchange.getRequest().getRemoteAddress().getAddress().getHostAddress();
            }
            String routeId = "";
            Object route = exchange.getAttribute(ServerWebExchangeUtils.GATEWAY_ROUTE_ATTR);
            if (route instanceof org.springframework.cloud.gateway.route.Route gatewayRoute) {
                routeId = gatewayRoute.getId();
            }
            return new GatewayRequestContext(
                    StringUtils.hasText(clientIp) ? clientIp.trim() : "unknown",
                    trim(exchange.getRequest().getHeaders().getFirst("X-User-Id")),
                    exchange.getRequest().getURI().getPath(),
                    trim(routeId),
                    exchange.getRequest().getMethod() == null ? "UNKNOWN" : exchange.getRequest().getMethod().name(),
                    trim(exchange.getRequest().getHeaders().getFirst("X-Trace-Id"))
            );
        }

        private static String trim(String value) {
            return StringUtils.hasText(value) ? value.trim() : "";
        }
    }
}
