package com.im.config;

import com.qcloud.cos.COSClient;
import com.qcloud.cos.ClientConfig;
import com.qcloud.cos.auth.BasicCOSCredentials;
import com.qcloud.cos.auth.COSCredentials;
import com.qcloud.cos.http.HttpProtocol;
import com.qcloud.cos.region.Region;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

@Configuration
@EnableConfigurationProperties(CosProperties.class)
public class CosConfig {

    @Bean(destroyMethod = "shutdown")
    @ConditionalOnProperty(name = "im.cos.enabled", havingValue = "true", matchIfMissing = true)
    public COSClient cosClient(CosProperties props) {
        if (!StringUtils.hasText(props.getSecretId())
                || !StringUtils.hasText(props.getSecretKey())
                || !StringUtils.hasText(props.getRegion())
                || !StringUtils.hasText(props.getBucket())) {
            throw new IllegalArgumentException(
                    "COS config is incomplete: im.cos.secret-id/secret-key/region/bucket");
        }

        COSCredentials credentials = new BasicCOSCredentials(props.getSecretId(), props.getSecretKey());
        ClientConfig clientConfig = new ClientConfig(new Region(props.getRegion()));
        clientConfig.setHttpProtocol(props.isHttps() ? HttpProtocol.https : HttpProtocol.http);
        return new COSClient(credentials, clientConfig);
    }
}
