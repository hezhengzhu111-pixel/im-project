/**
 * Format a message sendTime (ISO 8601 string) for display using local time.
 * Same day → HH:mm, different day → MM/DD HH:mm.
 */
export function formatMessageTime(sendTime: string): string {
  const date = new Date(sendTime);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  if (isSameDay) {
    return `${hours}:${minutes}`;
  }

  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}
