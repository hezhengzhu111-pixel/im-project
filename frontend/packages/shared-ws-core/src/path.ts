/**
 * Build the full WebSocket URL for a given user and optional ticket.
 *
 * This is a **pure** function — the caller is responsible for supplying the
 * correct base URL (e.g. empty string in dev mode, or `WS_CONFIG.BASE_URL`
 * in production).
 *
 * @param wsBaseUrl  The WebSocket base URL (e.g. `""` or `"wss://example.com"`).
 * @param userId     The authenticated user's ID, embedded in the URL path.
 * @param ticket     Optional one-time WS ticket issued by the auth service.
 * @returns A fully-qualified (or relative, when `wsBaseUrl` is empty) WebSocket
 *          URL string.
 */
export const createTicketedWebSocketUrl = (
  wsBaseUrl: string,
  userId: string,
  ticket?: string,
): string => {
  const baseUrl = `${wsBaseUrl}/websocket/${userId}`;
  if (!ticket) {
    return baseUrl;
  }
  return `${baseUrl}?ticket=${encodeURIComponent(ticket)}`;
};
