import React, { Suspense, Activity, useState, useRef, useEffect, useMemo, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import PanelHeader from '../ui/PanelHeader';
import UserProfileCard from '../ui/UserProfileCard';
import { Bell, BellSlash, PushPin, BookmarkSimple, MagnifyingGlass, ArrowDown } from '@phosphor-icons/react';
import PhosphorIcon from '../ui/PhosphorIcon';
import { api } from '../../utils/api';
import MessagePane from './MessagePane';
import ChatComposer from './ChatComposer';
import { navigateTo } from '../../utils/nav';
import { isAdmin, useServerConfig } from '../../utils/permissions';
import { uploadBlob } from '../../utils/uploadBlob';

const DrawingModal = React.lazy(() => import('./DrawingModal'));
const PollModal = React.lazy(() => import('./PollModal'));
const FeedbackModal = React.lazy(() => import('./FeedbackModal'));
const RightSidebarProfile = React.lazy(() => import('../ui/RightSidebarProfile'));
const SearchSidebar = React.lazy(() => import('./SearchSidebar'));
const BookmarkSidebar = React.lazy(() => import('./BookmarkSidebar'));
const PinSidebar = React.lazy(() => import('./PinSidebar'));
import { getBookmarks, saveBookmarks } from '../../utils/bookmarks';
import { UPLOAD_TOO_LARGE_MESSAGE } from '../../constants/limits';
import { globalMessageCache, globalHasMoreCache, globalLastReadCache, getSnapshot, hasCache, getMeta, setMeta, setChannel, mergeWindow, subscribe, updateChannel, trimChannel, replaceWindow, getWindowGen, sendMessage } from '../../utils/messageCache';
import usePresence from '../../hooks/usePresence';
import { t } from '../../i18n';

function ImageViewerModal({ src, onClose }) {
  const { mounted, state } = usePresence(!!src, 160);
  const [cachedSrc, setCachedSrc] = useState(src);
  if (src && src !== cachedSrc) setCachedSrc(src);

  if (!mounted || !cachedSrc) return null;
  const isClosing = state === 'exit';

  return createPortal(
    <div
      className={`fixed inset-0 bg-black/90 z-[2000] flex items-center justify-center p-4 transition-opacity ${
        isClosing ? 'opacity-0 duration-[160ms] ease-in' : 'opacity-100 duration-[240ms] ease-out'
      }`}
      onClick={onClose}
    >
      <img
        src={cachedSrc}
        className={`max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-transform ${
          isClosing ? 'scale-[0.96] duration-[160ms] ease-in' : 'scale-100 duration-[240ms] ease-out'
        }`}
        alt="Preview"
      />
    </div>,
    document.body
  );
}

const calculateProfilePopupPosition = (rect) => {
  if (!rect) return {};
  const popupWidth = 320;
  let left = rect.left;
  if (left + popupWidth > window.innerWidth) left = window.innerWidth - popupWidth - 16;
  if (left < 16) left = 16;
  
  const estimatedHeight = 400;
  if (rect.bottom + estimatedHeight > window.innerHeight && rect.top > estimatedHeight) {
    return { bottom: window.innerHeight - rect.top + 8, left };
  }
  return { top: rect.bottom + 8, left };
};

function ChatArea({ 
  channel, socket, currentUser, currentUserState, onlineAccountIds, allChannels
}) {
  useServerConfig(); // 管理者かどうかが届いたら再描画
  const [showDrawingModal, setShowDrawingModal] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const [closingPanel, setClosingPanel] = useState(null); // 'search' | 'bookmarks' | 'pins' | 'profile'
  
  // Desktop Notification State
  const [desktopNotifEnabled, setDesktopNotifEnabled] = useState(
    localStorage.getItem('hc_desktop_notifications') === 'true'
  );
  
  const toggleDesktopNotifications = () => {
    if (!desktopNotifEnabled) {
      if (Notification.permission === 'granted') {
        localStorage.setItem('hc_desktop_notifications', 'true');
        setDesktopNotifEnabled(true);
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            localStorage.setItem('hc_desktop_notifications', 'true');
            setDesktopNotifEnabled(true);
          }
        });
      } else {
        alert(t('notifications.blocked'));
      }
    } else {
      localStorage.setItem('hc_desktop_notifications', 'false');
      setDesktopNotifEnabled(false);
    }
  };

  const closePanel = (name, setter) => {
    setClosingPanel(name);
    setTimeout(() => {
      setter(false);
      setClosingPanel(prev => (prev === name ? null : prev));
    }, 100);
  };

  const handleOpenSidebar = (panel) => {
    setClosingPanel(null);
    setShowPins(panel === 'pins');
    setShowBookmarks(panel === 'bookmarks');
    setShowSearch(panel === 'search');
  };
  const channelRef = useRef(channel);
  channelRef.current = channel;
  const socketRef = useRef(socket);
  socketRef.current = socket;
  const currentUserStateRef = useRef(currentUserState);
  currentUserStateRef.current = currentUserState;

  const setMessages = useCallback((action) => {
    updateChannel(channelRef.current.id, prev => (typeof action === 'function' ? action(prev) : action));
  }, []);

  const subscribeActive = useCallback(fn => subscribe(channel.id, fn), [channel.id]);
  const hasNewer = useSyncExternalStore(subscribeActive, () => getMeta(channel.id).hasNewer);

  const MAX_KEEP = 5;
  const [recent, setRecent] = useState(() => [channel.id]);
  const evictedRef = useRef([]);
  if (recent[recent.length - 1] !== channel.id) {
    setRecent(prev => {
      const next = [...prev.filter(id => id !== channel.id), channel.id];
      if (next.length > MAX_KEEP) {
        const evicted = next.slice(0, next.length - MAX_KEEP);
        evictedRef.current.push(...evicted);
        return next.slice(-MAX_KEEP);
      }
      return next;
    });
  }
  useEffect(() => {
    if (evictedRef.current.length > 0) {
      evictedRef.current.forEach(id => trimChannel(id, 50));
      evictedRef.current = [];
    }
  }, [recent]);

  const activeScrollRef = useRef(null);
  const activeScrollToBottomRef = useRef(null);
  const handleScrollRef = useCallback((id, el) => {
    if (id === channelRef.current.id) activeScrollRef.current = el;
  }, []);
  const handleScrollToBottomRef = useCallback((id, fn) => {
    if (id === channelRef.current.id) activeScrollToBottomRef.current = fn;
  }, []);
  const handleAtBottomChange = useCallback((id, b) => {
    if (id === channelRef.current.id) setShowJumpToBottom(!b);
  }, []);
  const [typingUsers, setTypingUsers] = useState([]);
  const [membersVersion, setMembersVersion] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingStream, setRecordingStream] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  useEffect(() => {
    const set = (e) => { if (e.key === 'Shift') document.documentElement.toggleAttribute('data-shift', e.type === 'keydown'); };
    const clear = () => document.documentElement.removeAttribute('data-shift');
    window.addEventListener('keydown', set);
    window.addEventListener('keyup', set);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', set);
      window.removeEventListener('keyup', set);
      window.removeEventListener('blur', clear);
    };
  }, []);


  useEffect(() => {
    const handleClickOutside = (e) => {
      if (e.target.closest('.sidebar-toggle-btn') || e.target.closest('.sidebar-content')) return;
      if (showPins) closePanel('pins', setShowPins);
      if (showBookmarks) closePanel('bookmarks', setShowBookmarks);
      if (showSearch) closePanel('search', setShowSearch);
    };
    if (showPins || showBookmarks || showSearch) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPins, showBookmarks, showSearch]);
  const currentChannelIdRef = useRef(channel.id);
  
  useEffect(() => {
    currentChannelIdRef.current = channel.id;
  }, [channel.id]);

  useEffect(() => {
    if (!socket) return;
    
    // VCやカスタム等の非テキストチャンネルなら履歴取得をスキップする
    if (['voice', 'custom', 'rules'].includes(channel.type) || ['custom-soundboard', 'rules'].includes(channel.id)) {
      return;
    }

    let firstReply = true;
    const syncChannel = () => {
      const genAtRequest = getWindowGen(channel.id);
      const arr = getSnapshot(channel.id);
      // 差分同期の since はサーバーで確定したメッセージだけで計算する（仮メッセージは端末の時計なので混ぜない）
      const validMsgs = arr.filter(m => !m.error && !m.isUploading && !m.isSending && !m._local);
      const since = hasCache(channel.id) && validMsgs.length
        ? validMsgs.reduce((mx, m) => Math.max(mx, m.timestamp || 0, m.updatedAt || 0), 0)
        : undefined;
      socket.emit('open_channel', { channelId: channel.id, since }, (res) => {
        if (!res || res.channelId !== channel.id) return;
        // 返事を待つ間に検索などで別の区間へ飛んでいたら、最新分で上書きしない（既読だけ反映）
        if (getWindowGen(channel.id) !== genAtRequest) {
          if (firstReply) { firstReply = false; setMeta(channel.id, { lastReadAt: res.lastReadAt || 0 }); }
          return;
        }
        if (firstReply) {
          firstReply = false;
          if (res.full) {
            setMeta(channel.id, { lastReadAt: res.lastReadAt || 0, hasMore: res.hasMore });
          } else {
            setMeta(channel.id, { lastReadAt: res.lastReadAt || 0 });
          }
        } else if (res.full) {
          setMeta(channel.id, { hasMore: res.hasMore });
        }
        if (res.full) {
          setChannel(channel.id, mergeWindow(res.hasMore ? [] : getSnapshot(channel.id), res.messages));
        } else if (res.messages.length) {
          setChannel(channel.id, mergeWindow(getSnapshot(channel.id), res.messages));
        }
      });
    };

    syncChannel();
    setTypingUsers(p => (p.length ? [] : p));

    // Close floating sidebars when switching channels
    setShowSearch(false);
    setShowBookmarks(false);
    setShowPins(false);
    setProfilePopup(null);

    const handleUserTyping = ({ user, isTyping, channelId }) => {
      if (channelId !== channel.id) return;
      if (user === currentUser || user === currentUserState?.accountId) return;

      if (isTyping) {
        setTypingUsers(prev => prev.includes(user) ? prev : [...prev, user]);
        if (typingTimeouts.current[user]) {
          clearTimeout(typingTimeouts.current[user]);
        }
        typingTimeouts.current[user] = setTimeout(() => {
          setTypingUsers(prev => prev.filter(u => u !== user));
          delete typingTimeouts.current[user];
        }, 5000);
      } else {
        setTypingUsers(prev => prev.filter(u => u !== user));
        if (typingTimeouts.current[user]) {
          clearTimeout(typingTimeouts.current[user]);
          delete typingTimeouts.current[user];
        }
      }
    };

    const handleConnect = () => {
      syncChannel();
    };

    const handleMessageDeleted = ({ messageId }) => {
      // ブックマーク側の表示も「削除されました」にする（壊れた localStorage でも落ちない）
      try {
        const myId = currentUserStateRef.current?.accountId;
        const bookmarks = getBookmarks(myId);
        if (bookmarks.some(b => b.id === messageId)) {
          saveBookmarks(myId, bookmarks.map(b => (b.id === messageId ? { ...b, isDeleted: true, text: '', imageUrl: null, audioUrl: null } : b)));
        }
      } catch (e) {
        console.error('[Bookmarks] update on delete failed:', e);
      }
    };

    socket.on('connect',          handleConnect);
    socket.on('typing_status',    handleUserTyping);
    socket.on('message_deleted',  handleMessageDeleted);

    return () => {
      socket.off('connect',          handleConnect);
      socket.off('typing_status',    handleUserTyping);
      socket.off('message_deleted',  handleMessageDeleted);
    };

  }, [channel.id, channel.type, socket, currentUser, currentUserState?.accountId]);

  const [viewingImage, setViewingImage] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [profilePopup, setProfilePopup] = useState(null); // { user, position }
  const membersCache = useRef({});
  const typingTimeouts = useRef({});
  const [dmPartnerState, setDmPartnerState] = useState(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  const onlineSet = useMemo(() => new Set(onlineAccountIds || []), [onlineAccountIds]);

  const uniqueMembers = useMemo(() => {
    const list = Object.values(
      Object.values(membersCache.current).reduce((acc, m) => {
        acc[m.accountId] = m;
        return acc;
      }, {})
    );
    list.unshift({ accountId: 'everyone', displayName: 'everyone', avatarUrl: null, _isEveryone: true });
    return list;
  }, [membersVersion]);

  useEffect(() => {
    if (channel.type !== 'dm') { setDmPartnerState(null); return; }
    const ids = channel.id.split('__dm__');
    const partnerId = ids[0] === currentUserState?.accountId ? ids[1] : ids[0];
    const check = () => {
      const partner =
        window.__DM_PARTNERS__?.[channel.id] ||
        window.__ALL_MEMBERS__?.find(m => m.accountId === partnerId) ||
        membersCache.current[partnerId];
      if (partner) setDmPartnerState(partner);
      return !!partner;
    };
    check();
    window.addEventListener('dm_partners_updated', check);
    return () => window.removeEventListener('dm_partners_updated', check);
  }, [channel.id, channel.type, currentUserState?.accountId, membersVersion]);

  // メンバーキャッシュ（プロフィールポップアップ用）
  useEffect(() => {
    api.members().then(({ members }) => {
      members.forEach(m => {
        membersCache.current[m.accountId] = m;
        if (m.displayName) membersCache.current[m.displayName] = m;
        if (m.firstName) membersCache.current[m.firstName] = m;
      });
      setMembersVersion(v => v + 1);
      setMessages(prev => [...prev]); // キャッシュ更新後に再レンダリングしてアイコンを反映
    }).catch(() => {});
  }, [setMessages]);

  useEffect(() => {
    if (!socket) return;
    const onProfileUpdated = ({ accountId, profile }) => {
      // 過去の名前でキャッシュされているキーも含め、該当する accountId のキャッシュをすべて更新
      Object.keys(membersCache.current).forEach(key => {
        if (membersCache.current[key]?.accountId === accountId) {
          membersCache.current[key] = profile;
        }
      });
      // 新しい名前のキーでも確実にアクセスできるように追加
      membersCache.current[accountId] = profile;
      if (profile.displayName) membersCache.current[profile.displayName] = profile;
      if (profile.firstName) membersCache.current[profile.firstName] = profile;
      
      setMembersVersion(v => v + 1);
      // メッセージを再レンダリングするために状態を更新
      setMessages(prev => [...prev]);

      setDmPartnerState(prev => prev && prev.accountId === accountId ? { ...prev, ...profile } : prev);
      setProfilePopup(prev => prev && prev.user?.accountId === accountId ? { ...prev, user: { ...prev.user, ...profile } } : prev);
    };
    socket.on('profile_updated', onProfileUpdated);

    return () => socket.off('profile_updated', onProfileUpdated);
  }, [socket, setMessages]);

  const calculateProfilePopupPosition = (rect) => {
    if (!rect) return {};
    const popupWidth = 320;
    let left = rect.left;
    if (left + popupWidth > window.innerWidth) left = window.innerWidth - popupWidth - 16;
    if (left < 16) left = 16;
    
    const estimatedHeight = 400;
    if (rect.bottom + estimatedHeight > window.innerHeight && rect.top > estimatedHeight) {
      return { bottom: window.innerHeight - rect.top + 8, left };
    }
    return { top: rect.bottom + 8, left };
  };

  useEffect(() => {
    const handleOpenRightProfile = (e) => {
      setProfilePopup({ 
        user: e.detail.user, 
        position: calculateProfilePopupPosition(e.detail.rect) 
      });
    };

    const handleRequestMessageData = (e) => {
      const { messageId, callback } = e.detail;
      for (const channelMsgs of Object.values(globalMessageCache)) {
        const msg = channelMsgs.find(m => m.id === messageId);
        if (msg) {
          callback(msg);
          return;
        }
      }
    };

    window.addEventListener('open-right-profile', handleOpenRightProfile);
    window.addEventListener('request_message_data', handleRequestMessageData);
    return () => {
      window.removeEventListener('open-right-profile', handleOpenRightProfile);
      window.removeEventListener('request_message_data', handleRequestMessageData);
    };
  }, []);

  useEffect(() => {
    const handleFetchAndJump = (e) => {
      const fullMsgId = e.detail?.msgId;
      if (!fullMsgId) return;
      const parts = fullMsgId.split('_');
      const msgId = parts[0];
      const targetChannelId = parts.slice(1).join('_');

      if (targetChannelId && targetChannelId !== channel.id) {
        // Navigate to the target channel with the message ID in the hash
        const isDm = targetChannelId.includes('__dm__');
        navigateTo(`${isDm ? '/d/' : '/c/'}${targetChannelId}#${msgId}`);
        return;
      }

      // If already in snapshot, MessagePane will handle scroll & highlight directly
      if (getSnapshot(channel.id).some(m => m.id === msgId)) {
        return;
      }

      const requestChannelId = channel.id;
      socket.emit('get_message_context', { messageId: msgId, channelId: targetChannelId || channel.id }, (res) => {
        if (currentChannelIdRef.current !== requestChannelId) return;
        if (!res || !res.messages || res.messages.length === 0) {
          alert(t('chat.messageNotFound'));
          return;
        }
        
        const { messages: msgs, hasOlder, hasNewer: moreNewer, targetChannelId: resolvedChannelId } = res;

        // If the message actually belongs to a different channel, navigate to it!
        if (resolvedChannelId && resolvedChannelId !== channel.id) {
          const isDm = resolvedChannelId.includes('__dm__');
          navigateTo(`${isDm ? '/d/' : '/c/'}${resolvedChannelId}#${msgId}`);
          return;
        }

        // 区間ごと差し替え（差し替え前に出していた読み込みの返事は捨てる）
        replaceWindow(channel.id, msgs, { hasMore: hasOlder, hasNewer: moreNewer });
        window.dispatchEvent(new CustomEvent('jump_ready', { detail: { msgId } }));
      });
    };
    window.addEventListener('fetch_and_jump_message', handleFetchAndJump);
    return () => window.removeEventListener('fetch_and_jump_message', handleFetchAndJump);
  }, [socket, channel.id, setMessages]);

  useEffect(() => {
    // Check if there is a hash in the URL to jump to a message on initial load
    if (window.location.hash) {
      const msgId = window.location.hash.substring(1); // remove '#'
      if (msgId && /^\d{13}$/.test(msgId)) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('fetch_and_jump_message', { detail: { msgId } }));
          // Clean up the hash
          window.history.replaceState(null, '', window.location.pathname);
        }, 500); // Give it some time to load initial messages
      }
    }
  }, [channel.id]);

  const handleDelete = useCallback((messageId) => {
    socketRef.current?.emit('delete_message', { messageId, channelId: channelRef.current.id });
    setMessages(prev => prev.filter(m => m.id !== messageId));
  }, [setMessages]);

  const handleEdit = useCallback((messageId, newText) => {
    socketRef.current?.emit('edit_message', { messageId, text: newText, channelId: channelRef.current.id });
    setMessages(prev => prev.map(m => {
      if (m.id === messageId) {
        const history = m.editHistory ? [...m.editHistory] : [];
        history.push({ text: m.text, timestamp: Date.now() });
        return { ...m, text: newText, isEdited: true, editHistory: history };
      }
      return m;
    }));
  }, [setMessages]);

  const handleVote = useCallback((messageId, optionIndex) => {
    socketRef.current?.emit('vote_poll', { messageId, optionIndex });
  }, []);

  const handleAddOption = useCallback((messageId, optionText) => {
    socketRef.current?.emit('add_poll_option', { messageId, optionText });
  }, []);

  const handleSubmitFeedback = useCallback((messageId, text) => {
    socketRef.current?.emit('submit_feedback', { messageId, text });
  }, []);

  const handleFeedbackReact = useCallback((messageId, responseId, reactionType) => {
    socketRef.current?.emit('feedback_react', { messageId, responseId, reactionType });
  }, []);

  const scrollToMessage = useCallback((msgId, msgChannelId) => {
    if (msgChannelId && msgChannelId !== channelRef.current?.id) {
      const isDm = msgChannelId.includes('__dm__');
      navigateTo(`${isDm ? '/d/' : '/c/'}${msgChannelId}#${msgId}`);
      return;
    }
    window.dispatchEvent(new CustomEvent('fetch_and_jump_message', { detail: { msgId: msgChannelId ? `${msgId}_${msgChannelId}` : msgId } }));
  }, []);

  const handleTogglePin = useCallback((messageId, isPinned) => {
    const ch = channelRef.current.id;
    const msg = getSnapshot(ch).find(m => m.id === messageId);
    const myId = currentUserStateRef.current?.accountId;
    const isAuthor = msg && msg.user === myId;
    const isAdm = isAdmin(myId) || currentUserStateRef.current?.role === 'admin';
    if (!isAuthor && !isAdm) return;
    socketRef.current?.emit('toggle_pin', { messageId, channelId: ch, isPinned, user: myId });
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isPinned } : m));
  }, [setMessages]);

  const handleImageClick = useCallback((url) => {
    setViewingImage(url);
  }, []);

  const handleOpenProfile = useCallback((userName, e) => {
    const targetRect = e?.target?.getBoundingClientRect ? e.target.getBoundingClientRect() : null;
    setProfilePopup(prev => {
      if (prev?.user?.name === userName) return null;
      let member = membersCache.current[userName] || window.__ALL_MEMBERS__?.find(m => m.name === userName || m.accountId === userName);
      if (userName === 'hamachill') {
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
      const myState = currentUserStateRef.current;
      const profileData = member || ((myState?.name === userName || myState?.accountId === userName) ? myState : null);
      const isSelf = (profileData?.accountId === myState?.accountId) || userName === myState?.name || userName === myState?.accountId;

      return {
        position: calculateProfilePopupPosition(targetRect),
        user: profileData
          ? { ...profileData, isSelf, name: profileData.displayName || profileData.firstName || profileData.name || userName }
          : { name: userName, isSelf }
      };
    });
  }, []);

  const handleReaction = useCallback((messageId, emoji) => {
    const ch = channelRef.current.id;
    const msg = getSnapshot(ch).find(m => m.id === messageId);
    if (!msg) return;
    const myId = currentUserStateRef.current?.accountId;
    const op = (msg.reactions || []).some(r => r.emoji === emoji && r.users?.includes(myId)) ? 'remove' : 'add';
    if (op === 'add' && !(msg.reactions || []).some(r => r.emoji === emoji) && (msg.reactions || []).length >= 15) return;
    socketRef.current?.emit('add_reaction', { messageId, emoji, op });
    updateChannel(ch, prev => prev.map(m => {
      if (m.id !== messageId) return m;
      let reactions = [...(m.reactions || [])];
      const reactionIdx = reactions.findIndex(r => r.emoji === emoji);
      if (reactionIdx > -1) {
        const reaction = { ...reactions[reactionIdx] };
        const isMe = reaction.users.includes(myId);
        if (isMe) {
          reaction.users = reaction.users.filter(u => u !== myId);
          reaction.count--;
        } else {
          reaction.users = [...reaction.users, myId];
          reaction.count++;
        }
        reactions[reactionIdx] = reaction;
      } else {
        reactions.push({ emoji, count: 1, users: [myId] });
      }
      reactions = reactions.filter(r => r.count > 0);
      return { ...m, reactions };
    }));
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    if (force && getMeta(channelRef.current?.id).hasNewer) {
      updateChannel(channelRef.current?.id, () => []);
      setMeta(channelRef.current?.id, { hasNewer: false });
      socketRef.current?.emit('join_room', channelRef.current?.id);
      return;
    }
    if (activeScrollToBottomRef.current) {
      activeScrollToBottomRef.current(force);
    } else if (activeScrollRef.current) {
      activeScrollRef.current.scrollTop = activeScrollRef.current.scrollHeight;
    }
  }, []);

  const handleDrawingSend = useCallback((blob) => {
    setShowDrawingModal(false);
    const ch = channelRef.current?.id;
    if (!ch) return;
    const tempId = Date.now().toString();
    const objectUrl = URL.createObjectURL(blob);
    const img = new window.Image();
    img.onload = async () => {
      const w = img.width || 600;
      const h = img.height || 400;
      const optimisticMessage = {
        id: tempId,
        user: currentUserStateRef.current?.accountId,
        timestamp: Date.now(),
        text: '',
        channelId: ch,
        imageUrl: objectUrl,
        _objectUrl: objectUrl,
        imageWidths: [w],
        imageHeights: [h],
        replyTo: null,
        reactions: [],
        isUploading: true
      };
      updateChannel(ch, prev => [...prev, optimisticMessage]);
      scrollToBottom(true);

      try {
        const res = await uploadBlob(blob, `drawing_${Date.now()}.png`);
        const finalUrl = `${res.url}?w=${w}&h=${h}`;
        sendMessage(socketRef.current, {
          ...optimisticMessage,
          imageUrl: finalUrl,
          clientTempId: tempId,
        });
      } catch (err) {
        try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ }
        console.error('[Drawing] upload failed:', err);
        alert(err?.code === 'too_large' ? UPLOAD_TOO_LARGE_MESSAGE : t('chat.drawingSendFailed'));
        updateChannel(ch, prev => prev.filter(m => m.id !== tempId));
      }
    };
    img.src = objectUrl;
  }, [scrollToBottom]);

  const getTypingText = () => {
    if (typingUsers.length === 0) return null;
    if (typingUsers.length >= 4) return t('chat.severalTyping');
    
    const names = typingUsers.map(u => {
      let m = window.__ALL_MEMBERS__?.find(mem => mem.name === u || mem.accountId === u);
      return m?.displayName || m?.firstName || m?.name || u;
    });
    return t('chat.typing', { names: names.join(t('chat.typingAnd')) });
  };

  const activeSidebarUser = dmPartnerState || null;
  const isFixed = !!dmPartnerState;
  const canChat = channel.id !== 'announcements' || isAdmin(currentUserState.accountId);
  const displayChannelName = channel.type === 'dm'
    ? (dmPartnerState?.displayName || dmPartnerState?.firstName || channel.name)
    : channel.name;
  const composerChannel = useMemo(
    () => (displayChannelName === channel.name ? channel : { ...channel, name: displayChannelName }),
    [channel, displayChannelName]
  );

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-chat)] relative overflow-hidden">
      <PanelHeader 
        title={displayChannelName} 
        type={channel.id?.startsWith('thread_') ? 'thread' : channel.type} 
        borderVar="--border-chat"
        onBack={channel.id?.startsWith('thread_') ? () => navigateTo('/c/threads') : undefined}
      >
        <button 
          onClick={toggleDesktopNotifications} 
          className={`sidebar-toggle-btn w-8 h-8 rounded-md flex items-center justify-center transition-colors active:scale-95 ${desktopNotifEnabled ? 'text-[#f97316] bg-[#f97316]/10' : 'hover:bg-zinc-950/5 dark:hover:bg-white/5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`} 
          title={desktopNotifEnabled ? t('chat.mentionNotificationsOn') : t('chat.mentionNotificationsOff')}
        >
          <PhosphorIcon
            icon={desktopNotifEnabled ? Bell : BellSlash}
            size={18}
          />
        </button>
        <button 
          data-action="open-pins"
          onClick={() => showPins ? closePanel('pins', setShowPins) : handleOpenSidebar('pins')} 
          className={`sidebar-toggle-btn w-8 h-8 rounded-md flex items-center justify-center transition-colors active:scale-95 ${showPins ? 'bg-zinc-800 text-white dark:bg-zinc-700 dark:text-zinc-100' : 'hover:bg-zinc-950/5 dark:hover:bg-white/5 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`} 
          title={t('common.pin')}
        >
          <PhosphorIcon
            icon={PushPin}
            size={18}
          />
        </button>
        <button 
          onClick={() => showBookmarks ? closePanel('bookmarks', setShowBookmarks) : handleOpenSidebar('bookmarks')} 
          className={`sidebar-toggle-btn w-8 h-8 rounded-md flex items-center justify-center transition-colors active:scale-95 ${showBookmarks ? 'bg-zinc-800 text-white dark:bg-zinc-700 dark:text-zinc-100' : 'hover:bg-zinc-950/5 dark:hover:bg-white/5 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`} 
          title={t('bookmarks.title')}
        >
          <PhosphorIcon
            icon={BookmarkSimple}
            size={18}
          />
        </button>
        <button 
          onClick={() => showSearch ? closePanel('search', setShowSearch) : handleOpenSidebar('search')} 
          className={`sidebar-toggle-btn w-8 h-8 rounded-md flex items-center justify-center transition-colors active:scale-95 ${showSearch ? 'bg-zinc-800 text-white dark:bg-zinc-700 dark:text-zinc-100' : 'hover:bg-zinc-950/5 dark:hover:bg-white/5 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`} 
          title={t('common.search')}
        >
          <PhosphorIcon
            icon={MagnifyingGlass}
            size={18}
          />
        </button>
      </PanelHeader>

      <div className="flex-1 flex flex-row min-w-0 bg-transparent relative overflow-hidden">
        <main className="flex-1 flex flex-col min-w-0 bg-transparent relative overflow-hidden">
      <div className="flex-1 relative overflow-hidden">
        {recent.map(id => (
          <Activity key={id} mode={id === channel.id ? 'visible' : 'hidden'}>
            <MessagePane
              channelId={id}
              isActive={id === channel.id}
              onAtBottomChange={handleAtBottomChange}
              onScrollRef={handleScrollRef}
              onScrollToBottomRef={handleScrollToBottomRef}
              socket={socket}
              currentUser={currentUser}
              currentUserState={currentUserState}
              onlineSet={onlineSet}
              membersCache={membersCache}
              membersVersion={membersVersion}
              onReact={handleReaction}
              onReply={setReplyingTo}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onVote={handleVote}
              onAddOption={handleAddOption}
              onSubmitFeedback={handleSubmitFeedback}
              onFeedbackReact={handleFeedbackReact}
              onTogglePin={handleTogglePin}
              onImageClick={handleImageClick}
              onOpenProfile={handleOpenProfile}
            />
          </Activity>
        ))}
      </div>
      <div className="px-2 pb-2 pt-0 bg-transparent relative shrink-0">
        {typingUsers.length > 0 && (
          <div className="absolute -top-6 left-6 flex items-center gap-2 text-[12px] text-zinc-500 font-semibold select-none animate-in fade-in slide-in-from-bottom-1 duration-200">
            <div className="flex items-center gap-1 bg-zinc-950/5 dark:bg-white/10 px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 typing-dot" />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 typing-dot" />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 typing-dot" />
            </div>
            <span className="italic">{getTypingText()}</span>
          </div>
        )}
        {(showJumpToBottom || hasNewer) && (
          <button
            onClick={() => scrollToBottom(true)}
            className="absolute -top-12 right-6 z-40 bg-white/95 dark:bg-zinc-800/95 backdrop-blur-md text-zinc-900/50 dark:text-zinc-100/50 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-full p-2 shadow-[0_2px_10px_rgba(0,0,0,0.1)] border border-black/5 dark:border-white/10 hover:bg-white dark:hover:bg-zinc-800 hc-press transition-colors animate-in fade-in slide-in-from-bottom-2 duration-180"
            title={t('chat.jumpToLatest')}
          >
            <PhosphorIcon icon={ArrowDown} size={20} weight="bold" />
          </button>
        )}
        <ChatComposer
          channel={composerChannel}
          socket={socket}
          currentUser={currentUser}
          currentUserState={currentUserState}
          allChannels={allChannels}
          uniqueMembers={uniqueMembers}
          replyingTo={replyingTo}
          setReplyingTo={setReplyingTo}
          scrollToBottom={scrollToBottom}
          setShowDrawingModal={setShowDrawingModal}
          setShowPollModal={setShowPollModal}
          setShowFeedbackModal={setShowFeedbackModal}
          canChat={canChat}
        />
      </div>
      <ImageViewerModal src={viewingImage} onClose={() => setViewingImage(null)} />
      <Suspense fallback={null}>
        {showDrawingModal && (
          <DrawingModal 
            isOpen={showDrawingModal}
            onClose={() => setShowDrawingModal(false)} 
            onSend={handleDrawingSend}
          />
        )}
        {showPollModal && (
          <PollModal
            isOpen={showPollModal}
            onClose={() => setShowPollModal(false)}
            onSend={(pollData) => {
              const pollText = `__POLL__${JSON.stringify(pollData)}`;
              const tempId = Date.now().toString();
              sendMessage(socket, {
                id: tempId,
                clientTempId: tempId,
                user: currentUserState.accountId,
                text: pollText,
                channelId: channel.id,
                replyTo: replyingTo ? { id: replyingTo.id, user: replyingTo.user, text: replyingTo.text } : null
              });
              scrollToBottom();
            }}
          />
        )}
        {showFeedbackModal && (
          <FeedbackModal
            isOpen={showFeedbackModal}
            onClose={() => setShowFeedbackModal(false)}
            onSend={(feedbackData) => {
              const feedbackText = `__FEEDBACK__${JSON.stringify(feedbackData)}`;
              const tempId = Date.now().toString();
              sendMessage(socket, {
                id: tempId,
                clientTempId: tempId,
                user: currentUserState.accountId,
                text: feedbackText,
                channelId: channel.id,
                replyTo: replyingTo ? { id: replyingTo.id, user: replyingTo.user, text: replyingTo.text } : null
              });
              scrollToBottom();
            }}
          />
        )}
      </Suspense>
      </main>

      {profilePopup && (
        <UserProfileCard
          user={{...profilePopup.user, isOnline: onlineSet.has(profilePopup.user.accountId)}}
          position={profilePopup.position}
          onClose={() => setProfilePopup(null)}
          onMessage={(u) => navigateTo(`/d/${[currentUserState.accountId, u.accountId].sort().join('__dm__')}`)}
        />
      )}
      <Suspense fallback={null}>
        {activeSidebarUser && (
          <RightSidebarProfile
            user={activeSidebarUser}
            isOnline={onlineSet.has(activeSidebarUser.accountId)}
            isFixed={isFixed}
          />
        )}
        {showSearch && (
          <SearchSidebar
            channelId={channel.id}
            socket={socket}
            isClosing={closingPanel === 'search'}
            onClose={() => closePanel('search', setShowSearch)}
            onJumpToMessage={(msgId, msgChannelId) => {
              scrollToMessage(msgId, msgChannelId);
            }}
            membersCache={membersCache}
          />
        )}
        {showBookmarks && (
          <BookmarkSidebar
            accountId={currentUserState?.accountId}
            isClosing={closingPanel === 'bookmarks'}
            onClose={() => closePanel('bookmarks', setShowBookmarks)}
            onJumpToMessage={(msgId, msgChannelId) => {
              scrollToMessage(msgId, msgChannelId);
            }}
          />
        )}
        {showPins && (
          <PinSidebar
            channel={channel}
            currentAccountId={currentUserState?.accountId}
            socket={socket}
            isClosing={closingPanel === 'pins'}
            onClose={() => closePanel('pins', setShowPins)}
            onJumpToMessage={(msgId, msgChannelId) => {
              scrollToMessage(msgId, msgChannelId);
            }}
          />
        )}
      </Suspense>
      </div>
    </div>
  );
}

export default React.memo(ChatArea);