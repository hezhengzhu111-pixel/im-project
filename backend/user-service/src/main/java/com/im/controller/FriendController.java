package com.im.controller;

import com.im.common.PageResult;
import com.im.dto.ApiResponse;
import com.im.dto.FriendRequestResponseDTO;
import com.im.dto.FriendListDTO;
import com.im.dto.FriendRequestDTO;
import com.im.dto.request.SendFriendRequestRequest;
import com.im.dto.request.AcceptFriendRequestRequest;
import com.im.dto.request.RejectFriendRequestRequest;
import com.im.service.FriendService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/friend")
@RequiredArgsConstructor
@Validated
@Slf4j
public class FriendController {
    
    private final FriendService friendService;
    
    /**
     * 发送好友请求
     * POST /friend/request
     */
    @PostMapping("/request")
    public ApiResponse<FriendRequestResponseDTO> sendFriendRequest(
            @RequestAttribute Long userId,
            @Valid @RequestBody SendFriendRequestRequest request) {
        FriendRequestResponseDTO response = friendService.sendFriendRequest(userId, Long.valueOf(request.getTargetUserId()), request.getReason());
        return response.isSuccess()
                ? ApiResponse.success(response.getMessage(), response)
                : ApiResponse.badRequest(response.getMessage());
    }
    
    /**
     * 同意好友请求
     * PUT /friend/accept
     */
    @PostMapping("/accept")
    public ApiResponse<FriendRequestResponseDTO> acceptFriendRequest(
            @RequestAttribute Long userId,
            @Valid @RequestBody AcceptFriendRequestRequest request) {
        FriendRequestResponseDTO response = friendService.acceptFriendRequest(userId, request.getRequestId());
        return response.isSuccess()
                ? ApiResponse.success(response.getMessage(), response)
                : ApiResponse.badRequest(response.getMessage());
    }
    
    /**
     * 拒绝好友请求
     * PUT /friend/reject
     */
    @PostMapping("/reject")
    public ApiResponse<FriendRequestResponseDTO> rejectFriendRequest(
            @RequestAttribute Long userId,
            @Valid @RequestBody RejectFriendRequestRequest request) {
        FriendRequestResponseDTO response = friendService.rejectFriendRequest(userId, request.getRequestId(), request.getReason());
        return response.isSuccess()
                ? ApiResponse.success(response.getMessage(), response)
                : ApiResponse.badRequest(response.getMessage());
    }
    
    /**
     * 删除好友
     * DELETE /friend/remove
     */
    @DeleteMapping("/remove")
    public ApiResponse<FriendRequestResponseDTO> removeFriend(
            @RequestAttribute Long userId,
            @RequestParam @NotNull(message = "好友用户ID不能为空") Long friendUserId) {
        FriendRequestResponseDTO response = friendService.removeFriend(userId, friendUserId);
        return response.isSuccess()
                ? ApiResponse.success(response.getMessage(), response)
                : ApiResponse.badRequest(response.getMessage());
    }
    
    /**
     * 拉黑用户
     * POST /friend/block
     */
    @PostMapping("/block")
    public ApiResponse<FriendRequestResponseDTO> blockUser(
            @RequestAttribute Long userId,
            @RequestParam @NotNull(message = "用户ID不能为空") Long targetUserId) {
        FriendRequestResponseDTO response = friendService.blockUser(userId, targetUserId);
        return response.isSuccess()
                ? ApiResponse.success(response.getMessage(), response)
                : ApiResponse.badRequest(response.getMessage());
    }
    
    /**
     * 获取好友列表
     * GET /friend/list
     */
    @GetMapping("/list")
    public ApiResponse<List<FriendListDTO>> getFriendList(@RequestAttribute Long userId) {
        List<FriendListDTO> friendList = friendService.getFriendList(userId);
        return ApiResponse.success("获取好友列表成功", friendList);
    }
    
    /**
     * 获取好友申请记录
     * GET /friend/requests
     */
    @GetMapping("/requests")
    public ApiResponse<PageResult<FriendRequestDTO>> getFriendRequests(
            @RequestAttribute Long userId,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "10") @Min(value = 1, message = "limit不能小于1") @Max(value = 50, message = "limit不能大于50") Integer limit) {
        PageResult<FriendRequestDTO> requests = friendService.getFriendRequests(userId, cursor, limit);
        return ApiResponse.success("获取好友申请记录成功", requests);
    }
    
    /**
     * 获取黑名单列表
     * GET /friend/blocked
     */
    @GetMapping("/blocked")
    public ApiResponse<List<FriendListDTO>> getBlockList(@RequestAttribute Long userId) {
        List<FriendListDTO> blockList = friendService.getBlockList(userId);
        return ApiResponse.success("获取黑名单成功", blockList);
    }
    
    /**
     * 检查好友关系
     * GET /friend/relation
     */
    @GetMapping("/relation")
    public ApiResponse<Map<String, Object>> checkFriendRelation(
            @RequestAttribute Long userId,
            @RequestParam @NotNull(message = "目标用户ID不能为空") Long targetUserId) {
        boolean isFriend = friendService.isFriend(userId, targetUserId);
        boolean isBlocked = friendService.isBlocked(userId, targetUserId);

        Map<String, Object> result = Map.of(
                "isFriend", isFriend,
                "isBlocked", isBlocked
        );

        return ApiResponse.success("检查好友关系成功", result);
    }
    
    /**
     * 修改好友备注
     * PUT /friend/remark
     */
    @PutMapping("/remark")
    public ApiResponse<FriendRequestResponseDTO> updateFriendRemark(
            @RequestAttribute Long userId,
            @RequestParam @NotNull(message = "好友ID不能为空") Long friendUserId,
            @RequestParam @NotBlank(message = "备注不能为空") String remark) {
        FriendRequestResponseDTO response = friendService.updateFriendRemark(userId, friendUserId, remark);
        return response.isSuccess()
                ? ApiResponse.success(response.getMessage(), response)
                : ApiResponse.badRequest(response.getMessage());
    }
}
