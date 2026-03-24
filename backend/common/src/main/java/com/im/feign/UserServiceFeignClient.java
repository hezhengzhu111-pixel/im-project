package com.im.feign;

import com.im.dto.UserDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.util.List;

@FeignClient(name = "im-user-service", path = "/api/user/internal", configuration = FeignInternalAuthConfig.class)
public interface UserServiceFeignClient {

    @GetMapping("/exists/{userId}")
    Boolean exists(@PathVariable("userId") Long userId);

    @GetMapping("/{userId}")
    UserDTO getUser(@PathVariable("userId") Long userId);

    @GetMapping("/friend/isFriend/{userId}/{friendId}")
    Boolean isFriend(@PathVariable("userId") Long userId, @PathVariable("friendId") Long friendId);

    @GetMapping("/friend/list/{userId}")
    List<UserDTO> friendList(@PathVariable("userId") Long userId);
}
