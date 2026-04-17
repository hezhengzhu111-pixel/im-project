package com.im.task;

import com.im.config.ImNodeIdentity;
import com.im.service.IImService;
import com.im.service.route.UserRouteRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class LocalRouteLeaseRenewTask {

    private final IImService imService;
    private final ImNodeIdentity nodeIdentity;
    private final UserRouteRegistry routeRegistry;

    @Scheduled(fixedDelayString = "${im.route.lease-renew-interval-ms:30000}")
    public void renewLeases() {
        Set<String> userIds = imService.getLocallyOnlineUserIds();
        if (userIds.isEmpty()) {
            return;
        }

        String instanceId = nodeIdentity.getInstanceId();
        for (String userId : userIds) {
            List<?> sessions = imService.getLocalSessions(userId);
            int sessionCount = sessions == null ? 0 : sessions.size();
            if (sessionCount <= 0) {
                continue;
            }
            routeRegistry.renewLocalRoute(userId, instanceId, sessionCount);
        }
        log.debug("Renewed local route leases. instanceId={}, users={}", instanceId, userIds.size());
    }
}
