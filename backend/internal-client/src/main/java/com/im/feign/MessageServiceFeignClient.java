package com.im.feign;

import com.im.dto.ApiResponse;
import com.im.dto.MessageDTO;
import com.im.dto.request.SendSystemMessageRequest;
import com.im.exception.BusinessException;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "im-message-service", path = "/internal/message", configuration = FeignInternalAuthConfig.class)
public interface MessageServiceFeignClient {

    @PostMapping("/system/private")
    ApiResponse<MessageDTO> sendSystemPrivateMessage(@RequestBody SendSystemMessageRequest request);

    default MessageDTO requireSystemPrivateMessage(SendSystemMessageRequest request) {
        return unwrap(sendSystemPrivateMessage(request));
    }

    private static <T> T unwrap(ApiResponse<T> response) {
        if (response == null) {
            return null;
        }
        if (Integer.valueOf(200).equals(response.getCode())) {
            return response.getData();
        }
        throw new BusinessException(response.getMessage() == null ? "message-service call failed" : response.getMessage());
    }
}
