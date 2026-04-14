package com.im.gateway.ratelimit;

import lombok.Data;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Data
public class GatewayRateLimitProperties {

    public static final String PREFIX = "im.gateway.rate-limit";

    private boolean enabled = true;
    private Mode mode = Mode.ENFORCE;
    private String activeVersion = "v1";
    private String previousVersion = "";
    private ErrorResponse error = new ErrorResponse();
    private Map<String, RuleSet> versions = new LinkedHashMap<>();

    @Data
    public static class ErrorResponse {
        private int code = 42901;
        private String message = "请求过于频繁，请稍后再试";
    }

    @Data
    public static class RuleSet {
        private boolean enabled = true;
        private int grayPercent = 100;
        private GrayBy grayBy = GrayBy.IP;
        private List<Rule> rules = new ArrayList<>();
    }

    @Data
    public static class Rule {
        private String id;
        private boolean enabled = true;
        private int order = 0;
        private List<String> methods = new ArrayList<>();
        private List<String> pathPatterns = new ArrayList<>();
        private List<String> routeIds = new ArrayList<>();
        private Dimension dimension = Dimension.API;
        private int grayPercent = 100;
        private GrayBy grayBy = GrayBy.IP;
        private int replenishRate = 0;
        private int burstCapacity = 0;
        private int requestedTokens = 1;
        private int maxConcurrency = 0;
        private int concurrencyTtlSeconds = 5;
    }

    public enum Mode {
        ENFORCE,
        SHADOW,
        DISABLED
    }

    public enum Dimension {
        GLOBAL,
        IP,
        USER,
        API,
        USER_API,
        IP_API
    }

    public enum GrayBy {
        IP,
        USER,
        PATH,
        TRACE,
        ROUTE
    }
}
