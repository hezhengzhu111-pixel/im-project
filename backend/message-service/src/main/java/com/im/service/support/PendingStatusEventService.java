package com.im.service.support;

import com.alibaba.fastjson2.JSON;
import com.im.dto.StatusChangeEvent;
import com.im.exception.BusinessException;
import com.im.mapper.PendingStatusEventBacklogMapper;
import com.im.message.entity.PendingStatusEventBacklog;
import com.im.metrics.MessageServiceMetrics;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PendingStatusEventService {

    private final PendingStatusEventBacklogMapper pendingStatusEventBacklogMapper;

    @Autowired(required = false)
    private MessageServiceMetrics metrics;

    @PostConstruct
    void bindMetrics() {
        if (metrics != null) {
            metrics.bindPendingStatusBacklogGauge(this::countBacklog);
        }
    }

    public void store(StatusChangeEvent event) {
        if (event == null || event.getMessageId() == null || event.getNewStatus() == null) {
            return;
        }
        if (event.getChangedAt() == null) {
            event.setChangedAt(LocalDateTime.now());
        }
        PendingStatusEventBacklog backlog = toBacklog(event);
        try {
            pendingStatusEventBacklogMapper.insert(backlog);
        } catch (DuplicateKeyException duplicateKeyException) {
            pendingStatusEventBacklogMapper.updateExisting(
                    backlog.getMessageId(),
                    backlog.getNewStatus(),
                    backlog.getChangedAt(),
                    backlog.getPayloadJson()
            );
        }
    }

    public List<StatusChangeEvent> listByMessageId(Long messageId) {
        if (messageId == null) {
            return List.of();
        }
        return pendingStatusEventBacklogMapper.selectByMessageId(messageId).stream()
                .map(this::toEvent)
                .sorted(Comparator
                        .comparing(this::resolveChangedAt)
                        .thenComparing(this::resolveStatus))
                .toList();
    }

    public void remove(Long messageId, Integer newStatus) {
        if (messageId == null || newStatus == null) {
            return;
        }
        pendingStatusEventBacklogMapper.deleteByMessageIdAndStatus(messageId, newStatus);
    }

    public boolean hasPending(Long messageId, Integer newStatus) {
        if (messageId == null || newStatus == null) {
            return false;
        }
        return pendingStatusEventBacklogMapper.existsByMessageIdAndStatus(messageId, newStatus);
    }

    public List<Long> listPendingMessageIds() {
        return pendingStatusEventBacklogMapper.selectPendingMessageIds();
    }

    long countBacklog() {
        Long count = pendingStatusEventBacklogMapper.selectCount(null);
        return count == null ? 0L : Math.max(0L, count);
    }

    private PendingStatusEventBacklog toBacklog(StatusChangeEvent event) {
        PendingStatusEventBacklog backlog = new PendingStatusEventBacklog();
        backlog.setMessageId(event.getMessageId());
        backlog.setNewStatus(event.getNewStatus());
        backlog.setChangedAt(event.getChangedAt());
        backlog.setPayloadJson(JSON.toJSONString(event));
        return backlog;
    }

    private StatusChangeEvent toEvent(PendingStatusEventBacklog backlog) {
        if (backlog == null || backlog.getPayloadJson() == null) {
            return null;
        }
        try {
            StatusChangeEvent event = JSON.parseObject(backlog.getPayloadJson(), StatusChangeEvent.class);
            if (event == null) {
                return null;
            }
            if (event.getMessageId() == null) {
                event.setMessageId(backlog.getMessageId());
            }
            if (event.getNewStatus() == null) {
                event.setNewStatus(backlog.getNewStatus());
            }
            if (event.getChangedAt() == null) {
                event.setChangedAt(backlog.getChangedAt());
            }
            return event;
        } catch (Exception exception) {
            throw new BusinessException("deserialize pending status event backlog failed", exception);
        }
    }

    private LocalDateTime resolveChangedAt(StatusChangeEvent event) {
        return event == null || event.getChangedAt() == null ? LocalDateTime.MIN : event.getChangedAt();
    }

    private Integer resolveStatus(StatusChangeEvent event) {
        return event == null || event.getNewStatus() == null ? Integer.MIN_VALUE : event.getNewStatus();
    }
}
