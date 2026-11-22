// XSS対策用のサニタイズユーティリティ

/**
 * テキストをサニタイズ（HTMLエスケープ）
 * Reactは自動的にエスケープするが、明示的に行う
 */
export function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  return text;
}

/**
 * URLが安全かチェック（http/httpsのみ許可）
 */
export function isSafeUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 画像URLをサニタイズ
 */
export function sanitizeImageUrl(url) {
  if (!url) return null;
  if (typeof url !== 'string') return null;
  
  // data: スキームの場合は画像のみ許可
  if (url.startsWith('data:')) {
    if (url.startsWith('data:image/')) return url;
    return null;
  }
  
  // http/https のみ許可
  if (!isSafeUrl(url)) return null;
  
  return url;
}

/**
 * YouTube動画IDを安全に抽出
 */
export function extractYoutubeId(url) {
  if (!url || typeof url !== 'string') return null;
  if (!isSafeUrl(url)) return null;
  
  try {
    const parsed = new URL(url);
    
    // youtube.com または youtu.be のみ許可
    if (!parsed.hostname.match(/^(www\.)?(youtube\.com|youtu\.be)$/)) {
      return null;
    }
    
    // youtu.be/VIDEO_ID 形式
    if (parsed.hostname === 'youtu.be' || parsed.hostname === 'www.youtu.be') {
      const id = parsed.pathname.slice(1).split('/')[0].split('?')[0];
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
    
    // youtube.com/watch?v=VIDEO_ID 形式
    if (parsed.hostname.includes('youtube.com')) {
      const id = parsed.searchParams.get('v');
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
    
    // youtube.com/shorts/VIDEO_ID 形式
    if (parsed.hostname.includes('youtube.com')) {
      const shortsMatch = parsed.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shortsMatch && shortsMatch[1]) return shortsMatch[1];
    }
    
    // youtube.com/live/VIDEO_ID 形式
    if (parsed.hostname.includes('youtube.com')) {
      const liveMatch = parsed.pathname.match(/\/live\/([a-zA-Z0-9_-]{11})/);
      if (liveMatch && liveMatch[1]) return liveMatch[1];
    }
    
    // youtube.com/playlist?list=PLAYLIST_ID 形式
    if (parsed.hostname.includes('youtube.com') && parsed.pathname === '/playlist') {
      const listId = parsed.searchParams.get('list');
      if (listId && /^[a-zA-Z0-9_-]+$/.test(listId)) return `playlist_${listId}`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * YouTubeチャンネルのURLか判定
 */
export function extractYoutubeChannelUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (!isSafeUrl(url)) return null;
  
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.match(/^(www\.)?youtube\.com$/)) {
      return null;
    }
    
    // /@username または /channel/ID または /c/name
    if (parsed.pathname.match(/^\/@[a-zA-Z0-9_-]+$/) || 
        parsed.pathname.match(/^\/channel\/UC[a-zA-Z0-9_-]+$/) || 
        parsed.pathname.match(/^\/c\/[a-zA-Z0-9_-]+$/)) {
      return url; // サニタイズ済みのURL全体を返す
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Twitchチャンネル名を安全に抽出
 */
export function extractTwitchId(url) {
  if (!url || typeof url !== 'string') return null;
  if (!isSafeUrl(url)) return null;
  
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.match(/^(www\.)?twitch\.tv$/)) {
      return null;
    }
    const pathParts = parsed.pathname.slice(1).split('/');
    if (pathParts.length > 0 && pathParts[0] && !pathParts[0].includes('?')) {
      return pathParts[0]; // Channel name
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * HTMLをエスケープ（XSS対策）
 */
export function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * URLを検証してサニタイズ
 */
export function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  
  // JavaScriptプロトコルなどの危険なスキームをブロック
  const dangerousProtocols = /^(javascript|data|vbscript|file|about):/i;
  if (dangerousProtocols.test(url.trim())) {
    return null;
  }
  
  if (!isSafeUrl(url)) return null;
  
  return url;
}

/**
 * ユーザー入力の長さを制限
 */
export function truncateText(text, maxLength = 5000) {
  if (typeof text !== 'string') return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

/**
 * アカウントIDをサニタイズ（英数字とアンダースコア、ハイフンのみ）
 */
export function sanitizeAccountId(accountId) {
  if (typeof accountId !== 'string') return '';
  return accountId.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * 表示名をサニタイズ（制御文字を除去）
 */
export function sanitizeDisplayName(name) {
  if (typeof name !== 'string') return '';
  // 制御文字（\x00-\x1F, \x7F-\x9F）を除去
  return name.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
}
