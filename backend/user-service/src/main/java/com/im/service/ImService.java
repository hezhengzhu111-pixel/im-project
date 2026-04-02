package com.im.service;

import java.util.List;
import java.util.Map;

public interface ImService {

    boolean sendSystemMessage(Long receiverId, String content);

    void userOffline(String userId);

    boolean touchHeartbeat(String userId);

    Map<String, Boolean> checkUsersOnlineStatus(List<String> userIds);
}
