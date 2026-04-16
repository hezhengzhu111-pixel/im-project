package com.im.service.support;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PersistenceWatermarkService {

    private final HotMessageRedisRepository hotMessageRedisRepository;

    public void addPending(String conversationId, Long messageId, LocalDateTime acceptedAt) {
        hotMessageRedisRepository.addPendingPersistMessage(conversationId, messageId, acceptedAt);
    }

    public void markPersisted(String conversationId, Long messageId) {
        hotMessageRedisRepository.savePersistedWatermark(conversationId, messageId);
        hotMessageRedisRepository.removePendingPersistMessage(conversationId, messageId);
    }

    public void removePending(String conversationId, Long messageId) {
        hotMessageRedisRepository.removePendingPersistMessage(conversationId, messageId);
    }

    public Long getPersistedWatermark(String conversationId) {
        return hotMessageRedisRepository.getPersistedWatermark(conversationId);
    }

    public List<Long> listPendingMessageIds(String conversationId, int limit) {
        return hotMessageRedisRepository.listPendingPersistMessageIds(conversationId, limit);
    }

    public List<Long> listPendingMessageIdsBefore(String conversationId, long scoreInclusiveUpperBound, int limit) {
        return hotMessageRedisRepository.listPendingPersistMessageIdsBefore(conversationId, scoreInclusiveUpperBound, limit);
    }

    public List<String> listPendingConversationIds() {
        return hotMessageRedisRepository.listPendingPersistConversationIds();
    }

    public boolean hasPending(String conversationId, Long messageId) {
        return hotMessageRedisRepository.hasPendingPersistMessage(conversationId, messageId);
    }
}
