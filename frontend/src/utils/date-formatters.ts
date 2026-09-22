/**
 * Date and time formatting utilities for chat and conversation sidebar.
 */

export function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export function isToday(target: Date, now = new Date()): boolean {
  return isSameDay(target, now);
}

export function isYesterday(target: Date, now = new Date()): boolean {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return isSameDay(target, yesterday);
}

/**
 * Format timestamp for the conversation sidebar list.
 * Rules:
 * - Today: "Hôm nay HH:mm" (e.g. "Hôm nay 22:27")
 * - Yesterday: "Hôm qua HH:mm" (e.g. "Hôm qua 22:27")
 * - Other days: "dd/MM/yyyy HH:mm" (e.g. "20/09/2026 22:27")
 */
export function formatSidebarTime(dateStr?: string | null, now = new Date()): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';

  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  if (isToday(d, now)) {
    return `Hôm nay ${timeStr}`;
  }

  if (isYesterday(d, now)) {
    return `Hôm qua ${timeStr}`;
  }

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year} ${timeStr}`;
}

/**
 * Format timestamp for chat thread timeline dividers (Zalo style).
 * Rules:
 * - Today: "HH:mm Hôm nay" (e.g. "23:04 Hôm nay")
 * - Yesterday: "HH:mm Hôm qua" (e.g. "23:04 Hôm qua")
 * - Other days: "HH:mm dd/MM/yyyy" (e.g. "23:04 20/09/2026")
 */
export function formatChatDividerTime(dateStr?: string | null, now = new Date()): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';

  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  if (isToday(d, now)) {
    return `${timeStr} Hôm nay`;
  }

  if (isYesterday(d, now)) {
    return `${timeStr} Hôm qua`;
  }

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${timeStr} ${day}/${month}/${year}`;
}

/**
 * Determines whether a date/time divider should be displayed before a message.
 * Divider is shown if:
 * 1. It is the very first message in the visible list (idx === 0).
 * 2. The message is on a different calendar day than the previous message.
 * 3. The time difference between the current message and previous message is >= 20 minutes.
 */
export function shouldShowChatDivider(
  currSentAt?: string | null,
  prevSentAt?: string | null
): boolean {
  if (!currSentAt) return false;
  if (!prevSentAt) return true;

  const dCurr = new Date(currSentAt);
  const dPrev = new Date(prevSentAt);

  if (isNaN(dCurr.getTime())) return false;
  if (isNaN(dPrev.getTime())) return true;

  // Calendar day changed
  if (!isSameDay(dCurr, dPrev)) {
    return true;
  }

  // Time difference >= 20 minutes
  const diffMs = dCurr.getTime() - dPrev.getTime();
  if (diffMs >= 20 * 60 * 1000) {
    return true;
  }

  return false;
}
