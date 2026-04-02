package com.im.service.impl;

import com.im.dto.ApiResponse;
import com.im.dto.MessageDTO;
import com.im.dto.request.SendSystemMessageRequest;
import com.im.feign.ImServerFeignClient;
import com.im.feign.MessageServiceFeignClient;
import com.im.service.ImService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;

@Service
@Slf4j
@RequiredArgsConstructor
public class ImServiceImpl implements ImService {

    private final ImServerFeignClient imServerFeignClient;
    private final MessageServiceFeignClient messageServiceFeignClient;

    @Override
    public boolean sendSystemMessage(Long receiverId, String content) {
        if (receiverId == null || receiverId <= 0 || !StringUtils.hasText(content)) {
            return false;
        }
        try {
            SendSystemMessageRequest request = new SendSystemMessageRequest();
            request.setReceiverId(receiverId);
            request.setContent(content);
            ApiResponse<MessageDTO> body = messageServiceFeignClient.sendSystemPrivateMessage(request);
            return body != null && Integer.valueOf(200).equals(body.getCode()) && body.getData() != null;
        } catch (Exception e) {
            log.error("send system message via message-service failed", e);
            return false;
        }
    }

    @Override
    public void userOffline(String userId) {
        try {
            imServerFeignClient.userOffline(userId);
        } catch (Exception e) {
            log.error("notify im-server user offline failed", e);
        }
    }

    @Override
    public boolean touchHeartbeat(String userId) {
        try {
            ApiResponse<Boolean> resp = imServerFeignClient.touchHeartbeat(userId);
            return resp != null && Boolean.TRUE.equals(resp.getData());
        } catch (Exception e) {
            log.error("touch heartbeat failed", e);
            return false;
        }
    }

    @Override
    public Map<String, Boolean> checkUsersOnlineStatus(List<String> userIds) {
        try {
            ApiResponse<Map<String, Boolean>> resp = imServerFeignClient.onlineStatus(userIds);
            return resp == null ? null : resp.getData();
        } catch (Exception e) {
            log.error("check online status from im-server failed", e);
            return null;
        }
    }
}
