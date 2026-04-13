package com.im.feign;

import com.im.dto.ApiResponse;
import com.im.dto.GroupInfoDTO;
import com.im.exception.BusinessException;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.util.List;

@FeignClient(name = "im-group-service", path = "/api/group/internal", configuration = FeignInternalAuthConfig.class)
public interface GroupServiceFeignClient {

    @GetMapping("/exists/{groupId}")
    ApiResponse<Boolean> existsResponse(@PathVariable("groupId") Long groupId);

    default Boolean exists(Long groupId) {
        return unwrap(existsResponse(groupId));
    }

    @GetMapping("/list/{userId}")
    ApiResponse<List<GroupInfoDTO>> listUserGroupsResponse(@PathVariable("userId") Long userId);

    default List<GroupInfoDTO> listUserGroups(Long userId) {
        return unwrap(listUserGroupsResponse(userId));
    }

    @GetMapping("/isMember/{groupId}/{userId}")
    ApiResponse<Boolean> isMemberResponse(@PathVariable("groupId") Long groupId, @PathVariable("userId") Long userId);

    default Boolean isMember(Long groupId, Long userId) {
        return unwrap(isMemberResponse(groupId, userId));
    }

    @GetMapping("/memberIds/{groupId}")
    ApiResponse<List<Long>> memberIdsResponse(@PathVariable("groupId") Long groupId);

    default List<Long> memberIds(Long groupId) {
        return unwrap(memberIdsResponse(groupId));
    }

    private static <T> T unwrap(ApiResponse<T> response) {
        if (response == null) {
            return null;
        }
        if (Integer.valueOf(200).equals(response.getCode())) {
            return response.getData();
        }
        throw new BusinessException(response.getMessage() == null ? "internal group service call failed" : response.getMessage());
    }
}
