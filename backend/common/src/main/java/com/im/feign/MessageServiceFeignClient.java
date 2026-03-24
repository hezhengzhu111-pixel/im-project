package com.im.feign;

import com.im.dto.ApiResponse;
import com.im.dto.MessageDTO;
import com.im.dto.request.SendSystemMessageRequest;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "im-message-service", path = "/internal/message", configuration = FeignInternalAuthConfig.class)
public interface MessageServiceFeignClient {

    @PostMapping("/system/private")
    ApiResponse<MessageDTO> sendSystemPrivateMessage(@RequestBody SendSystemMessageRequest request);
}

