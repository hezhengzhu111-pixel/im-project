package com.im.websocket;

import com.im.enums.CommonErrorCode;
import org.springframework.web.socket.CloseStatus;

public final class WebSocketErrorSemantics {

    public static final String SESSION_ERROR_CODE = CommonErrorCode.WS_SESSION_CLOSED_OR_STALE.getMessage();
    public static final CloseStatus SESSION_CLOSED_OR_STALE =
            CloseStatus.SESSION_NOT_RELIABLE.withReason(SESSION_ERROR_CODE);

    private WebSocketErrorSemantics() {
    }
}
