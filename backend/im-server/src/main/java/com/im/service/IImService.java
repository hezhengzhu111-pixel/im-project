package com.im.service;

import com.im.dto.MessageDTO;
import com.im.dto.ReadReceiptDTO;
import com.im.entity.UserSession;
import org.springframework.web.socket.CloseStatus;

import java.util.List;
import java.util.Map;
import java.util.Set;

public interface IImService {

    boolean userOffline(String userId);

    void sendPrivateMessage(MessageDTO message);

    void sendGroupMessage(MessageDTO message);

    boolean pushMessageToUser(MessageDTO message, Long userId);

    boolean pushReadReceiptToUser(ReadReceiptDTO receipt, Long userId);

    boolean pushMessageToSession(MessageDTO message, String sessionId);

    boolean pushReadReceiptToSession(ReadReceiptDTO receipt, String sessionId);

    Map<String, Boolean> checkUsersOnlineStatus(List<String> userIds);

    boolean touchUserHeartbeat(String userId);

    void refreshRouteHeartbeat(String userId, String sessionId);

    String getCurrentInstanceId();

    boolean isSessionActive(String userId, String sessionId);

    UserSession getSession(String sessionId);

    Map<String, UserSession> getSessionsById();

    List<UserSession> getLocalSessions(String userId);

    Set<String> getLocallyOnlineUserIds();

    void registerSession(String userId, UserSession userSession);

    boolean unregisterSession(String userId, String sessionId, CloseStatus closeStatus);

    default void sendOfflineMessage(MessageDTO message) {
    }
}
