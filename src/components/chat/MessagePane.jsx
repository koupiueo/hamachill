import React, { useRef, useState, useEffect, useLayoutEffect, useMemo, useCallback, useSyncExternalStore } from 'react';
import { Message } from './Message';
import MessageErrorBoundary from '../ui/MessageErrorBoundary';
import { subscribe, getSnapshot, getMeta, setMeta, updateChannel, hasCache, trimChannel, startLoad, isLoadPending, canRetrySend, retrySend, discardLocalMessage, sendErrorLabel } from '../../utils/messageCache';
import { t, formatDate } from '../../i18n';

const formatTime = (ts) => {
  const d = new Date(ts);
  const now = new Date();
  const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffTime = todayOnly.getTime() - dateOnly.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  const timeStr = formatDate(d, { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 0) return timeStr;
  if (diffDays === 1) return t('time.yesterdayAt', { timeStr });
  return formatDate(d, { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const MessageRow = React.memo(function MessageRow({
  msg,
  prevMsg,
  showUnreadLine,
  isNewArrival,
  channelId,
  membersCache,
  onlineSet,
  currentAccountId,
  currentUser,
  socket,
  onReact,
  onReply,
  onEdit,
  onDelete,
  onVote,
  onAddOption,
  onSubmitFeedback,
  onFeedbackReact,
  onTogglePin,
  onImageClick,
  onOpenProfile,
}) {
  const cache = membersCache?.current || membersCache || {};
  let member = cache[msg.user];
  if (msg.user === 'hamachill') {
    member = {
      accountId: 'hamachill',
      displayName: t('system.name'),
      avatarUrl: '/favicon.png',
      bannerUrl: '/favicon.png',
      nameStyle: 'pop',
      profileColor1: '#fb7185',
      profileColor2: '#fef08a',
      fontFamily: '"Yusei Magic", "M PLUS Rounded 1c", "Comic Sans MS", sans-serif',
      pronouns: 'System',
      bio: t('system.bio')
    };
  }
  const displayName = member?.displayName || member?.firstName || msg.user;
  const avatarUrl = member?.avatarUrl;

  let showDateDivider = false;
  let dividerDateStr = '';
  if (!prevMsg) {
    showDateDivider = true;
  } else {
    const prevDate = new Date(prevMsg.timestamp);
    const currDate = new Date(msg.timestamp);
    if (
      prevDate.getFullYear() !== currDate.getFullYear() ||
      prevDate.getMonth() !== currDate.getMonth() ||
      prevDate.getDate() !== currDate.getDate()
    ) {
      showDateDivider = true;
    }
  }

  if (showDateDivider) {
    const d = new Date(msg.timestamp);
    dividerDateStr = formatDate(d, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  const isContinuation = !showDateDivider && prevMsg && prevMsg.user === msg.user && msg.timestamp - prevMsg.timestamp < 300000 && !msg.replyTo;

  return (
    <div className={`message-item-wrapper ${msg.isSending && !msg.isUploading ? 'opacity-60' : ''}`} data-mid={msg.id}>
      {showDateDivider && (
        <div className="flex items-center my-2 ml-4 mr-4 select-none">
          <div className="flex-1 h-px bg-zinc-950/10"></div>
          <span className="px-4 text-[12px] font-bold text-zinc-400 shrink-0">{dividerDateStr}</span>
          <div className="flex-1 h-px bg-zinc-950/10"></div>
        </div>
      )}
      {showUnreadLine && (
        <div className="flex items-center my-1 ml-4 mr-4 select-none pointer-events-none">
          <div className="flex-1 h-[1px] bg-[#f23f43]"></div>
          <span className="bg-[#f23f43] text-white text-[10px] font-bold px-2 py-1 rounded-full leading-none shrink-0 tracking-wider shadow-xs">
            {t('message.new')}
          </span>
        </div>
      )}
      <MessageErrorBoundary messageId={msg.id} resetKey={`${msg.updatedAt || ''}:${msg.text || ''}`}>
      <Message
        {...msg}
        user={displayName}
        msgAccountId={msg.user}
        avatarUrl={avatarUrl}
        isOnline={onlineSet?.has(msg.user)}
        onReact={onReact}
        onReply={onReply}
        onEdit={onEdit}
        onDelete={onDelete}
        onVote={onVote}
        onAddOption={onAddOption}
        onSubmitFeedback={onSubmitFeedback}
        onFeedbackReact={onFeedbackReact}
        onTogglePin={onTogglePin}
        pollVotes={msg.pollVotes}
        isPinned={msg.isPinned}
        time={formatTime(msg.timestamp)}
        isContinuation={isContinuation}
        channelId={channelId}
        socket={socket}
        onImageClick={onImageClick}
        onOpenProfile={onOpenProfile}
        currentUser={currentUser}
        currentAccountId={currentAccountId}
        authorProfile={member}
        membersCache={cache}
        isNewArrival={isNewArrival}
      />
      </MessageErrorBoundary>
      {msg.error && (
        <div className="flex items-center gap-2 pl-[72px] pr-4 pb-1 text-[12px] text-[#f23f43] select-none">
          <span>⚠ {msg.error === 'Upload failed' ? t('common.uploadFailed') : sendErrorLabel(msg.error)}</span>
          {canRetrySend(msg.id) && (
            <button type="button" className="underline hover:opacity-80" onClick={() => retrySend(socket, channelId, msg.id)}>{t('message.resend')}</button>
          )}
          <button type="button" className="underline hover:opacity-80" onClick={() => discardLocalMessage(channelId, msg.id)}>{t('common.delete')}</button>
        </div>
      )}
    </div>
  );
});

MessageRow.displayName = 'MessageRow';

// ─────────────────────────────────────────────────────────────
// スクロールの仕組み（Discord / Slack と同じ考え方）
//
// ・仮想スクロールは使わない。メッセージは全部 DOM に置く（一番下に戻ったら古い方を減らして軽く保つ）。
//   （行の高さを推定しないので、推定ズレによるガタつきが起きない）
// ・スクロール領域は flex-direction: column-reverse。スクロールの原点が「一番下」になるので、
//   一番下にいる間は scrollTop = 0 のまま。新着・画像の読み込み・入力欄の伸び縮みがあっても、
//   ブラウザのレイアウトだけで一番下に留まる（JS で追いかけないのでフレーム遅れが無い）。
//   ※ column-reverse の scrollTop は 0 が一番下、上へ行くほどマイナス。
// ・スクロール中・画像の読み込み中は JS で scrollTop を一切触らない（ガタつきの元を作らない）。
//   上に過去ログが足されても、column-reverse なので見ている行はそのまま。
// ・JS が直すのは「上の方を読んでいる最中に、メッセージ配列の変化で画面より下が変わったとき」だけ
//   （新着・削除・下側の切り詰め）。変化の直前に一番下に見えている行を撮り、描画前に同じ位置へ戻す。
//   もう一つは、画面より下の行が後から伸びたとき（遅れて読み込まれた画像など）。その分だけ打ち消す。
//   ブラウザ標準のスクロールアンカーは二重補正になるので切る（overflow-anchor: none）。
// ─────────────────────────────────────────────────────────────

const BOTTOM_EPS = 2;        // これ以下なら「一番下」
// 端からこの距離に来たら次を読み込む。端に「ぶつかる」前に読み終えたいので広めに取る
// （端に張り付いたまま過去ログが足されると、ブラウザが端に合わせて一気に動くことがある）。
const LOAD_MARGIN_SCREENS = 3;
const KEEP_AT_BOTTOM = 100;  // 一番下に戻ってきたら、この件数まで古いものを捨てる（DOM を軽く保つ）
const TRIM_OVER = 150;
const SCROLL_IDLE_MS = 250;  // 最後のスクロールからこれだけ経ったら「止まった」とみなす

// next が prev の「上（古い側）に足しただけ」か
function isOlderPrepend(prev, next) {
  if (!prev.length || next.length <= prev.length) return false;
  const off = next.length - prev.length;
  return next[off]?.id === prev[0].id && next[next.length - 1]?.id === prev[prev.length - 1].id;
}

// next が prev の「下（新しい側）に足しただけ」か
function isNewerAppend(prev, next) {
  if (!prev.length || next.length <= prev.length) return false;
  return next[0]?.id === prev[0].id && next[prev.length - 1]?.id === prev[prev.length - 1].id;
}

const MessagePane = React.memo(function MessagePane({
  channelId,
  isActive,
  onAtBottomChange,
  onScrollRef,
  onScrollToBottomRef,
  socket,
  currentUser,
  currentUserState,
  onlineSet,
  membersCache,
  membersVersion,
  onReact,
  onReply,
  onEdit,
  onDelete,
  onVote,
  onAddOption,
  onSubmitFeedback,
  onFeedbackReact,
  onTogglePin,
  onImageClick,
  onOpenProfile,
}) {
  const subscribeCh = useCallback((fn) => subscribe(channelId, fn), [channelId]);
  const storeMessages = useSyncExternalStore(subscribeCh, () => getSnapshot(channelId));

  // ── スクロール中は過去ログを DOM に足さない ──
  // Chrome などのなめらかスクロールは「上端から何 px の位置へ動かす」というアニメーションで動く。
  // 動いている最中に上へ過去ログが足されると、アニメーションが古い目標位置へ進み続け、
  // 足した分（数百〜数千 px）だけ一気に飛ぶ。なので過去ログは、スクロールが止まってから足す。
  const lastScrollAtRef = useRef(0);
  const idleTimerRef = useRef(null);
  const shownRef = useRef({ ch: channelId, list: storeMessages });
  const [, forceRender] = useState(0);
  const atBottomRef = useRef(true);
  let messages = storeMessages;
  {
    const prev = shownRef.current;
    // 下（新しい側）に足すときも同じ。検索などで過去へ飛んだあと下へスクロールしていくと
    // load_newer で下に新しいメッセージが足される。そのとき見ている行を戻す補正（scrollTop の書き換え）が
    // なめらかスクロールのアニメーションに上書きされ、足した分だけ下へ飛ぶ → 繰り返して一番下まで行ってしまう。
    // 一番下に張り付いているとき（普通の新着）はブラウザが下端に留めるので保留しない。
    const holdNewer = !atBottomRef.current && isNewerAppend(prev.list, storeMessages);
    if (prev.ch === channelId && prev.list !== storeMessages
      && (isOlderPrepend(prev.list, storeMessages) || holdNewer)
      && performance.now() - lastScrollAtRef.current < SCROLL_IDLE_MS) {
      messages = prev.list; // まだ足さない（止まったら足す）
    }
    shownRef.current = { ch: channelId, list: messages };
  }
  const isHolding = useCallback(() => shownRef.current.list !== getSnapshot(channelId), [channelId]);

  const meta = useSyncExternalStore(subscribeCh, () => getMeta(channelId));
  const hasMore = meta.hasMore;
  const hasNewer = meta.hasNewer;

  const [loadingMore, setLoadingMore] = useState(false);
  const isInitialLoading = !hasCache(channelId) && messages.length === 0;
  const [showSkeleton, setShowSkeleton] = useState(false);

  const scrollRef = useRef(null);
  const listRef = useRef(null);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const hasNewerRef = useRef(hasNewer);
  hasNewerRef.current = hasNewer;

  // 新着アニメーション：「最新の端にいる状態で、下に数件だけ足された」ときだけ付ける。
  // 過去ログ読み込み（上に足す）や load_newer（ジャンプ後に下へ読み進める）は新着ではない。
  const arrivalPrevRef = useRef({ ch: channelId, list: messages, hadNewer: hasNewer });
  const arrivalsInWindowRef = useRef([]);
  const animatedIdsRef = useRef(new Set());
  {
    const prev = arrivalPrevRef.current;
    if (prev.ch !== channelId) {
      animatedIdsRef.current.clear();
    } else if (prev.list !== messages && !prev.hadNewer && isNewerAppend(prev.list, messages)
      && messages.length - prev.list.length <= 3) {
      const now = Date.now();
      arrivalsInWindowRef.current = arrivalsInWindowRef.current.filter(t => now - t < 1000);
      if (arrivalsInWindowRef.current.length < 5) {
        arrivalsInWindowRef.current.push(now);
        for (let idx = prev.list.length; idx < messages.length; idx++) {
          if (messages[idx]?.id) animatedIdsRef.current.add(messages[idx].id);
        }
      }
    }
    arrivalPrevRef.current = { ch: channelId, list: messages, hadNewer: hasNewer };
  }

  // 一番下に「張り付いている」= 一番下にいて、かつその下に未読込の新しいメッセージが無い
  const isPinned = () => atBottomRef.current && !hasNewerRef.current;

  const reportAtBottom = useCallback((b) => {
    if (atBottomRef.current === b) return;
    atBottomRef.current = b;
    if (isActiveRef.current) onAtBottomChange?.(channelId, b);
  }, [channelId, onAtBottomChange]);

  // 画面の一番下に見えている行と、その下端の位置（読むだけ。scrollTop は触らない）
  const measureAnchor = () => {
    const el = scrollRef.current;
    if (!el || el.clientHeight === 0 || isPinned()) return null;
    const box = el.getBoundingClientRect();
    const rows = listRef.current?.children || [];
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (!r.dataset?.mid) continue;
      const rect = r.getBoundingClientRect();
      if (rect.top >= box.bottom) continue;
      return { id: r.dataset.mid, bottom: rect.bottom };
    }
    return null;
  };

  // メッセージ配列が変わる「直前」の位置を、レンダー中（DOM がまだ古いうち）に撮っておく。
  // getSnapshotBeforeUpdate と同じ考え方。
  const prevMessagesRef = useRef(messages);
  const snapshotRef = useRef(null);
  if (prevMessagesRef.current !== messages) {
    prevMessagesRef.current = messages;
    snapshotRef.current = measureAnchor();
  }

  const loadMore = useCallback(() => {
    const first = getSnapshot(channelId)[0];
    if (!getMeta(channelId).hasMore || isLoadPending(channelId) || !first || isHolding()) return;
    setLoadingMore(true);
    socket?.emit('load_more', { channelId, before: first.timestamp, reqId: startLoad(channelId) });
  }, [channelId, socket, isHolding]);

  const loadNewer = useCallback(() => {
    const arr = getSnapshot(channelId);
    const last = arr[arr.length - 1];
    if (!getMeta(channelId).hasNewer || isLoadPending(channelId) || !last || isHolding()) return;
    setLoadingMore(true);
    socket?.emit('load_newer', { channelId, after: last.timestamp, reqId: startLoad(channelId) });
  }, [channelId, socket, isHolding]);

  // 端に近づいたら読み込む
  const checkEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.clientHeight === 0) return;
    const fromBottom = -el.scrollTop;
    const fromTop = el.scrollHeight - el.clientHeight - fromBottom;
    const margin = Math.max(2000, el.clientHeight * LOAD_MARGIN_SCREENS);
    if (fromTop < margin) loadMore();
    else if (fromBottom < margin && hasNewerRef.current) loadNewer();
  }, [loadMore, loadNewer]);

  // スクロール中は何も書き換えない（読むだけ）。ブラウザのスクロールに一切割り込まない。
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.clientHeight === 0) return; // Activity で非表示中
    lastScrollAtRef.current = performance.now();
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      // 止まった。保留していた過去ログがあれば今足す
      if (isHolding()) forceRender(n => n + 1);
    }, SCROLL_IDLE_MS + 20);
    reportAtBottom(-el.scrollTop <= BOTTOM_EPS);
    checkEdges();
  }, [reportAtBottom, checkEdges, isHolding]);
  useEffect(() => () => clearTimeout(idleTimerRef.current), []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    reportAtBottom(true);
  }, [reportAtBottom]);

  // メッセージが変わったとき、位置を直すのは「見ている行が実際に動いたとき」だけ。
  // ・上に過去ログが足される → column-reverse なので見ている行は動かない → 何もしない
  // ・下に新着が来る / 下側が消える・伸びる → 見ている行が押し上げられる → その分だけ戻す
  // ・一番下にいるとき → scrollTop = 0 のままブラウザが下端に留める → 何もしない
  useLayoutEffect(() => {
    const a = snapshotRef.current;
    snapshotRef.current = null;
    const el = scrollRef.current;
    if (!a || !el) return;
    const node = listRef.current?.querySelector(`[data-mid="${CSS.escape(a.id)}"]`);
    if (!node) return;
    const moved = node.getBoundingClientRect().bottom - a.bottom;
    if (Math.abs(moved) >= 1) el.scrollTop += moved;
  }, [messages]);

  // 画面より「下」にある行の高さが変わったとき（読み込みが遅れた画像など）だけ、その分を打ち消す。
  // column-reverse では下の行が伸びると画面の中身ごと押し上げられるため。
  // 画面内・画面より上の行が伸びたときは何もしない（上へ伸びるだけで、読んでいる場所は動かない）。
  // スクロールイベントでは何もしないので、スクロール操作と取り合いにならない。
  const rowHeightsRef = useRef(new WeakMap());
  const rowObserverRef = useRef(null);
  useLayoutEffect(() => {
    const ro = new ResizeObserver((entries) => {
      const el = scrollRef.current;
      if (!el || el.clientHeight === 0) return;
      const heights = rowHeightsRef.current;
      const viewBottom = el.getBoundingClientRect().bottom;
      let below = 0;
      for (const e of entries) {
        const r = e.target;
        const rect = r.getBoundingClientRect();
        const prev = heights.get(r);
        heights.set(r, rect.height);
        if (prev === undefined || rect.height === 0) continue; // 初回（新しく出た行）は対象外
        const delta = rect.height - prev;
        // 伸びる前の上端が画面の下端より下 = 画面より下の行（下端は動かないので rect.bottom 基準で判定）
        if (rect.bottom - prev >= viewBottom) below += delta;
      }
      if (isPinned() || Math.abs(below) < 1) return;
      el.scrollTop -= below;
    });
    rowObserverRef.current = ro;
    return () => { ro.disconnect(); rowObserverRef.current = null; };
  }, []);

  useLayoutEffect(() => {
    const ro = rowObserverRef.current;
    const rows = listRef.current?.children;
    if (!ro || !rows) return;
    for (const r of rows) if (r.dataset?.mid) ro.observe(r); // 同じ要素の observe は重複しない
  }, [messages, isInitialLoading, showSkeleton]);

  // 区間が差し替えられて待ち中の読み込みが捨てられたら、読み込み中表示も消す
  useEffect(() => {
    if (loadingMore && !isLoadPending(channelId)) setLoadingMore(false);
  }, [messages, loadingMore, channelId]);

  // 読み込み後もまだ画面が埋まっていなければ続けて読む
  useEffect(() => {
    if (!loadingMore) checkEdges();
  }, [messages, loadingMore, checkEdges]);

  // 一番下に戻ってきたら古いメッセージを捨てて DOM を軽くする（上側を消すので見た目は動かない）
  useEffect(() => {
    if (!atBottomRef.current || hasNewer || messages.length <= TRIM_OVER) return;
    const t = setTimeout(() => {
      if (atBottomRef.current && !getMeta(channelId).hasNewer) trimChannel(channelId, KEEP_AT_BOTTOM);
    }, 1500);
    return () => clearTimeout(t);
  }, [messages.length, hasNewer, channelId]);

  useEffect(() => {
    if (isActive && onScrollToBottomRef) onScrollToBottomRef(channelId, scrollToBottom);
  }, [isActive, channelId, onScrollToBottomRef, scrollToBottom]);

  useEffect(() => {
    if (isActive) onAtBottomChange?.(channelId, atBottomRef.current);
  }, [isActive, channelId, onAtBottomChange]);

  useEffect(() => {
    if (isActive && onScrollRef && scrollRef.current) onScrollRef(channelId, scrollRef.current);
  }, [isActive, channelId, onScrollRef, isInitialLoading, showSkeleton]);

  useEffect(() => {
    if (!isInitialLoading) {
      setShowSkeleton(false);
      return;
    }
    const timer = setTimeout(() => setShowSkeleton(true), 150);
    return () => clearTimeout(timer);
  }, [isInitialLoading, channelId]);

  // チャンネルを開いたとき（Activity で表示に戻ったときも）は、どこを読んでいても最新のメッセージへ。
  useLayoutEffect(() => {
    if (getMeta(channelId).hasNewer) {
      // 過去へジャンプしていて最新が読み込まれていない → 最新を読み直す
      updateChannel(channelId, () => []);
      setMeta(channelId, { hasNewer: false });
      hasNewerRef.current = false;
      socket?.emit('join_room', channelId);
    }
    atBottomRef.current = true;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLoadingMore(isLoadPending(channelId));
    if (!socket) return;
    const onDone = ({ channelId: cid }) => {
      if (cid === channelId) setLoadingMore(isLoadPending(channelId));
    };
    socket.on('load_more_result', onDone);
    socket.on('load_newer_result', onDone);
    return () => {
      socket.off('load_more_result', onDone);
      socket.off('load_newer_result', onDone);
    };
  }, [socket, channelId]);

  const lastReadAtState = meta.lastReadAt || 0;
  const currentAccountId = currentUserState?.accountId;

  const firstUnreadIndex = useMemo(() => (lastReadAtState > 0
    ? messages.findIndex(m => m.timestamp > lastReadAtState && m.user !== currentAccountId)
    : -1), [messages, lastReadAtState, currentAccountId]);

  // ── メッセージへジャンプ ──
  const pendingJumpRef = useRef(null);
  const jumpTo = useCallback((msgId) => {
    const el = scrollRef.current;
    const node = listRef.current?.querySelector(`[data-mid="${CSS.escape(msgId)}"]`);
    if (!el || !node) return false;
    const s = el.getBoundingClientRect();
    const t = node.getBoundingClientRect();
    // 画面の中央へ（長いメッセージは先頭が見えるように）
    const offset = t.height > s.height ? 16 : (s.height - t.height) / 2;
    el.scrollTop += t.top - s.top - offset;
    reportAtBottom(-el.scrollTop <= BOTTOM_EPS);
    const row = node.querySelector('.message-row') || node;
    row.style.transition = 'background-color 0.3s ease';
    row.style.backgroundColor = 'rgba(0, 0, 0, 0.06)';
    setTimeout(() => {
      row.style.transition = 'background-color 1.2s ease';
      row.style.backgroundColor = '';
      setTimeout(() => { row.style.transition = ''; }, 1200);
    }, 1500);
    return true;
  }, [reportAtBottom]);

  // 前後を読み直してからのジャンプ（DOM に出たら描画前に飛ぶ）
  useLayoutEffect(() => {
    if (pendingJumpRef.current && jumpTo(pendingJumpRef.current)) pendingJumpRef.current = null;
  }, [messages, jumpTo]);

  useEffect(() => {
    const handleJump = (e) => {
      if (!isActive) return;
      const fullMsgId = e.detail?.msgId;
      if (!fullMsgId) return;
      const msgId = fullMsgId.split('_')[0];
      if (!jumpTo(msgId)) pendingJumpRef.current = msgId;
    };
    window.addEventListener('fetch_and_jump_message', handleJump);
    window.addEventListener('jump_ready', handleJump);
    return () => {
      window.removeEventListener('fetch_and_jump_message', handleJump);
      window.removeEventListener('jump_ready', handleJump);
    };
  }, [isActive, jumpTo]);

  if (isInitialLoading && !showSkeleton) {
    return <div className="absolute inset-0" />;
  }

  if (showSkeleton) {
    return (
      <div className="absolute inset-0">
        <div key={`loading-${channelId}`} className="absolute inset-0 flex flex-col justify-end gap-6 p-4 opacity-60 overflow-hidden pointer-events-none">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-start gap-4 w-full">
              <div className="w-10 h-10 rounded-full bg-zinc-200/80 animate-pulse shrink-0" />
              <div className="flex flex-col gap-2 flex-1 pt-1">
                <div className="flex items-center gap-2">
                  <div className="w-24 h-4 bg-zinc-200/80 rounded animate-pulse" />
                  <div className="w-12 h-3 bg-zinc-100/80 rounded animate-pulse" />
                </div>
                <div className={`h-4 bg-zinc-200/80 rounded animate-pulse ${i % 3 === 0 ? 'w-3/4' : i % 2 === 0 ? 'w-1/2' : 'w-full'}`} />
                {i % 4 === 0 && <div className="w-2/3 h-4 bg-zinc-200/80 rounded animate-pulse" />}
                {i % 5 === 0 && <div className="w-48 h-32 bg-zinc-200/80 rounded-xl animate-pulse mt-1" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto overflow-x-hidden flex flex-col-reverse"
        style={{ overflowAnchor: 'none', overscrollBehavior: 'contain' }}
      >
        <div ref={listRef} className="flex flex-col">
          {hasMore ? (
            <div className="text-center py-2 shrink-0 min-h-8">
              {loadingMore && <div className="text-xs text-zinc-400">{t('common.loading')}</div>}
            </div>
          ) : messages.length > 0 && (
            <div className="text-center text-[11px] text-zinc-900/20 py-3">{t('chat.channelStart')}</div>
          )}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center pt-20 pb-10">
              <div className="w-20 h-20 bg-zinc-950/5 rounded-full flex items-center justify-center mb-4">
                <span className="text-4xl">👋</span>
              </div>
              <h3 className="text-xl font-black text-zinc-900 tracking-tight">{t('chat.startConversation')}</h3>
              <p className="text-sm text-zinc-500 mt-2 text-center max-w-sm leading-relaxed">
                {t('chat.noMessages')}<br />
                {t('chat.sendFirst')}
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <MessageRow
              key={msg._key || msg.id}
              msg={msg}
              prevMsg={messages[i - 1]}
              showUnreadLine={i === firstUnreadIndex}
              isNewArrival={animatedIdsRef.current.has(msg.id)}
              channelId={channelId}
              membersCache={membersCache}
              membersVersion={membersVersion}
              onlineSet={onlineSet}
              currentAccountId={currentAccountId}
              currentUser={currentUser}
              socket={socket}
              onReact={onReact}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onVote={onVote}
              onAddOption={onAddOption}
              onSubmitFeedback={onSubmitFeedback}
              onFeedbackReact={onFeedbackReact}
              onTogglePin={onTogglePin}
              onImageClick={onImageClick}
              onOpenProfile={onOpenProfile}
            />
          ))}
          {hasNewer && (
            <div className="text-center py-2 shrink-0 min-h-8">
              {loadingMore && <div className="text-xs text-zinc-400">{t('common.loading')}</div>}
            </div>
          )}
          <div className="h-5 shrink-0" aria-hidden />
        </div>
      </div>
    </div>
  );
});

MessagePane.displayName = 'MessagePane';

export default MessagePane;
