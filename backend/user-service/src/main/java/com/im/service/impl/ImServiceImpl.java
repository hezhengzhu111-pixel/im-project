package com.im.service.impl;

import com.im.dto.ApiResponse;
import com.im.dto.MessageDTO;
import com.im.feign.ImServerFeignClient;
import com.im.service.ImService;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class ImServiceImpl implements ImService {

    @Autowired
    private ImServerFeignClient imServerFeignClient;

    @Override
    public boolean sendMessage(MessageDTO message) {
        try {
            ApiResponse<Boolean> body = imServerFeignClient.sendMessage(message);
            return body != null && body.getData() != null && body.getData();
        } catch (Exception e) {
            log.error("发送消息到im-server失败", e);
            return false;
        }
    }

    @Override
    public void userOnline(String userId) {
        try {
            imServerFeignClient.userOnline(userId);
        } catch (Exception e) {
            log.error("通知im-server用户上线失败", e);
        }
    }

    @Override
    public void userOffline(String userId) {
        try {
            imServerFeignClient.userOffline(userId);
        } catch (Exception e) {
            log.error("通知im-server用户下线失败", e);
        }
    }

    @Override
    public boolean touchHeartbeat(String userId) {
        try {
            ApiResponse<Boolean> resp = imServerFeignClient.touchHeartbeat(userId);
            return resp != null && Boolean.TRUE.equals(resp.getData());
        } catch (Exception e) {
            log.error("刷新用户心跳失败", e);
            return false;
        }
    }

    @Override
    public Map<String, Boolean> checkUsersOnlineStatus(List<String> userIds) {
        try {
            ApiResponse<Map<String, Boolean>> resp = imServerFeignClient.onlineStatus(userIds);
            return resp == null ? null : resp.getData();
        } catch (Exception e) {
            log.error("从im-server检查用户在线状态失败", e);
            return null;
        }
    }
}
