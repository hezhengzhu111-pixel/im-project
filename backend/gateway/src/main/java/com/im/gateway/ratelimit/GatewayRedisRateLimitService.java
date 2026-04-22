package com.im.gateway.ratelimit;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.gateway.support.ServerWebExchangeUtils;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.*;

@Component
@Slf4j
public class GatewayRedisRateLimitService {

    private static final RedisScript<String> RULE_EVALUATE_SCRIPT = script("ratelimit/rule_evaluate.lua", String.class);
    private static final RedisScript<Long> CONCURRENCY_RELEASE_SCRIPT = script("ratelimit/concurrency_release.lua", Long.class);

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
        boolean qpsEnabled = rule.getReplenishRate() > 0 && rule.getBurstCapacity() > 0;
        boolean concurrencyEnabled = rule.getMaxConcurrency() > 0;
        String baseKey = baseKey(rule, context);
        if (!StringUtils.hasText(baseKey)) {
            recordDecision(properties, rule, "allow", "qps");
            if (!concurrencyEnabled) {
                return Mono.just(current);
            }
            recordDecision(properties, rule, "allow", "concurrency");
            return Mono.just(current.withPermit(ConcurrencyPermit.allowed(null, null, Mono.empty())));
        }
        if (!qpsEnabled && !concurrencyEnabled) {
            recordDecision(properties, rule, "allow", "qps");
            return Mono.just(current);
        }

        return evaluateRuleAtomically(rule, baseKey)
                .map(outcome -> {
                    if ("QPS".equals(outcome.reason())) {
                        recordDecision(properties, rule, properties.getMode() == GatewayRateLimitProperties.Mode.SHADOW
                                ? "shadow_reject" : "reject", "qps");
                        return current.reject(rule.getId(), "QPS", properties.getMode() == GatewayRateLimitProperties.Mode.SHADOW);
                    }

                    recordDecision(properties, rule, "allow", "qps");
                    if (!concurrencyEnabled) {
                        return current;
                    }
                    if ("CONCURRENCY".equals(outcome.reason())) {
                        recordDecision(properties, rule, properties.getMode() == GatewayRateLimitProperties.Mode.SHADOW
                                ? "shadow_reject" : "reject", "concurrency");
                        return current.reject(rule.getId(), "CONCURRENCY", properties.getMode() == GatewayRateLimitProperties.Mode.SHADOW);
                    }

                    recordDecision(properties, rule, "allow", "concurrency");
                    return outcome.permit().allowed() ? current.withPermit(outcome.permit()) : current;
                });
    }

    private Mono<RuleEvaluationOutcome> evaluateRuleAtomically(GatewayRateLimitProperties.Rule rule, String baseKey) {
        String concurrencyKey = baseKey + ":concurrency";
        String permitId = rule.getMaxConcurrency() > 0 ? UUID.randomUUID().toString() : "";
        List<String> keys = List.of(
                baseKey + ":tokens",
                baseKey + ":ts",
                concurrencyKey
        );
        List<String> args = List.of(
                rule.getReplenishRate() > 0 && rule.getBurstCapacity() > 0 ? "1" : "0",
                String.valueOf(Math.max(0, rule.getReplenishRate())),
                String.valueOf(Math.max(0, rule.getBurstCapacity())),
                String.valueOf(Math.max(1, rule.getRequestedTokens())),
                rule.getMaxConcurrency() > 0 ? "1" : "0",
                String.valueOf(Math.max(0, rule.getMaxConcurrency())),
                String.valueOf(Math.max(1, rule.getConcurrencyTtlSeconds())),
                permitId,
                String.valueOf(System.currentTimeMillis())
        );
        return timeRedis("rule_evaluate", redisTemplate.execute(RULE_EVALUATE_SCRIPT, keys, args)
                .next()
                .defaultIfEmpty("0|UNKNOWN|0|")
                .map(raw -> toRuleOutcome(raw, concurrencyKey)));
    }

    private RuleEvaluationOutcome toRuleOutcome(String raw, String concurrencyKey) {
        String[] parts = raw == null ? new String[0] : raw.split("\\|", 4);
        boolean allowed = parts.length > 0 && "1".equals(parts[0]);
        String reason = parts.length > 1 && StringUtils.hasText(parts[1]) ? parts[1].trim() : "UNKNOWN";
        boolean permitGranted = parts.length > 2 && "1".equals(parts[2]);
        String permitId = parts.length > 3 && StringUtils.hasText(parts[3]) ? parts[3].trim() : "";
        if (allowed && permitGranted && StringUtils.hasText(concurrencyKey) && StringUtils.hasText(permitId)) {
            List<String> releaseKeys = List.of(concurrencyKey);
            Mono<Void> release = Mono.defer(() -> timeRedis("concurrency_release",
                    redisTemplate.execute(CONCURRENCY_RELEASE_SCRIPT, releaseKeys, List.of(permitId))
                            .next()
                            .onErrorResume(ex -> {
                                log.warn("release concurrency permit failed: key={}, permitId={}", concurrencyKey, permitId, ex);
                                return Mono.just(0L);
                            })
                            .then()));
            return new RuleEvaluationOutcome(reason, ConcurrencyPermit.allowed(concurrencyKey, permitId, release));
        }
        if (allowed) {
            return new RuleEvaluationOutcome(reason, ConcurrencyPermit.allowed(null, null, Mono.empty()));
        }
        return new RuleEvaluationOutcome(reason, ConcurrencyPermit.rejected(concurrencyKey, permitId));
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

    private static <T> RedisScript<T> script(String path, Class<T> resultType) {
        DefaultRedisScript<T> script = new DefaultRedisScript<>();
        script.setLocation(new ClassPathResource(path));
        script.setResultType(resultType);
        return script;
    }

    private record RuleEvaluationOutcome(String reason, ConcurrencyPermit permit) {
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
                    .filter(ConcurrencyPermit::releasable)
                    .map(ConcurrencyPermit::release)
                    .toList();
            return releases.isEmpty() ? Mono.empty() : Mono.whenDelayError(releases);
        }
    }

    public record ConcurrencyPermit(boolean allowed, String key, String permitId, Mono<Void> release) {
        static ConcurrencyPermit allowed(String key, String permitId, Mono<Void> release) {
            return new ConcurrencyPermit(true, key, permitId, release == null ? Mono.empty() : release);
        }

        static ConcurrencyPermit rejected(String key, String permitId) {
            return new ConcurrencyPermit(false, key, permitId, Mono.empty());
        }

        boolean releasable() {
            return allowed && StringUtils.hasText(key) && StringUtils.hasText(permitId);
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
