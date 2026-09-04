/**
 * call-helpers.ts — Utilities for recognizing, parsing, and formatting Zalo call events
 * Supports voice calls, video calls, missed calls, and duration formatting.
 */

export interface CallInfo {
  isCall: boolean;
  callType: 'audio' | 'video';
  direction: 'outbound' | 'inbound';
  status: 'connected' | 'missed' | 'unanswered';
  duration: number; // in seconds
  formattedDuration: string; // e.g. "00:18"
  humanDuration: string; // e.g. "18 giây" or "1 phút 20 giây"
  title: string;
  subtitle: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  cardBorderColor: string;
  snippet: string;
}

/**
 * Check whether a message represents a Zalo call event.
 */
export function isCallMessage(msg: { contentType?: string; content?: string | null } | null | undefined): boolean {
  if (!msg) return false;
  if (msg.contentType === 'call') return true;

  const content = msg.content;
  if (!content) return false;

  if (typeof content === 'string') {
    if (
      content.includes('calltime') ||
      content.includes('recommened.call') ||
      content.includes('calltype') ||
      (content.includes('sendBubbleMessage') && content.toLowerCase().includes('cuộc gọi'))
    ) {
      try {
        const parsed = JSON.parse(content);
        return isCallPayload(parsed);
      } catch {
        return false;
      }
    }
  } else if (typeof content === 'object') {
    return isCallPayload(content);
  }

  return false;
}

function isCallPayload(parsed: any): boolean {
  if (!parsed || typeof parsed !== 'object') return false;
  if (typeof parsed.action === 'string' && (parsed.action.includes('call') || parsed.action === 'recommened.calltime')) {
    return true;
  }
  if (
    parsed.title === 'sendBubbleMessage' &&
    typeof parsed.description === 'string' &&
    parsed.description.toLowerCase().includes('cuộc gọi')
  ) {
    return true;
  }
  if (parsed.params) {
    let p = parsed.params;
    if (typeof p === 'string') {
      try { p = JSON.parse(p); } catch {}
    }
    if (typeof p === 'object' && p !== null && ('duration' in p || 'calltype' in p || 'isCaller' in p)) {
      return true;
    }
  }
  return false;
}

/**
 * Format raw seconds into mm:ss or hh:mm:ss.
 */
export function formatCallDuration(seconds: number): string {
  if (isNaN(seconds) || seconds <= 0) return '00:00';
  const totalSeconds = Math.floor(seconds);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Format seconds into Vietnamese natural language ("18 giây", "2 phút 15 giây").
 */
export function formatCallHumanDuration(seconds: number): string {
  if (isNaN(seconds) || seconds <= 0) return '';
  const totalSeconds = Math.floor(seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;

  if (mins === 0) return `${secs} giây`;
  if (secs === 0) return `${mins} phút`;
  return `${mins} phút ${secs} giây`;
}

/**
 * Parse a call message into structured display information.
 */
export function getCallInfo(msg: { contentType?: string; content?: string | null; senderType?: string } | null | undefined): CallInfo {
  const fallback: CallInfo = {
    isCall: false,
    callType: 'audio',
    direction: 'inbound',
    status: 'connected',
    duration: 0,
    formattedDuration: '',
    humanDuration: '',
    title: 'Cuộc gọi',
    subtitle: '',
    icon: 'lucide-phone',
    iconColor: '#10b981',
    iconBg: 'rgba(16, 185, 129, 0.12)',
    cardBorderColor: 'rgba(16, 185, 129, 0.25)',
    snippet: '📞 Cuộc gọi',
  };

  if (!msg || !msg.content) return fallback;

  let parsed: any = null;
  if (typeof msg.content === 'string') {
    try {
      parsed = JSON.parse(msg.content);
    } catch {
      return fallback;
    }
  } else if (typeof msg.content === 'object') {
    parsed = msg.content;
  }

  if (!parsed || typeof parsed !== 'object') return fallback;

  // Extract params
  let params: any = parsed.params;
  if (typeof params === 'string') {
    try {
      params = JSON.parse(params);
    } catch {
      params = {};
    }
  }
  if (!params || typeof params !== 'object') params = {};

  const duration = typeof params.duration === 'number' ? params.duration : parseInt(params.duration || '0', 10) || 0;
  const isCaller = params.isCaller !== undefined ? Number(params.isCaller) : (msg.senderType === 'self' ? 1 : 0);
  const calltype = Number(params.calltype || 0); // 0 = audio, 1 = video

  const callType: 'audio' | 'video' = calltype === 1 ? 'video' : 'audio';

  // Determine direction:
  // If senderType is 'self': isCaller === 1 means outbound.
  // If senderType is 'contact': isCaller === 1 means inbound from contact.
  let direction: 'outbound' | 'inbound' = 'outbound';
  if (msg.senderType === 'contact') {
    direction = isCaller === 0 ? 'outbound' : 'inbound';
  } else {
    direction = isCaller === 0 ? 'inbound' : 'outbound';
  }

  // Determine status:
  let status: 'connected' | 'missed' | 'unanswered' = 'connected';
  if (duration <= 0) {
    if (direction === 'inbound') {
      status = 'missed';
    } else {
      status = 'unanswered';
    }
  } else {
    status = 'connected';
  }

  const formattedDuration = duration > 0 ? formatCallDuration(duration) : '';
  const humanDuration = duration > 0 ? formatCallHumanDuration(duration) : '';

  let title = '';
  let subtitle = '';
  let icon = '';
  let iconColor = '';
  let iconBg = '';
  let cardBorderColor = '';
  let snippet = '';

  if (callType === 'video') {
    if (status === 'missed') {
      title = 'Cuộc gọi video nhỡ';
      subtitle = 'Cuộc gọi video từ khách hàng';
      icon = 'lucide-video-off';
      iconColor = '#ef4444';
      iconBg = 'rgba(239, 68, 68, 0.12)';
      cardBorderColor = 'rgba(239, 68, 68, 0.3)';
      snippet = '📹 Cuộc gọi video nhỡ';
    } else if (status === 'unanswered') {
      title = 'Cuộc gọi video đi';
      subtitle = 'Người nhận không trả lời';
      icon = 'lucide-video';
      iconColor = '#64748b';
      iconBg = 'rgba(100, 116, 139, 0.12)';
      cardBorderColor = 'rgba(100, 116, 139, 0.25)';
      snippet = '📹 Cuộc gọi video đi (Không nhấc máy)';
    } else {
      title = direction === 'outbound' ? 'Cuộc gọi video đi' : 'Cuộc gọi video đến';
      subtitle = humanDuration ? `Thời lượng: ${humanDuration}` : `Thời lượng: ${formattedDuration}`;
      icon = 'lucide-video';
      iconColor = '#10b981';
      iconBg = 'rgba(16, 185, 129, 0.12)';
      cardBorderColor = 'rgba(16, 185, 129, 0.3)';
      snippet = `📹 ${title}${formattedDuration ? ` - ${formattedDuration}` : ''}`;
    }
  } else {
    // Audio / Voice call
    if (status === 'missed') {
      title = 'Cuộc gọi nhỡ';
      subtitle = 'Cuộc gọi thoại từ khách hàng';
      icon = 'lucide-phone-missed';
      iconColor = '#ef4444';
      iconBg = 'rgba(239, 68, 68, 0.12)';
      cardBorderColor = 'rgba(239, 68, 68, 0.3)';
      snippet = '📞 Cuộc gọi nhỡ';
    } else if (status === 'unanswered') {
      title = 'Cuộc gọi đi';
      subtitle = 'Không có câu trả lời';
      icon = 'lucide-phone-off';
      iconColor = '#64748b';
      iconBg = 'rgba(100, 116, 139, 0.12)';
      cardBorderColor = 'rgba(100, 116, 139, 0.25)';
      snippet = '📞 Cuộc gọi đi (Không nhấc máy)';
    } else {
      title = direction === 'outbound' ? 'Cuộc gọi đi' : 'Cuộc gọi đến';
      subtitle = humanDuration ? `Thời lượng: ${humanDuration}` : `Thời lượng: ${formattedDuration}`;
      icon = direction === 'outbound' ? 'lucide-phone-outgoing' : 'lucide-phone-incoming';
      iconColor = '#10b981';
      iconBg = 'rgba(16, 185, 129, 0.12)';
      cardBorderColor = 'rgba(16, 185, 129, 0.3)';
      snippet = `📞 ${title}${formattedDuration ? ` - ${formattedDuration}` : ''}`;
    }
  }

  return {
    isCall: true,
    callType,
    direction,
    status,
    duration,
    formattedDuration,
    humanDuration,
    title,
    subtitle,
    icon,
    iconColor,
    iconBg,
    cardBorderColor,
    snippet,
  };
}
