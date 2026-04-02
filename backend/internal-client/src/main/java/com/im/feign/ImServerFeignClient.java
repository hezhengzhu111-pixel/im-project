package com.im.feign;

import com.im.dto.ApiResponse;
import com.im.exception.BusinessException;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.List;
import java.util.Map;

@FeignClient(name = "im-server", path = "/api/im", configuration = FeignInternalAuthConfig.class)
public interface ImServerFeignClient {

    @PostMapping("/offline/{userId}")
    ApiResponse<String> userOffline(@PathVariable("userId") String userId);

    @PostMapping("/heartbeat/{userId}")
    ApiResponse<Boolean> touchHeartbeat(@PathVariable("userId") String userId);

    @PostMapping("/heartbeat")
    ApiResponse<Map<String, Boolean>> heartbeat(@RequestBody List<String> userIds);

    @PostMapping("/online-status")
    ApiResponse<Map<String, Boolean>> onlineStatus(@RequestBody List<String> userIds);

    default Map<String, Boolean> requireOnlineStatus(List<String> userIds) {
        return unwrap(onlineStatus(userIds));
    }

    private static <T> T unwrap(ApiResponse<T> response) {
        if (response == null) {
            return null;
        }
        if (Integer.valueOf(200).equals(response.getCode())) {
            return response.getData();
        }
        throw new BusinessException(response.getMessage() == null ? "im-server call failed" : response.getMessage());
    }
}
