package com.im.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "im.cos")
public class CosProperties {
    private boolean enabled = true;
    private boolean https = true;
    private String secretId;
    private String secretKey;
    private String region;
    private String bucket;
    private String publicDomain;
    private String pathPrefix = "";
}
