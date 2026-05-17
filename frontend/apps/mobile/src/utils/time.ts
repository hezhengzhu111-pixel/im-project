/**
 * Format a message sendTime (ISO 8601 string) for display.
 * Same day → HH:mm, different day → MM/DD HH:mm.
 */
export function formatMessageTime(sendTime: string): string {
  const date = new Date(sendTime);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isSameDay =
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCDate() === now.getUTCDate();

  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');

  if (isSameDay) {
    return `${hours}:${minutes}`;
  }

  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}
