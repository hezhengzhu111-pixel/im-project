package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.UserDTO;
import com.im.mapper.UserMapper;
import com.im.service.FriendService;
import com.im.util.DTOConverter;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/user/internal")
@RequiredArgsConstructor
public class UserInternalController {

    private final UserMapper userMapper;
    private final DTOConverter dtoConverter;
    private final FriendService friendService;

    @GetMapping("/exists/{userId}")
    public ApiResponse<Boolean> exists(@PathVariable("userId") Long userId) {
        return ApiResponse.success(userId != null && userMapper.selectById(userId) != null);
    }

    @GetMapping("/{userId}")
    public ApiResponse<UserDTO> getUser(@PathVariable("userId") Long userId) {
        var user = userMapper.selectById(userId);
        return ApiResponse.success(user == null ? null : dtoConverter.toUserDTO(user));
    }

    @GetMapping("/friend/isFriend/{userId}/{friendId}")
    public ApiResponse<Boolean> isFriend(@PathVariable("userId") Long userId,
                                         @PathVariable("friendId") Long friendId) {
        if (userId == null || friendId == null) {
            return ApiResponse.success(false);
        }
        return ApiResponse.success(friendService.isFriend(userId, friendId));
    }

    @GetMapping("/friend/list/{userId}")
    public ApiResponse<List<UserDTO>> friendList(@PathVariable("userId") Long userId) {
        if (userId == null) {
            return ApiResponse.success(List.of());
        }
        return ApiResponse.success(friendService.getFriends(userId).stream().map(dtoConverter::toUserDTO).collect(Collectors.toList()));
    }
}
