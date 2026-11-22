// 同一オリジンを使用するため、BASEを空文字に設定
const BASE = '';
const MAX_RETRIES = 3;
const RETRY_DELAY = 500; // ms

// リクエストキャッシュ（GET リクエストのみ）
const requestCache = new Map();
const CACHE_TTL = 60000; // 1分

const CACHEABLE = ['/members', '/stumps'];

function getToken() {
  return localStorage.getItem('hc_token');
}

export function saveToken(token) {
  requestCache.clear();
  localStorage.setItem('hc_token', token);
}

export function clearToken() {
  requestCache.clear();
  localStorage.removeItem('hc_token');
}

function getCacheKey(method, path) {
  return `${method}:${(getToken() || '').slice(-12)}:${path}`;
}

function getCachedRequest(method, path) {
  if (method !== 'GET' || !CACHEABLE.includes(path)) return null;
  const key = getCacheKey(method, path);
  const cached = requestCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[API] Cache hit: ${method} ${path}`);
    return cached.data;
  }
  requestCache.delete(key);
  return null;
}

function setCachedRequest(method, path, data) {
  if (method !== 'GET' || !CACHEABLE.includes(path)) return;
  const key = getCacheKey(method, path);
  requestCache.set(key, { data, timestamp: Date.now() });
}

async function request(method, path, body, retryCount = 0) {
  const token = getToken();
  const url = `${BASE}${path}`;
  
  // GET リクエストはキャッシュを確認
  const cached = getCachedRequest(method, path);
  if (cached) return cached;
  
  console.log(`[API] ${method} ${url}`, body ? { body } : '');
  
  try {
    // ヘッダーを最小化（拡張機能がブロックしにくくする）
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // トークンは Authorization ヘッダーではなく、クエリパラメータで送信する選択肢も用意
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      // キャッシュ制御を明示的に設定
      cache: method === 'GET' ? 'default' : 'no-store',
    });
    
    console.log(`[API] Response status: ${res.status}`);
    
    // ステータスが 0 の場合はブロックされている可能性
    if (res.status === 0) {
      console.error(`[API] Request blocked by browser/extension`);
      // リトライ
      if (retryCount < MAX_RETRIES) {
        console.log(`[API] Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, RETRY_DELAY * (retryCount + 1)));
        return request(method, path, body, retryCount + 1);
      }
      const blocked = new Error('Request blocked by the browser or an extension');
      blocked.code = 'request_blocked';
      throw blocked;
    }
    
    let data;
    try {
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Invalid response from server (${res.status}): ${text.substring(0, 50)}...`);
      }
    } catch (e) {
      if (e.message.includes('Invalid response')) throw e;
      throw new Error(`Failed to parse response: ${e.message}`);
    }
    
    if (!res.ok) {
      if (res.status === 401 && path !== '/auth/login' && path !== '/auth/change-password') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('hc:unauthorized'));
        }
      }
      console.error(`[API] Error:`, data);
      const err = new Error(data.error || 'Request failed');
      err.status = res.status;
      // サーバーは { error, code, params } を返す。code はクライアント側で翻訳する
      if (data.code) err.code = data.code;
      if (data.params) err.params = data.params;
      throw err;
    }
    
    console.log(`[API] Success:`, data);
    
    if (method !== 'GET') requestCache.clear();

    // GET リクエストはキャッシュに保存
    setCachedRequest(method, path, data);
    
    return data;
  } catch (err) {
    console.error(`[API] Request failed:`, err);
    
    // ネットワークエラーの詳細を表示
    if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
      console.error('[API] Network error - check CORS, firewall, or browser extensions');
      // リトライ
      if (retryCount < MAX_RETRIES) {
        console.log(`[API] Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, RETRY_DELAY * (retryCount + 1)));
        return request(method, path, body, retryCount + 1);
      }
    }
    
    throw err;
  }
}

export const api = {
  login: (accountId, password) => request('POST', '/auth/login', { accountId, password }),
  me: () => request('GET', '/auth/me'),
  updateProfile: (patch) => request('PATCH', '/auth/profile', patch),
  changePassword: async (currentPassword, newPassword) => {
    const res = await request('POST', '/auth/change-password', { currentPassword, newPassword });
    if (res?.token) saveToken(res.token);
    return res;
  },
  members: () => request('GET', '/members'),
  dmOpen: (targetAccountId) => request('POST', '/dm/open', { targetAccountId }),
  dmList: () => request('GET', '/dm/list'),
  markRead: (channelId) => request('POST', '/read', { channelId }),
  getUnread: () => request('GET', '/unread'),
  ytChannel: (url) => request('GET', `/yt-channel?url=${encodeURIComponent(url)}`),
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
};

// DB プロフィール → userState 形式に変換
export function profileToUserState(profile) {
  return {
    accountId: profile.accountId,
    id: `@${profile.accountId}`,
    name: profile.displayName || profile.firstName,
    pronouns: profile.pronouns || '',
    bio: profile.bio || '',
    profileColor1: profile.profileColor1 || '#4f46e5',
    profileColor2: profile.profileColor2 || '#9333ea',
    profileColor3: profile.profileColor3 || null,
    profileBannerColor: profile.profileBannerColor || '#2a2a2e',
    nameStyle: profile.nameStyle || 'solid',
    avatarUrl: profile.avatarUrl || null,
    bannerUrl: profile.bannerUrl || null,
    isMuted: false,
    isDeafened: false,
  };
}
