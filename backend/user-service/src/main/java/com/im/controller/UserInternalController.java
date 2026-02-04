package com.im.controller;

import com.im.dto.UserDTO;
import com.im.mapper.UserMapper;
import com.im.service.FriendService;
import com.im.util.DTOConverter;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
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

    @Value("${im.internal.secret:im-internal-secret}")
    private String internalSecret;

    @GetMapping("/exists/{userId}")
    public Boolean exists(@RequestHeader(value = "X-Internal-Secret", required = false) String secret,
                          @PathVariable("userId") Long userId) {
        verify(secret);
        return userId != null && userMapper.selectById(userId) != null;
    }

    @GetMapping("/{userId}")
    public UserDTO getUser(@RequestHeader(value = "X-Internal-Secret", required = false) String secret,
                           @PathVariable("userId") Long userId) {
        verify(secret);
        var user = userMapper.selectById(userId);
        return user == null ? null : dtoConverter.toUserDTO(user);
    }

    @GetMapping("/friend/isFriend/{userId}/{friendId}")
    public Boolean isFriend(@RequestHeader(value = "X-Internal-Secret", required = false) String secret,
                            @PathVariable("userId") Long userId,
                            @PathVariable("friendId") Long friendId) {
        verify(secret);
        if (userId == null || friendId == null) {
            return false;
        }
        return friendService.isFriend(userId, friendId);
    }

    @GetMapping("/friend/list/{userId}")
    public List<UserDTO> friendList(@RequestHeader(value = "X-Internal-Secret", required = false) String secret,
                                    @PathVariable("userId") Long userId) {
        verify(secret);
        if (userId == null) {
            return List.of();
        }
        return friendService.getFriends(userId).stream().map(dtoConverter::toUserDTO).collect(Collectors.toList());
    }

    private void verify(String secret) {
        if (secret == null || !secret.equals(internalSecret)) {
            throw new SecurityException("Forbidden");
        }
    }
}
