package com.im.feign;

import com.im.dto.GroupInfoDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.util.List;

@FeignClient(name = "im-group-service", path = "/api/group/internal", configuration = FeignInternalAuthConfig.class)
public interface GroupServiceFeignClient {

    @GetMapping("/exists/{groupId}")
    Boolean exists(@PathVariable("groupId") Long groupId);

    @GetMapping("/list/{userId}")
    List<GroupInfoDTO> listUserGroups(@PathVariable("userId") Long userId);

    @GetMapping("/isMember/{groupId}/{userId}")
    Boolean isMember(@PathVariable("groupId") Long groupId, @PathVariable("userId") Long userId);

    @GetMapping("/memberIds/{groupId}")
    List<Long> memberIds(@PathVariable("groupId") Long groupId);
}
