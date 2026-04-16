package com.im.task;

import com.im.mapper.MessageMapper;
import com.im.message.entity.Message;
import com.im.service.support.PersistenceWatermarkService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class HotProjectionReconcileTask {

    static final int PENDING_RECONCILE_LIMIT = 500;
    static final long PENDING_RECONCILE_DELAY_SECONDS = 30L;

    private final PersistenceWatermarkService persistenceWatermarkService;
    private final MessageMapper messageMapper;

    @Scheduled(fixedDelay = 30000, initialDelay = 30000)
    public void reconcilePendingPersistState() {
        List<String> conversationIds = persistenceWatermarkService.listPendingConversationIds();
        if (conversationIds == null || conversationIds.isEmpty()) {
            return;
        }

        long threshold = resolveThresholdEpochMilli();
        for (String conversationId : conversationIds) {
            if (!StringUtils.hasText(conversationId)) {
                continue;
            }
            reconcileConversation(conversationId.trim(), threshold);
        }
    }

    private void reconcileConversation(String conversationId, long thresholdEpochMilli) {
        try {
            List<Long> pendingMessageIds = persistenceWatermarkService.listPendingMessageIdsBefore(
                    conversationId,
                    thresholdEpochMilli,
                    PENDING_RECONCILE_LIMIT
            );
            for (Long messageId : pendingMessageIds) {
                Message persistedMessage = messageMapper.selectById(messageId);
                if (persistedMessage != null) {
                    persistenceWatermarkService.markPersisted(conversationId, messageId);
                    continue;
                }
                log.warn("Pending persist message still missing in DB. conversationId={}, messageId={}",
                        conversationId, messageId);
            }
        } catch (Exception exception) {
            log.error("Failed to reconcile hot projection pending state. conversationId={}", conversationId, exception);
        }
    }

    private long resolveThresholdEpochMilli() {
        LocalDateTime threshold = LocalDateTime.now().minusSeconds(PENDING_RECONCILE_DELAY_SECONDS);
        return threshold.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }
}
