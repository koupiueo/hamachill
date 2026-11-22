import { t } from '../i18n';
// メッセージ配列はここでは切り詰めない。
// 読んでいる最中に上下どちらかを切ると、見ている位置が一気にずれる（column-reverse では特に下側）。
// 減らすのは「一番下に戻ってきたとき」だけで、それは MessagePane が trimChannel で行う。
export const globalMessageCache = (typeof window !== 'undefined' && (window.__GLOBAL_MESSAGE_CACHE__ = window.__GLOBAL_MESSAGE_CACHE__ || {})) || {};
export const globalHasMoreCache = {};
export const globalLastReadCache = {};
export const globalHasNewerCache = {};
export const scrollCache = {};
export const messageCache = globalMessageCache;
export const hasMoreCache = globalHasMoreCache;

const EMPTY = Object.freeze([]);
const subs = new Map(); // channelId -> Set<fn>

export const getSnapshot = (ch) => globalMessageCache[ch] || EMPTY;
export const hasCache = (ch) => Object.prototype.hasOwnProperty.call(globalMessageCache, ch);
const globalMetaCache = {};
function refreshMeta(ch) {
  const next = {
    hasMore: !!globalHasMoreCache[ch],
    hasNewer: !!globalHasNewerCache[ch],
    lastReadAt: globalLastReadCache[ch] || 0
  };
  const cur = globalMetaCache[ch];
  if (!cur || cur.hasMore !== next.hasMore || cur.hasNewer !== next.hasNewer || cur.lastReadAt !== next.lastReadAt) {
    globalMetaCache[ch] = next;
  }
}

export const getMeta = (ch) => {
  if (!globalMetaCache[ch]) {
    refreshMeta(ch);
  }
  return globalMetaCache[ch];
};

export const setMeta = (ch, meta) => {
  if (meta.hasMore !== undefined) globalHasMoreCache[ch] = meta.hasMore;
  if (meta.hasNewer !== undefined) globalHasNewerCache[ch] = meta.hasNewer;
  if (meta.lastReadAt !== undefined) globalLastReadCache[ch] = meta.lastReadAt;
  refreshMeta(ch);
  notify(ch);
};


export function subscribe(ch, fn) {
  if (!subs.has(ch)) subs.set(ch, new Set());
  subs.get(ch).add(fn);
  return () => subs.get(ch)?.delete(fn);
}

function notify(ch) {
  refreshMeta(ch);
  subs.get(ch)?.forEach(f => f());
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cache_updated', { detail: { channelId: ch } })); // ChannelList / ForumArea 用
  }
}

export function setChannel(ch, next) {
  const actualNext = (next === EMPTY && !hasCache(ch)) ? [] : next;
  if (globalMessageCache[ch] === actualNext) return;
  globalMessageCache[ch] = actualNext;
  notify(ch);
}

export const updateChannel = (ch, fn) => setChannel(ch, fn(getSnapshot(ch)));

// ── 読み込みの世代管理 ──
// 検索などで「別の区間」に丸ごと差し替えたあと、差し替え前に出していた load_more / load_newer の
// 返事が遅れて届くと、関係ない区間のメッセージが混ざって間が抜ける（下へ行くと一気に最新まで飛ぶ）。
// しかも返事を待っている間は次の読み込みが出せない。そこで読み込みごとに番号を振り、
// 差し替えたら待ち中の番号を捨てる。番号が合わない返事は無視する。
let nextReqId = 1;
const pendingReq = {};   // channelId -> { id, at } 待っている読み込み（無ければ undefined）
const windowGen = {};    // channelId -> 区間を差し替えた回数
const LOAD_TIMEOUT_MS = 8000; // 返事が来ないまま固まらないよう、これを過ぎたら待つのをやめる
export const getWindowGen = (ch) => windowGen[ch] || 0;
export const isLoadPending = (ch) => {
  const p = pendingReq[ch];
  if (!p) return false;
  if (Date.now() - p.at > LOAD_TIMEOUT_MS) { delete pendingReq[ch]; return false; }
  return true;
};
export function startLoad(ch) {
  const id = nextReqId++;
  pendingReq[ch] = { id, at: Date.now() };
  return id;
}
// 返事が今待っているものか（古い返事・差し替え前の返事なら false）
function acceptLoad(ch, reqId) {
  if (reqId === undefined) {
    // 番号を返さない古いサーバー：従来どおり受け取って待ちを解く
    delete pendingReq[ch];
    return true;
  }
  if (pendingReq[ch]?.id !== reqId) return false;
  delete pendingReq[ch];
  return true;
}
// 表示する区間を丸ごと差し替える（メッセージへのジャンプなど）
export function replaceWindow(ch, msgs, meta) {
  windowGen[ch] = getWindowGen(ch) + 1;
  delete pendingReq[ch];
  if (meta) {
    if (meta.hasMore !== undefined) globalHasMoreCache[ch] = meta.hasMore;
    if (meta.hasNewer !== undefined) globalHasNewerCache[ch] = meta.hasNewer;
  }
  setChannel(ch, msgs);
}

const sameMsg = (a, b) => a.updatedAt === b.updatedAt && a.text === b.text && !!a.isDeleted === !!b.isDeleted
  && a.imageUrl === b.imageUrl && a.isPinned === b.isPinned;

// prev と incoming を id で合わせる。変わっていない行は prev のオブジェクトを使い回す
export function mergeWindow(prev, incoming) {
  const map = new Map(prev.map(m => [m.id, m]));
  for (const m of incoming) {
    const old = map.get(m.id);
    if (m.isDeleted) { map.delete(m.id); continue; }
    if (!old || !sameMsg(old, m)) map.set(m.id, old?._key ? { ...m, _key: old._key } : m);
  }
  const out = [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
  if (out.length === prev.length && out.every((m, i) => m === prev[i])) return prev;
  return out;
}

export function trimChannel(ch, limit = 50) {
  const current = getSnapshot(ch);
  if (current.length <= limit) return;
  const sliced = current.slice(-limit);
  setMeta(ch, { hasMore: true });
  setChannel(ch, sliced);
}

const patch = (ch, id, fields) => updateChannel(ch, arr => {
  const i = arr.findIndex(m => m.id === id);
  if (i === -1) return arr;
  const next = arr.slice();
  next[i] = { ...arr[i], ...fields };
  return next;
});

// サーバーで確定したメッセージを反映（receive_message / send_message の ack 共通）
// clientTempId が一致する仮メッセージがあれば置き換える
function upsertServerMessage(data) {
  if (!data) return;
  const { clientTempId, ...msg } = data;
  if (clientTempId) retryPayloads.delete(clientTempId);
  if (!hasCache(data.channelId)) return;

  updateChannel(data.channelId, arr => {
    const i = arr.findIndex(m => m.id === msg.id || (clientTempId && m.id === clientTempId));
    let next;
    if (i === -1) {
      // 過去へジャンプしていて、いま持っているのが途中の区間（下にまだ読んでいない分がある）なら、
      // 新着を末尾に足すと間が抜けて、下へスクロールしたとき一気に最新まで飛んでしまう。
      // その場合は足さない（下へ読み進めれば load_newer で正しい順に入ってくる）。
      if (globalHasNewerCache[data.channelId]) return arr;
      next = [...arr, msg];
    } else {
      const oldMsg = arr[i];
      if (oldMsg?._objectUrl && typeof URL !== 'undefined') {
        try { URL.revokeObjectURL(oldMsg._objectUrl); } catch { /* ignore */ }
      }
      next = arr.slice();
      next[i] = { ...arr[i], ...msg, isUploading: false, isSending: false, error: undefined, _local: false, _key: arr[i]._key || arr[i].id };
    }
    return next;
  });
}

// ── 送信（ack 付き） ──
// サーバーから ok が返るまで「送信中」、エラー・タイムアウトなら「送信失敗」にする。
const SEND_TIMEOUT_MS = 10000;
const retryPayloads = new Map(); // clientTempId -> 再送用の payload
const LOCAL_FIELDS = ['_objectUrl', '_key', '_local', 'isUploading', 'uploadProgress', 'error', 'isSending'];
const findCached = (ch, id) => (Array.isArray(globalMessageCache[ch]) ? globalMessageCache[ch].find(m => m.id === id) : undefined);

const SEND_ERROR_LABELS = {
  rate_limited: t('sendErrors.rateLimited'),
  forbidden: t('sendErrors.forbidden'),
  too_long: t('sendErrors.tooLong'),
  timeout: t('sendErrors.timeout'),
  too_large_file: t('errors.fileTooLarge'),
};
export const sendErrorLabel = (err) => SEND_ERROR_LABELS[err] || t('sendErrors.unknown');

export function sendMessage(socket, payload) {
  if (!socket || !payload) return Promise.resolve({ ok: false, error: 'no_socket' });
  const ch = payload.channelId;
  const tempId = payload.clientTempId || payload.id;
  const clean = { ...payload, clientTempId: tempId };
  LOCAL_FIELDS.forEach(k => { delete clean[k]; });
  if (tempId) retryPayloads.set(tempId, clean);
  if (ch && tempId) patch(ch, tempId, { isSending: true, _local: true, error: undefined });

  return new Promise((resolve) => {
    const onFail = (error) => {
      const cached = ch && tempId ? findCached(ch, tempId) : undefined;
      if (cached) {
        patch(ch, tempId, { isSending: false, isUploading: false, error: error || 'send failed' });
      } else if (typeof window !== 'undefined' && error !== 'timeout') {
        // 仮メッセージを出していない送信（投票・スレッド作成など）は気づけるように通知
        window.alert(t('sendErrors.failed', { reason: sendErrorLabel(error) }));
      }
      resolve({ ok: false, error });
    };
    socket.timeout(SEND_TIMEOUT_MS).emit('send_message', clean, (err, res) => {
      if (err) return onFail('timeout');
      if (res && res.ok) {
        if (tempId) retryPayloads.delete(tempId);
        if (res.message) upsertServerMessage(res.message);
        return resolve({ ok: true, message: res.message });
      }
      onFail(res?.error || 'send failed');
    });
  });
}

// 送信失敗したメッセージを再送できるか（アップロード自体に失敗したものは再送できない）
export const canRetrySend = (id) => retryPayloads.has(id);

export function retrySend(socket, ch, id) {
  const payload = retryPayloads.get(id);
  if (!payload) return;
  return sendMessage(socket, { ...payload, channelId: ch });
}

// 送信失敗したメッセージを画面から消す
export function discardLocalMessage(ch, id) {
  retryPayloads.delete(id);
  updateChannel(ch, arr => {
    const m = arr.find(x => x.id === id);
    if (m?._objectUrl && typeof URL !== 'undefined') {
      try { URL.revokeObjectURL(m._objectUrl); } catch { /* ignore */ }
    }
    return arr.filter(x => x.id !== id);
  });
}

// ── スレッドの履歴読み込み（join_room / preload）を 1 スレッド 1 回に抑える ──
const requestedThreadRooms = new Set();
// まだ頼んでいない room だけを返して「頼んだ」印を付ける
export function takeUnrequestedRooms(roomIds) {
  const out = [];
  for (const id of roomIds) {
    if (typeof id !== 'string' || requestedThreadRooms.has(id)) continue;
    requestedThreadRooms.add(id);
    out.push(id);
  }
  return out;
}
export function joinRoomOnce(socket, roomId) {
  if (!socket || !roomId) return;
  if (takeUnrequestedRooms([roomId]).length) socket.emit('join_room', roomId);
}

// まだ頼んでいない room をまとめて preload_channels で取る（サーバーは 1 回 100 件まで）
export function preloadRoomsOnce(socket, roomIds) {
  if (!socket) return;
  const ids = takeUnrequestedRooms(roomIds);
  for (let i = 0; i < ids.length; i += 100) socket.emit('preload_channels', ids.slice(i, i + 100));
}

// スレッド一覧（forum_metadata 全件）を取得してキャッシュに入れる。
// 専用イベントが無い古いサーバーなら join_room（最新 30 件）にフォールバック
export function fetchForumThreads(socket) {
  if (!socket) return;
  socket.timeout(8000).emit('forum_threads', {}, (err, res) => {
    if (err || !res || !res.ok || !Array.isArray(res.messages)) {
      if (!hasCache('forum_metadata')) socket.emit('join_room', 'forum_metadata');
      return;
    }
    setChannel('forum_metadata', mergeWindow(getSnapshot('forum_metadata'), res.messages));
  });
}

let initialized = false;
export const initMessageCache = (socket) => {
  if (initialized || !socket) return;
  initialized = true;

  socket.on('all_channels_history', (all) => {
    for (const [ch, d] of Object.entries(all)) {
      setMeta(ch, { hasMore: d.hasMore, ...(d.lastReadAt ? { lastReadAt: d.lastReadAt } : {}) });
      setChannel(ch, mergeWindow(getSnapshot(ch), d.messages || []));
    }
  });

  socket.on('message_history', ({ channelId, messages, hasMore, lastReadAt }) => {
    if (!channelId) return;
    const meta = { hasMore };
    if (lastReadAt && !globalLastReadCache[channelId]) meta.lastReadAt = lastReadAt;
    setMeta(channelId, meta);
    setChannel(channelId, mergeWindow(getSnapshot(channelId), messages || []));
  });

  socket.on('receive_message', (data) => upsertServerMessage(data));

  socket.on('load_more_result', ({ channelId, messages, hasMore, reqId }) => {
    if (!acceptLoad(channelId, reqId)) return;
    setMeta(channelId, { hasMore });
    setChannel(channelId, mergeWindow(getSnapshot(channelId), messages || []));
  });

  socket.on('load_newer_result', ({ channelId, messages, hasNewer, reqId }) => {
    if (!acceptLoad(channelId, reqId)) return;
    setMeta(channelId, { hasNewer });
    setChannel(channelId, mergeWindow(getSnapshot(channelId), messages || []));
  });

  socket.on('message_edited', (m) => patch(m.channelId, m.id, {
    text: m.text,
    isEdited: !!m.isEdited,
    editHistory: m.editHistory,
    updatedAt: m.updatedAt
  }));

  socket.on('reaction_updated', ({ channelId, messageId, reactions }) => patch(channelId, messageId, { reactions }));

  socket.on('poll_voted', ({ channelId, messageId, pollVotes }) => patch(channelId, messageId, { pollVotes }));

  socket.on('message_pinned', ({ channelId, messageId, isPinned }) => patch(channelId, messageId, { isPinned }));

  socket.on('message_deleted', ({ channelId, messageId }) => updateChannel(channelId, arr => arr.filter(m => m.id !== messageId)));

  socket.on('send_error', ({ clientTempId, error }) => {
    for (const ch of Object.keys(globalMessageCache)) {
      const msgs = globalMessageCache[ch];
      if (Array.isArray(msgs)) {
        const oldMsg = msgs.find(m => m.id === clientTempId);
        if (oldMsg?._objectUrl && typeof URL !== 'undefined') {
          try { URL.revokeObjectURL(oldMsg._objectUrl); } catch { /* ignore */ }
        }
      }
      patch(ch, clientTempId, { isUploading: false, error: error || 'send failed' });
    }
  });
};

export function resetMessageCache() {
  for (const k of Object.keys(globalMessageCache)) delete globalMessageCache[k];
  for (const k of Object.keys(globalHasMoreCache)) delete globalHasMoreCache[k];
  for (const k of Object.keys(globalLastReadCache)) delete globalLastReadCache[k];
  for (const k of Object.keys(globalHasNewerCache)) delete globalHasNewerCache[k];
  for (const k of Object.keys(globalMetaCache)) delete globalMetaCache[k];
  requestedThreadRooms.clear();
  retryPayloads.clear();
  for (const ch of subs.keys()) notify(ch);
}

