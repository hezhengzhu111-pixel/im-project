/**
 * E2EE 协商事件总线
 *
 * 将 WebSocket 收到的 E2EE_NEGOTIATION 消息分发给 UI 组件。
 */

export interface E2eeNegotiationEvent {
  action: 'request' | 'accepted' | 'rejected' | 'disabled';
  sessionId: string;
  requesterId: string;
  requesterName: string;
  targetUserId: string;
  requestPayloadJson?: string;
}

type Listener = (event: E2eeNegotiationEvent) => void;

const listeners = new Set<Listener>();

export function onE2eeNegotiation(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitE2eeNegotiation(event: E2eeNegotiationEvent): void {
  for (const fn of listeners) fn(event);
}
