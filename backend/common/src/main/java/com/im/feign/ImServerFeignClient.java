package com.im.feign;

import com.im.dto.ApiResponse;
import com.im.dto.MessageDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.List;
import java.util.Map;

@FeignClient(name = "im-server", path = "/api/im", url = "${im.server.url:http://im-server:8083}", configuration = FeignInternalAuthConfig.class)
public interface ImServerFeignClient {

    @PostMapping("/sendMessage")
    ApiResponse<Boolean> sendMessage(@RequestBody MessageDTO message);

    @PostMapping("/online/{userId}")
    ApiResponse<String> userOnline(@PathVariable("userId") String userId);

    @PostMapping("/offline/{userId}")
    ApiResponse<String> userOffline(@PathVariable("userId") String userId);

    @PostMapping("/heartbeat/{userId}")
    ApiResponse<Boolean> touchHeartbeat(@PathVariable("userId") String userId);

    @PostMapping("/heartbeat")
    ApiResponse<Map<String, Boolean>> heartbeat(@RequestBody List<String> userIds);

    @PostMapping("/online-status")
    ApiResponse<Map<String, Boolean>> onlineStatus(@RequestBody List<String> userIds);
}

