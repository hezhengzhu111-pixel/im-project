package com.im.service.support;

import com.im.dto.StatusChangeEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PendingStatusEventService {

    private final HotMessageRedisRepository hotMessageRedisRepository;

    public void store(StatusChangeEvent event) {
        if (event == null || event.getMessageId() == null || event.getNewStatus() == null) {
            return;
        }
        if (event.getChangedAt() == null) {
            event.setChangedAt(LocalDateTime.now());
        }
        hotMessageRedisRepository.saveStatusPending(event.getMessageId(), event.getNewStatus(), event);
    }

    public List<StatusChangeEvent> listByMessageId(Long messageId) {
        return hotMessageRedisRepository.listPendingStatusEvents(messageId).stream()
                .sorted(Comparator
                        .comparing(this::resolveChangedAt)
                        .thenComparing(this::resolveStatus))
                .toList();
    }

    public void remove(Long messageId, Integer newStatus) {
        hotMessageRedisRepository.removePendingStatus(messageId, newStatus);
    }

    public boolean hasPending(Long messageId, Integer newStatus) {
        return hotMessageRedisRepository.hasPendingStatus(messageId, newStatus);
    }

    public List<Long> listPendingMessageIds() {
        return hotMessageRedisRepository.listPendingStatusMessageIds();
    }

    private LocalDateTime resolveChangedAt(StatusChangeEvent event) {
        return event == null || event.getChangedAt() == null ? LocalDateTime.MIN : event.getChangedAt();
    }

    private Integer resolveStatus(StatusChangeEvent event) {
        return event == null || event.getNewStatus() == null ? Integer.MIN_VALUE : event.getNewStatus();
    }
}
