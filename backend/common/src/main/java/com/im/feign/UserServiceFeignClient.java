package com.im.feign;

import com.im.dto.ApiResponse;
import com.im.dto.UserDTO;
import com.im.exception.BusinessException;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.util.List;

@FeignClient(name = "im-user-service", path = "/api/user/internal", configuration = FeignInternalAuthConfig.class)
public interface UserServiceFeignClient {

    @GetMapping("/exists/{userId}")
    ApiResponse<Boolean> existsResponse(@PathVariable("userId") Long userId);

    default Boolean exists(Long userId) {
        return unwrap(existsResponse(userId));
    }

    @GetMapping("/{userId}")
    ApiResponse<UserDTO> getUserResponse(@PathVariable("userId") Long userId);

    default UserDTO getUser(Long userId) {
        return unwrap(getUserResponse(userId));
    }

    @GetMapping("/friend/isFriend/{userId}/{friendId}")
    ApiResponse<Boolean> isFriendResponse(@PathVariable("userId") Long userId, @PathVariable("friendId") Long friendId);

    default Boolean isFriend(Long userId, Long friendId) {
        return unwrap(isFriendResponse(userId, friendId));
    }

    @GetMapping("/friend/list/{userId}")
    ApiResponse<List<UserDTO>> friendListResponse(@PathVariable("userId") Long userId);

    default List<UserDTO> friendList(Long userId) {
        return unwrap(friendListResponse(userId));
    }

    private static <T> T unwrap(ApiResponse<T> response) {
        if (response == null) {
            return null;
        }
        if (Integer.valueOf(200).equals(response.getCode())) {
            return response.getData();
        }
        throw new BusinessException(response.getMessage() == null ? "internal user service call failed" : response.getMessage());
    }
}
