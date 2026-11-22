import React, { Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, Navigate } from 'react-router-dom';
import { setNavigator, navigateTo } from './utils/nav';
import { X } from '@phosphor-icons/react';
import PhosphorIcon from './components/ui/PhosphorIcon';
import DMList from './components/dm/DMList';
import ChannelList from './components/channel/ChannelList';
import ChatArea from './components/chat/ChatArea';
import MemberList from './components/members/MemberList';
import { profileToUserState } from './utils/api';
import UserControlBar from './components/ui/UserControlBar';
import VoiceControl from './components/vc/VoiceControl';
import FloatingControlPanel from './components/ui/FloatingControlPanel';
import RulesPage from './components/channel/RulesPage';
import { setCookie, getCookie } from './utils/storage';
import { api, saveToken, clearToken } from './utils/api';
import { initMessageCache, resetMessageCache, preloadRoomsOnce, joinRoomOnce } from './utils/messageCache';

const SettingsScreen = React.lazy(() => import('./components/ui/SettingsScreen'));
const VoiceArea = React.lazy(() => import('./components/vc/VoiceArea'));
const ForumArea = React.lazy(() => import('./components/chat/ForumArea'));
const CustomSoundboard = React.lazy(() => import('./components/activity/CustomSoundboard'));
const LoginPage = React.lazy(() => import('./components/auth/LoginPage'));

import { io } from 'socket.io-client';
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import { playJoinSound, playLeaveSound, playMuteSound, playUnmuteSound, playDeafenSound, playUndeafenSound, playScreenShareSound } from './utils/sounds';
import { soundboardManager } from './utils/soundboardManager';
import { canSeeChannel, getServerConfig, loadServerConfig, useServerConfig } from './utils/permissions';
import { t } from './i18n';
import { localizeSystemText } from './utils/systemMessages';

// ---- 通知音（Web Audio API）----
let sharedAudioCtx = null;

const initAudio = () => {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => { });
  }
};

// ユーザーアクションで AudioContext を初期化/再開する（ブラウザの自動再生ブロック対策）
document.addEventListener('click', initAudio, { once: true });
document.addEventListener('keydown', initAudio, { once: true });

function playNotificationSound() {
  try {
    if (!sharedAudioCtx) initAudio();
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => { });
    }
    const ctx = sharedAudioCtx;
    const t = ctx.currentTime;

    const playNote = (freq, startTime, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.05, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    // "ﾃﾚﾃﾚﾝ" (Te-Re-Ren) sound
    playNote(659.25, t, 0.15);       // E5
    playNote(830.61, t + 0.1, 0.15); // G#5
    playNote(987.77, t + 0.2, 0.3);  // B5
  } catch (e) { }
}

// 現在のオリジンをそのまま使うことで、環境依存（Hairpin NAT等）を回避
const socketUrl = undefined; // デフォルトで window.location を使用

const socket = io(socketUrl, {
  transports: ['websocket'],
  auth: (cb) => cb({ token: localStorage.getItem('hc_token') || '' }),
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
  timeout: 20000,
  autoConnect: false, // ログイン後に手動接続
});

let myPeerRef = { current: null };

// ---- MainLayout ----
const MainLayout = React.memo(({
  allChannels, connectedVoiceChannel, voiceParticipants,
  handleJoinVoice, handleLeaveVoice, currentUserState, setCurrentUserState,
  setShowSettings, showSettings, currentSocketId,
  onlineAccountIds, unreadCounts, mentionCounts, clearUnread, activeChannelRef, handleOpenDm,
  connectingVoiceChannel, voiceConnectionState, setConnectingVoiceChannel, setVoiceConnectionState,
  vcNames, onRenameVc,
  screenStreams, localScreenStream, onStartScreenShare, onStopScreenShare
}) => {
  const { channelId, userId } = useParams();

  const activeChannel = useMemo(() => {
    if (channelId) {
      const channel = allChannels.find(c => c.id === channelId);
      if (channel) {
        if (!canSeeChannel(currentUserState?.accountId, channel.id)) {
          return allChannels[1];
        }
        return channel;
      }
      if (channelId.startsWith('thread_')) {
        const threadId = channelId.replace('thread_', '');
        const msgs = window.__GLOBAL_MESSAGE_CACHE__?.['forum_metadata'] || [];
        let title = t('channels.threads');
        for (const m of msgs) {
          try {
            const t = JSON.parse(m.text);
            if (t.id === threadId) { title = t.title; break; }
          } catch(e) {}
        }
        return { id: channelId, name: title, type: 'forum' };
      }
      return allChannels[1];
    }
    if (userId) {
      const ids = userId.split('__dm__');
      const partnerId = ids[0] === currentUserState?.accountId ? ids[1] : ids[0];
      const partner = window.__DM_PARTNERS__?.[userId] || window.__ALL_MEMBERS__?.find(m => m.accountId === partnerId);
      return { id: userId, name: partner?.displayName || partner?.firstName || 'DM', type: 'dm' };
    }
    return allChannels[1];
  }, [channelId, userId, allChannels, currentUserState?.accountId]);

  // チャンネルが変わったら未読クリア & ref 更新
  useEffect(() => {
    activeChannelRef.current = activeChannel.id;
    clearUnread(activeChannel.id);
  }, [activeChannel.id, clearUnread]);

  // document.title を更新
  useEffect(() => {
    if (!activeChannel) {
      document.title = 'hamachill';
      return;
    }

    if (activeChannel.type === 'dm') {
      // activeChannel.id は 'user_A__dm__user_B' のような文字列
      const ids = activeChannel.id.split('__dm__');
      const partnerId = ids[0] === currentUserState?.accountId ? ids[1] : ids[0];

      // すでにグローバルにキャッシュがあれば即座に反映
      const cached = window.__ALL_MEMBERS__?.find(m => m.accountId === partnerId);
      if (cached) {
        document.title = `hamachill | @${cached.displayName || cached.firstName || partnerId}`;
      } else {
        // キャッシュがない場合はAPIから取得（初動対策）
        document.title = `hamachill | @${partnerId}`;
        api.members().then(({ members }) => {
          const partner = members.find(m => m.accountId === partnerId);
          if (partner) {
            document.title = `hamachill | @${partner.displayName || partner.firstName || partnerId}`;
          }
        }).catch(() => { });
      }
    } else if (activeChannel.type === 'text') {
      document.title = `hamachill | #${activeChannel.name}`;
    } else {
      document.title = `hamachill | ${activeChannel.name}`;
    }
  }, [activeChannel, currentUserState?.accountId]);

  // Track mute/deafen for sounds
  const prevUserState = useRef(null);
  useEffect(() => {
    if (!currentUserState) return;
    if (!prevUserState.current) {
      prevUserState.current = currentUserState;
      return;
    }
    const prev = prevUserState.current;
    const curr = currentUserState;

    if (curr.isMuted !== prev.isMuted) {
      if (curr.isMuted) playMuteSound();
      else playUnmuteSound();
    }
    if (curr.isDeafened !== prev.isDeafened) {
      if (curr.isDeafened) playDeafenSound();
      else playUndeafenSound();
    }
    prevUserState.current = curr;
  }, [currentUserState]);

  // Track others' mute/deafen for sounds (only when in the same voice channel)
  const prevVoiceParticipantsRef = useRef({});
  useEffect(() => {
    const prev = prevVoiceParticipantsRef.current;
    const curr = voiceParticipants;
    const myRoom = connectedVoiceChannel?.id;

    if (myRoom && !currentUserState?.isDeafened) {
      for (const [id, user] of Object.entries(curr)) {
        if (prev[id] && user.userState?.connectedRoom === myRoom && prev[id].userState?.connectedRoom === myRoom) {
          if (user.userState?.isMuted !== prev[id].userState?.isMuted) {
            if (user.userState?.isMuted) playMuteSound();
            else playUnmuteSound();
          }
          if (user.userState?.isDeafened !== prev[id].userState?.isDeafened) {
            if (user.userState?.isDeafened) playDeafenSound();
            else playUndeafenSound();
          }
        }
      }
    }
    prevVoiceParticipantsRef.current = curr;
  }, [voiceParticipants, connectedVoiceChannel?.id, currentUserState?.isDeafened]);

  const participants = useMemo(() => {
    const others = Object.values(voiceParticipants).filter(p =>
      p.userState?.connectedRoom === activeChannel.id && p.socketId !== currentSocketId
    );
    const list = [...others];
    if (connectedVoiceChannel?.id === activeChannel.id) {
      list.unshift({
        socketId: currentSocketId || socket.id || 'me',
        peerId: myPeerRef.current?.id || 'pending',
        userState: { ...currentUserState, connectedRoom: activeChannel.id },
        isMe: true,
      });
    }
    return list;
  }, [activeChannel.id, connectedVoiceChannel, voiceParticipants, currentUserState, currentSocketId]);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileScrollRef = useRef(null);

  useEffect(() => {
    const handleToggle = () => setMobileMenuOpen(prev => !prev);
    window.addEventListener('toggle-mobile-menu', handleToggle);
    return () => window.removeEventListener('toggle-mobile-menu', handleToggle);
  }, []);

  useEffect(() => {
    // Close mobile menu on navigation
    setMobileMenuOpen(false);
  }, [activeChannel.id]);

  useEffect(() => {
    // When mobile menu opens, scroll to ChannelList by default if we are on mobile
    if (mobileMenuOpen && mobileScrollRef.current) {
      // scroll to right by window innerWidth
      setTimeout(() => {
        if (mobileScrollRef.current) {
          mobileScrollRef.current.scrollTo({ left: window.innerWidth, behavior: 'instant' });
        }
      }, 10);
    }
  }, [mobileMenuOpen]);

  const handleToggleSettings = useCallback(() => setShowSettings(prev => !prev), [setShowSettings]);
  const handleLeaveVoiceAction = useCallback(() => {
    handleLeaveVoice();
    setConnectingVoiceChannel(null);
    setVoiceConnectionState(null);
  }, [handleLeaveVoice, setConnectingVoiceChannel, setVoiceConnectionState]);
  const handleChannelSelect = useCallback((c) => navigateTo(c.type === 'dm' ? `/d/${c.id}` : `/c/${c.id}`), []);

  return (
    <div className="flex h-[100dvh] w-full font-sans overflow-hidden bg-zinc-50 text-zinc-950 relative">


      {/* Sidebar Container */}
      <div className={`
        fixed md:relative z-[1010] h-[100dvh] flex flex-col transition-transform duration-300 ease-out
        w-full md:w-[512px] overflow-hidden
        ${mobileMenuOpen ? 'translate-x-0 bg-zinc-50' : '-translate-x-full md:translate-x-0 md:bg-transparent'}
      `}>
        {/* Unified Top Header Bar */}
        <div
          className="h-12 shrink-0 bg-[var(--bg-chat)] border-b border-black/[0.14] dark:border-white/[0.14] flex items-center justify-between px-4 select-none z-10 w-full"
        >
          <div className="flex items-center gap-3 min-w-0">
            <img src="/favicon.png" alt="hamachill" className="w-5 h-5 rounded-md object-contain shrink-0" />
            <span className="font-extrabold text-[16px] tracking-tight text-zinc-900 dark:text-zinc-100">
              hamachill
            </span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden p-1 text-zinc-500 hover:text-zinc-900 active:scale-95 transition-all rounded-md"
            title={t('common.close')}
          >
            <PhosphorIcon icon={X} size={18} weight="bold" />
          </button>
        </div>

        <div ref={mobileScrollRef} className="flex-1 min-h-0 flex flex-row overflow-x-auto md:overflow-hidden no-scrollbar snap-x snap-mandatory hide-scrollbar">
          <div className="shrink-0 snap-start h-full min-h-0 w-[100vw] md:w-64 flex flex-col">
            <DMList
              socket={socket}
              currentUserState={currentUserState}
              setUserState={setCurrentUserState}
              onSettingsClick={handleToggleSettings}
              unreadCounts={unreadCounts}
              onlineAccountIds={onlineAccountIds}
              connectedVoiceChannel={connectedVoiceChannel}
              connectingVoiceChannel={connectingVoiceChannel}
              voiceConnectionState={voiceConnectionState}
              onLeaveVoice={handleLeaveVoiceAction}
            />
          </div>
          <div className="shrink-0 snap-start h-full min-h-0 w-[100vw] md:w-64 flex flex-col">
            <ChannelList
              activeChannel={activeChannel}
              onChannelSelect={handleChannelSelect}
              connectedVoiceChannel={connectedVoiceChannel}
              connectingVoiceChannel={connectingVoiceChannel}
              participantsData={voiceParticipants}
              socketId={currentSocketId || socket.id}
              currentUserState={currentUserState}
              unreadCounts={unreadCounts}
              mentionCounts={mentionCounts}
              vcNames={vcNames}
              onRenameVc={onRenameVc}
            />
          </div>
        </div>

        {/* Desktop Floating User & Voice Control Card spanning DM + half of Channel column */}
        <div className="hidden md:block absolute bottom-2 left-2 w-[376px] z-30 pointer-events-none">
          <div className="pointer-events-auto rounded-[10px] bg-white dark:bg-[#1e1f20] border border-black/[0.14] dark:border-white/[0.14]">
            {(connectedVoiceChannel || connectingVoiceChannel) && (
              <div className="overflow-hidden rounded-t-[9px] border-b border-black/[0.06] dark:border-white/[0.08]">
                <VoiceControl
                  channelName={connectedVoiceChannel?.name || connectingVoiceChannel?.name}
                  onLeave={handleLeaveVoiceAction}
                  connectionState={voiceConnectionState}
                  embedded
                />
              </div>
            )}
            <UserControlBar
              socket={socket}
              onlineAccountIds={onlineAccountIds}
              userState={currentUserState}
              setUserState={setCurrentUserState}
              onSettingsClick={handleToggleSettings}
              className="w-full"
            />
          </div>
        </div>

        {/* Mobile User Control Bar: shown only when sidebar is open */}
        <div className="md:hidden border-t border-zinc-200 bg-white shrink-0 w-full mt-auto">
          <UserControlBar
            socket={socket}
            onlineAccountIds={onlineAccountIds}
            userState={currentUserState}
            setUserState={setCurrentUserState}
            onSettingsClick={handleToggleSettings}
            className="flex items-center justify-between p-2 px-4"
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-transparent overflow-hidden relative">
        <div className="flex-1 flex flex-row overflow-hidden relative">
          <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" /></div>}>
            {activeChannel.id === 'rules' && (
              <RulesPage />
            )}
            {activeChannel.id === 'custom-soundboard' && (
              <CustomSoundboard socket={socket} currentUserState={currentUserState} onOpenMenu={() => setMobileMenuOpen(true)} />
            )}
            {activeChannel.type === 'voice' && (
              <VoiceArea
                channel={activeChannel}
                isConnected={connectedVoiceChannel?.id === activeChannel.id}
                onJoin={() => handleJoinVoice(activeChannel)}
                onLeave={handleLeaveVoice}
                participants={participants}
                currentUserState={currentUserState}
                setCurrentUserState={setCurrentUserState}
                currentSocketId={currentSocketId}
                socket={socket}
                roomId={activeChannel.id}
                screenStreams={screenStreams}
                localScreenStream={localScreenStream}
                onStartScreenShare={onStartScreenShare}
                onStopScreenShare={onStopScreenShare}
              />
            )}
            {activeChannel.type === 'forum' && (
              <ForumArea
                channel={activeChannel}
                socket={socket}
                currentUserState={currentUserState}
                onlineAccountIds={onlineAccountIds}
                unreadCounts={unreadCounts}
                onOpenMenu={() => setMobileMenuOpen(true)}
              />
            )}
            {!(activeChannel.id === 'rules' || activeChannel.id === 'custom-soundboard' || activeChannel.type === 'voice' || activeChannel.type === 'custom' || activeChannel.type === 'forum') && (
              <div className="flex flex-1 overflow-hidden">
                <ChatArea 
                  channel={activeChannel} 
                  socket={socket} 
                  currentUser={currentUserState.name} 
                  currentUserState={currentUserState} 
                  onlineAccountIds={onlineAccountIds} 
                  allChannels={allChannels} 
                />
              </div>
            )}
          </Suspense>
        </div>
      </div>
    </div>
  );
});

MainLayout.displayName = 'MainLayout';

// ---- AppContent ----
function AppContent() {
  const [authed, setAuthed] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const navigate = useNavigate();
  useEffect(() => { setNavigator(navigate); }, [navigate]);
  const onRenameVc = useCallback((id, name) => socket.emit('rename_vc', { id, name }), []);

  const [showSettings, setShowSettings] = useState(false);
  const [connectedVoiceChannel, setConnectedVoiceChannel] = useState(null);
  const connectedVoiceChannelRef = useRef(null);
  useEffect(() => {
    connectedVoiceChannelRef.current = connectedVoiceChannel;
  }, [connectedVoiceChannel]);
  const [connectingVoiceChannel, setConnectingVoiceChannel] = useState(null);
  const [voiceConnectionState, setVoiceConnectionState] = useState(null);
  const [voiceParticipants, setVoiceParticipants] = useState({});
  const voiceParticipantsRef = useRef({});
  useEffect(() => { voiceParticipantsRef.current = voiceParticipants; }, [voiceParticipants]);

  // 着信元が「今いる部屋」の参加者か確認する。一覧が届くのを最大 2 秒待つ
  const isCallerInMyRoom = useCallback((peerId) => new Promise((resolve) => {
    let tries = 0;
    const check = () => {
      const room = currentRoomId.current;
      const p = Object.values(voiceParticipantsRef.current).find(u => u.peerId === peerId);
      if (room && p && p.userState?.connectedRoom === room) return resolve(true);
      if (!room || ++tries >= 20) return resolve(false);
      setTimeout(check, 100);
    };
    check();
  }), []);
  const [currentSocketId, setCurrentSocketId] = useState(null);
  const [onlineAccountIds, setOnlineAccountIds] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [mentionCounts, setMentionCounts] = useState({});
  const [vcNames, setVcNames] = useState({ vc1: t('channels.vc', { n: 1 }), vc2: t('channels.vc', { n: 2 }), vc3: t('channels.vc', { n: 3 }) });
  const activeChannelRef = useRef(null);

  const [screenStreams, setScreenStreams] = useState({}); // { [peerId]: MediaStream }
  const [localScreenStream, setLocalScreenStream] = useState(null);
  const outgoingScreenPeers = useRef({}); // { [peerId]: call }
  const incomingScreenPeers = useRef({}); // { [peerId]: call }
  const callRetryTimestamps = useRef({}); // { [peerId]: number }
  const peerCreatePromise = useRef(null);
  const localScreenStreamRef = useRef(null);

  const clearUnread = useCallback((channelId) => {
    setUnreadCounts(prev => {
      if (!prev[channelId]) return prev;
      const n = { ...prev };
      delete n[channelId];
      return n;
    });
    setMentionCounts(prev => {
      if (!prev[channelId]) return prev;
      const n = { ...prev };
      delete n[channelId];
      return n;
    });
  }, []);

  // サーバーの未読数・メンション数で上書き（ログイン時・再接続時）
  const refreshUnread = useCallback(() => {
    api.getUnread().then((res) => {
      if (!res) return;
      const active = activeChannelRef.current;
      const strip = (obj) => {
        const n = { ...(obj || {}) };
        if (active) delete n[active];
        return n;
      };
      if (res.counts) setUnreadCounts(strip(res.counts));
      if (res.mentions) setMentionCounts(strip(res.mentions));
    }).catch(() => { });
  }, []);

  const markReadTimers = useRef({});
  const preloadedOnce = useRef(false);
  const scheduleMarkRead = useCallback((channelId) => {
    clearTimeout(markReadTimers.current[channelId]);
    markReadTimers.current[channelId] = setTimeout(() => socket.emit('mark_read_req', { channelId }), 2000);
  }, []);
  const [currentUserState, setCurrentUserState] = useState({
    name: '', isMuted: false, isDeafened: false, id: '', accountId: '',
    profileColor1: '#4f46e5', profileColor2: '#9333ea',
  });

  const myPeer = useRef(null);
  const myStream = useRef(null);
  // ノイズ抑制ON時の元マイクストリームと音声ノード、マイク無し時のダミーctx（退出時に必ず片付ける）
  const voiceAudioRes = useRef({ rawStream: null, nodes: [], dummyCtx: null });
  const peers = useRef({});
  const currentRoomId = useRef(null);
  const currentUserStateRef = useRef(currentUserState);
  useEffect(() => { currentUserStateRef.current = currentUserState; }, [currentUserState]);

  // ---- audio helpers (currentUserStateにアクセスできるようにコンポーネント内に移動) ----
  const attachAudio = useCallback((peerId, stream) => {
    let audio = document.getElementById(`audio-${peerId}`);
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = `audio-${peerId}`;
      audio.autoplay = true;
      audio.muted = currentUserStateRef.current?.isDeafened || false; // スピーカーミュート状態を適用
      document.body.appendChild(audio);
      // 保存済みの出力デバイスを適用
      const outputDeviceId = localStorage.getItem('hc_audio_output');
      if (outputDeviceId && outputDeviceId !== 'default' && audio.setSinkId) {
        audio.setSinkId(outputDeviceId).catch(() => { });
      }
    }
    if (audio.srcObject !== stream) {
      audio.srcObject = stream;
    }
    if (audio.paused) {
      audio.play().catch(() => {
        const resume = () => { audio.play().catch(() => { }); document.removeEventListener('click', resume); };
        document.addEventListener('click', resume);
      });
    }
  }, []);

  const removeAudio = useCallback((peerId) => {
    const a = document.getElementById(`audio-${peerId}`);
    if (a) { a.pause(); a.srcObject = null; a.remove(); }
  }, []);

  const removeAllAudio = useCallback(() => {
    document.querySelectorAll('audio[id^="audio-"]').forEach(a => { a.pause(); a.srcObject = null; a.remove(); });
  }, []);

  // ミュート状態が変更されたら音声トラックを制御
  useEffect(() => {
    if (myStream.current) {
      const audioTrack = myStream.current.getAudioTracks()[0];
      if (audioTrack) {
        const shouldBeMuted = currentUserState.isMuted || currentUserState.isDeafened;
        audioTrack.enabled = !shouldBeMuted;
        console.log('[Audio] Microphone:', shouldBeMuted ? 'Muted' : 'Unmuted');
      }
    }
  }, [currentUserState.isMuted, currentUserState.isDeafened]);

  // スピーカーミュート状態が変更されたら全てのオーディオ要素を制御
  useEffect(() => {
    const audioElements = document.querySelectorAll('audio[id^="audio-"]');
    audioElements.forEach(audio => {
      audio.muted = currentUserState.isDeafened;
    });
    console.log('[Audio] Speakers:', currentUserState.isDeafened ? 'Muted' : 'Unmuted');
  }, [currentUserState.isDeafened]);

  // VC 状態の送信を 1 つの effect にまとめる
  useEffect(() => {
    if (connectedVoiceChannel && socket) {
      socket.emit('update_voice_state', {
        roomId: connectedVoiceChannel.id,
        userState: { ...currentUserState, connectedRoom: connectedVoiceChannel.id },
      });
    }
  }, [
    connectedVoiceChannel?.id,
    currentUserState.isMuted,
    currentUserState.isDeafened,
    currentUserState.name,
    currentUserState.avatarUrl
  ]);

  // 自分のマイク音声を解析して発言中 (isSpeaking) を検知・配信
  useEffect(() => {
    const active = Boolean(connectedVoiceChannel && myStream.current && !currentUserState.isMuted && !currentUserState.isDeafened);
    const updateSpeaking = (speaking) => {
      setCurrentUserState(prev => (prev.isSpeaking === speaking ? prev : { ...prev, isSpeaking: speaking }));
      if (connectedVoiceChannel && socket?.connected) {
        socket.emit('speaking_state', { isSpeaking: speaking });
      }
    };

    if (!active) {
      updateSpeaking(false);
      return;
    }

    const stream = myStream.current;
    if (!stream.getAudioTracks().length) return;

    if (!sharedAudioCtx) initAudio();
    const ctx = sharedAudioCtx;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    let source;
    let analyser;
    try {
      source = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
    } catch {
      return;
    }

    const buf = new Uint8Array(analyser.fftSize);
    let lastSpeaking = false;
    let silenceTimer = null;

    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i] - 128);
        if (v > peak) peak = v;
      }
      const detected = peak >= 5;
      if (detected) {
        if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
        if (!lastSpeaking) {
          lastSpeaking = true;
          updateSpeaking(true);
        }
      } else if (lastSpeaking && !silenceTimer) {
        silenceTimer = setTimeout(() => {
          silenceTimer = null;
          lastSpeaking = false;
          updateSpeaking(false);
        }, 240);
      }
    }, 80);

    return () => {
      clearInterval(timer);
      if (silenceTimer) clearTimeout(silenceTimer);
      try { source.disconnect(); } catch {}
      updateSpeaking(false);
    };
  }, [connectedVoiceChannel?.id, currentUserState.isMuted, currentUserState.isDeafened]);

  const allChannels = useMemo(() => [
    { id: 'rules', name: t('channels.rules'), type: 'rules' },
    { id: 'announcements', name: t('channels.announcements'), type: 'announcements' },
    { id: 'general', name: t('channels.general'), type: 'text' },
    { id: 'threads', name: t('channels.threads'), type: 'forum' },
    { id: 'vc1', name: t('channels.vc', { n: 1 }), type: 'voice' },
    { id: 'vc2', name: t('channels.vc', { n: 2 }), type: 'voice' },
    { id: 'vc3', name: t('channels.vc', { n: 3 }), type: 'voice' },
    { id: 'kikisen', name: t('channels.kikisen'), type: 'text' },
    { id: 'custom-soundboard', name: t('channels.customSoundboard'), type: 'custom' },
    { id: 'logs', name: t('channels.logs'), type: 'text' }
  ], []);

  // ---- サーバー設定（ICE サーバー・GIF・自分の権限）。ログイン状態が変わるたびに取り直す ----
  useServerConfig(); // 設定が届いたら再描画（権限で見えるチャンネルが変わる）
  useEffect(() => {
    loadServerConfig();
  }, [authed, currentUserState?.accountId]);

  // ---- 起動時トークン検証 ----
  useEffect(() => {
    const token = localStorage.getItem('hc_token');
    if (!token) { setAuthChecking(false); return; }
    api.me().then(({ profile, token: newToken }) => {
      if (newToken) saveToken(newToken);
      setCurrentUserState(profileToUserState(profile));
      setAuthed(true);
      connectSocket(newToken || token);
      // サーバーから正確な未読数とメンバー一覧を取得
      refreshUnread();
      api.members().then(({ members }) => { window.__ALL_MEMBERS__ = members; }).catch(() => { });
    }).catch(() => {
      clearToken();
    }).finally(() => setAuthChecking(false));
  }, []);

  // ---- 定期的なトークン更新 & 復帰時チェック (T6-6 / L5) ----
  useEffect(() => {
    if (!authed) return;
    let lastRefresh = Date.now();
    const REFRESH_INTERVAL = 12 * 60 * 60 * 1000; // 12 時間

    const refreshToken = async () => {
      try {
        const { token } = await api.me();
        if (token) {
          saveToken(token);
          lastRefresh = Date.now();
        }
      } catch (err) {
        if (err?.status === 401 || err?.message?.includes('401') || err?.message?.includes('Unauthorized')) {
          forceLogoutRef.current();
        }
      }
    };

    const intervalId = setInterval(refreshToken, REFRESH_INTERVAL);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh >= REFRESH_INTERVAL) {
        refreshToken();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [authed, socket]);

  const connectSocket = () => {
    if (!socket.connected) socket.connect();
  };

  const handleLogin = (profile) => {
    const token = localStorage.getItem('hc_token');
    setCurrentUserState(profileToUserState(profile));
    setAuthed(true);
    connectSocket(token);
    // ログイン直後も未読数とメンバー一覧を取得
    refreshUnread();
    api.members().then(({ members }) => { window.__ALL_MEMBERS__ = members; }).catch(() => { });
  };

  const forceLogoutRef = useRef(() => {});
  const handleLogout = () => {
    forceLogoutRef.current();
  };



  // ---- Peer helpers (すべて peerId をキーに管理し、Socket.IO 再接続で socketId が変わっても WebRTC を維持) ----
  const isCallHealthy = useCallback((call) => {
    if (!call) return false;
    const pc = call.peerConnection;
    if (pc) {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') return false;
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') return false;
    }
    return true;
  }, []);

  const bindVoiceCallEvents = useCallback((peerId, call) => {
    let disconnectTimer = null;
    const clearDisconnectTimer = () => {
      if (disconnectTimer) {
        clearTimeout(disconnectTimer);
        disconnectTimer = null;
      }
    };

    const handleStream = (s) => {
      if (peers.current[peerId] === call && s) {
        attachAudio(peerId, s);
      }
    };

    const cleanup = () => {
      clearDisconnectTimer();
      if (peers.current[peerId] === call) {
        delete peers.current[peerId];
        removeAudio(peerId);
      }
    };

    call.on('stream', handleStream);
    call.on('close', cleanup);
    call.on('error', cleanup);

    const pc = call.peerConnection;
    if (pc) {
      pc.addEventListener('track', (ev) => {
        const s = ev.streams?.[0] || new MediaStream([ev.track]);
        handleStream(s);
      });
      const checkIce = () => {
        if (peers.current[peerId] !== call) {
          clearDisconnectTimer();
          return;
        }
        const ice = pc.iceConnectionState;
        const conn = pc.connectionState;
        if (ice === 'connected' || ice === 'completed' || conn === 'connected') {
          clearDisconnectTimer();
          if (call.remoteStream) attachAudio(peerId, call.remoteStream);
        } else if (ice === 'failed' || conn === 'failed' || ice === 'closed' || conn === 'closed') {
          try { call.close(); } catch { /* ignore */ }
          cleanup();
        } else if (ice === 'disconnected' && !disconnectTimer) {
          // まず非破壊の ICE 再起動を試し、8秒経っても復旧しない場合のみ張り直す
          disconnectTimer = setTimeout(() => {
            if (peers.current[peerId] === call && pc.iceConnectionState === 'disconnected') {
              try { if (typeof pc.restartIce === 'function') pc.restartIce(); } catch { /* ignore */ }
            }
            disconnectTimer = setTimeout(() => {
              disconnectTimer = null;
              if (peers.current[peerId] === call && (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.connectionState === 'failed')) {
                try { call.close(); } catch { /* ignore */ }
                cleanup();
              }
            }, 5000);
          }, 3000);
        }
      };
      pc.addEventListener('iceconnectionstatechange', checkIce);
      pc.addEventListener('connectionstatechange', checkIce);
    }
  }, [attachAudio, removeAudio]);

  const callPeer = useCallback((peerId) => {
    if (!peerId || !myPeer.current || myPeer.current.destroyed || myPeer.current.disconnected || !myStream.current) return;
    if (peerId === myPeer.current.id) return;
    const existing = peers.current[peerId];
    if (existing) {
      if (isCallHealthy(existing)) {
        if (existing.remoteStream) attachAudio(peerId, existing.remoteStream);
        return;
      }
      try { existing.close(); } catch { /* ignore */ }
      delete peers.current[peerId];
    }
    const call = myPeer.current.call(peerId, myStream.current);
    if (!call) return;
    peers.current[peerId] = call;
    bindVoiceCallEvents(peerId, call);
  }, [isCallHealthy, attachAudio, bindVoiceCallEvents]);

  const sendScreenToPeer = useCallback((peerId) => {
    if (!peerId || !localScreenStreamRef.current || !myPeer.current || myPeer.current.destroyed || myPeer.current.disconnected) return;
    if (peerId === myPeer.current.id) return;
    const existing = outgoingScreenPeers.current[peerId];
    if (existing && isCallHealthy(existing)) return;
    if (existing) {
      try { existing.close(); } catch { /* ignore */ }
      delete outgoingScreenPeers.current[peerId];
    }
    const call = myPeer.current.call(peerId, localScreenStreamRef.current, { metadata: { type: 'screen' } });
    if (call) {
      outgoingScreenPeers.current[peerId] = call;
      const cleanupOut = () => {
        if (outgoingScreenPeers.current[peerId] === call) delete outgoingScreenPeers.current[peerId];
      };
      call.on('close', cleanupOut);
      call.on('error', cleanupOut);

      // 画面共有の上り帯域を制限し、音声通話や Socket.IO の通信を圧迫して切断されるのを防ぐ
      const pc = call.peerConnection;
      if (pc) {
        const applyVideoBitrateCap = () => {
          try {
            pc.getSenders().forEach((sender) => {
              if (sender.track?.kind === 'video') {
                const params = sender.getParameters();
                if (!params.encodings || params.encodings.length === 0) {
                  params.encodings = [{}];
                }
                params.encodings[0].maxBitrate = 1_500_000; // 1.5 Mbps 上限
                params.encodings[0].maxFramerate = 30;
                params.degradationPreference = 'maintain-framerate';
                sender.setParameters(params).catch(() => {});
              }
            });
          } catch { /* ignore */ }
        };
        applyVideoBitrateCap();
        pc.addEventListener('iceconnectionstatechange', () => {
          if (outgoingScreenPeers.current[peerId] !== call) return;
          if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            applyVideoBitrateCap();
          } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
            try { call.close(); } catch { /* ignore */ }
            cleanupOut();
          }
        });
      }
    }
  }, [isCallHealthy]);

  const closePeer = useCallback((peerId) => {
    if (!peerId) return;
    const call = peers.current[peerId];
    if (call) {
      delete peers.current[peerId];
      try { call.close(); } catch { /* ignore */ }
    }
    const outScreen = outgoingScreenPeers.current[peerId];
    if (outScreen) {
      delete outgoingScreenPeers.current[peerId];
      try { outScreen.close(); } catch { /* ignore */ }
    }
    const inScreen = incomingScreenPeers.current[peerId];
    if (inScreen) {
      delete incomingScreenPeers.current[peerId];
      try { inScreen.close(); } catch { /* ignore */ }
    }
    removeAudio(peerId);
    setScreenStreams(prev => {
      if (!prev[peerId]) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, [removeAudio]);

  const pruneInactivePeers = useCallback((participants) => {
    if (!currentRoomId.current) return;
    const currentRoom = currentRoomId.current;
    const activePeerIds = new Set(
      Object.values(participants || {})
        .filter(u => u.userState?.connectedRoom === currentRoom && u.peerId)
        .map(u => u.peerId)
    );

    Object.keys(peers.current).forEach((peerId) => {
      if (!activePeerIds.has(peerId)) {
        closePeer(peerId);
      }
    });

    Object.keys(incomingScreenPeers.current).forEach((peerId) => {
      if (!activePeerIds.has(peerId)) {
        closePeer(peerId);
      }
    });

    Object.keys(outgoingScreenPeers.current).forEach((peerId) => {
      if (!activePeerIds.has(peerId)) {
        const call = outgoingScreenPeers.current[peerId];
        delete outgoingScreenPeers.current[peerId];
        try { call?.close(); } catch { /* ignore */ }
      }
    });
  }, [closePeer]);

  // 同じ部屋の全参加者との通話・画面共有・音声再生状態を自己修復する
  const reconcileRoomPeers = useCallback(() => {
    const room = currentRoomId.current;
    const peer = myPeer.current;
    if (!room || !myStream.current || !peer || peer.destroyed || peer.disconnected || !peer.id) return;

    const myId = peer.id;
    const now = Date.now();
    const roomUsers = Object.values(voiceParticipantsRef.current).filter(
      u => u.userState?.connectedRoom === room && u.peerId && u.peerId !== myId
    );

    roomUsers.forEach((u) => {
      const existing = peers.current[u.peerId];
      if (existing && isCallHealthy(existing)) {
        // 通話は生きているが audio 要素が消えている/一時停止している場合を復旧
        if (existing.remoteStream) {
          const el = document.getElementById(`audio-${u.peerId}`);
          if (!el || el.srcObject !== existing.remoteStream || el.paused) {
            attachAudio(u.peerId, existing.remoteStream);
          }
        }
      } else {
        // 決定的タイブレーク (myId < u.peerId) で片側のみ再発信し、二重発信 (glare) を防ぐ
        const lastTry = callRetryTimestamps.current[u.peerId] || 0;
        if (myId < u.peerId && now - lastTry >= 2500) {
          callRetryTimestamps.current[u.peerId] = now;
          callPeer(u.peerId);
        }
      }

      // 画面共有中なら未送信の参加者へ自動送信
      if (localScreenStreamRef.current) {
        sendScreenToPeer(u.peerId);
      }
    });
  }, [isCallHealthy, attachAudio, callPeer, sendScreenToPeer]);

  const createPeer = useCallback(async (forceNew = false) => {
    // 同時に複数の createPeer が走って互いの Peer を破壊するのを防ぐ
    if (!forceNew && peerCreatePromise.current) {
      return peerCreatePromise.current;
    }

    const run = async () => {
      if (!forceNew && myPeer.current && !myPeer.current.destroyed) {
        if (!myPeer.current.disconnected && myPeer.current.open && myPeer.current.id) {
          return myPeer.current.id;
        }
        // disconnected 中または reconnect 進行中 (!open) なら既存 Peer を壊さず復帰を待つ
        const reconnectedId = await new Promise((resolve) => {
          const p = myPeer.current;
          if (!p || p.destroyed) return resolve(null);
          if (p.open && p.id && !p.disconnected) return resolve(p.id);
          const timer = setTimeout(() => { cleanupListeners(); resolve(null); }, 6000);
          const onOpen = (id) => { cleanupListeners(); resolve(id); };
          const onErr = () => { cleanupListeners(); resolve(null); };
          const cleanupListeners = () => {
            clearTimeout(timer);
            p.off('open', onOpen);
            p.off('error', onErr);
            p.off('close', onErr);
          };
          p.once('open', onOpen);
          p.once('error', onErr);
          p.once('close', onErr);
          if (p.disconnected) {
            try { p.reconnect(); } catch { cleanupListeners(); resolve(null); }
          }
        });
        if (reconnectedId) return reconnectedId;
      }

      if (myPeer.current) { try { myPeer.current.destroy(); } catch { /* ignore */ } myPeer.current = null; myPeerRef.current = null; }

      const { default: Peer } = await import('peerjs');

      // 環境に依存せず現在のホスト情報をそのまま使用する（ローカル/グローバル共通）
      const peerConfig = {
        host: window.location.hostname,
        port: window.location.port || (window.location.protocol === 'https:' ? 443 : 80),
        path: '/peerjs',
        secure: window.location.protocol === 'https:',
        pingInterval: 5000,
        debug: 0,
      };

      console.log('[Peer] Connecting with config:', peerConfig);

      return new Promise((resolve, reject) => {
        const peer = new Peer(undefined, {
          ...peerConfig,
          config: {
            // サーバーの .env の ICE_SERVERS（空なら LAN 内のみ）
            iceServers: getServerConfig().iceServers,
            iceCandidatePoolSize: getServerConfig().iceServers.length ? 4 : 0,
            bundlePolicy: 'max-bundle',
          },
        });
        let settled = false;
        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            try { peer.destroy(); } catch { /* ignore */ }
            reject(new Error('PeerJS timeout'));
          }
        }, 10000);

        let reconnectAttempts = 0;

        peer.on('open', (id) => {
          reconnectAttempts = 0;
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            console.log('[Peer] Connected with ID:', id);
            myPeer.current = peer; myPeerRef.current = peer;
            peer.on('call', async (call) => {
              if (!currentRoomId.current || !(await isCallerInMyRoom(call.peer))) {
                try { call.close(); } catch { /* ignore */ }
                return;
              }
              const callerPeerId = call.peer;

              if (call.metadata?.type === 'screen') {
                if (incomingScreenPeers.current[callerPeerId]) {
                  try { incomingScreenPeers.current[callerPeerId].close(); } catch { /* ignore */ }
                }
                incomingScreenPeers.current[callerPeerId] = call;
                const handleScreenStream = (s) => {
                  if (incomingScreenPeers.current[callerPeerId] === call && s) {
                    setScreenStreams(prev => (prev[callerPeerId] === s ? prev : { ...prev, [callerPeerId]: s }));
                  }
                };
                call.on('stream', handleScreenStream);
                // PeerJS では空の MediaStream を渡して answer したほうが WebRTC の片方向映像ネゴシエーションが安定する
                try { call.answer(new MediaStream()); } catch { call.answer(); }
                const cleanupScreen = () => {
                  if (incomingScreenPeers.current[callerPeerId] === call) {
                    delete incomingScreenPeers.current[callerPeerId];
                    setScreenStreams(prev => {
                      if (!prev[callerPeerId]) return prev;
                      const n = { ...prev };
                      delete n[callerPeerId];
                      return n;
                    });
                  }
                };
                if (call.peerConnection) {
                  call.peerConnection.addEventListener('track', (ev) => {
                    const s = ev.streams?.[0] || new MediaStream([ev.track]);
                    handleScreenStream(s);
                  });
                  call.peerConnection.addEventListener('iceconnectionstatechange', () => {
                    if (incomingScreenPeers.current[callerPeerId] !== call) return;
                    const ice = call.peerConnection?.iceConnectionState;
                    if (ice === 'failed' || ice === 'closed') {
                      try { call.close(); } catch { /* ignore */ }
                      cleanupScreen();
                    }
                  });
                }
                call.on('close', cleanupScreen);
                call.on('error', cleanupScreen);
                return;
              }

              const existingVoice = peers.current[callerPeerId];
              if (existingVoice && existingVoice !== call) {
                try { existingVoice.close(); } catch { /* ignore */ }
              }
              peers.current[callerPeerId] = call;
              if (myStream.current) call.answer(myStream.current); else call.answer();
              bindVoiceCallEvents(callerPeerId, call);
            });
            resolve(id);
          } else {
            // 再接続完了後に通話状態を自己修復
            setTimeout(() => reconcileRoomPeers(), 300);
          }
        });

        peer.on('error', (err) => {
          console.error('[Peer] error:', err?.type || err);
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            reject(err);
          } else if (err?.type === 'unavailable-id' || err?.type === 'invalid-id' || err?.type === 'server-error') {
            // ID 失効などの致命的エラー時は VC 参加中なら Peer を作り直して再参加
            if (myPeer.current === peer && currentRoomId.current && myStream.current) {
              try { peer.destroy(); } catch { /* ignore */ }
            }
          }
        });

        peer.on('disconnected', () => {
          if (peer.destroyed || myPeer.current !== peer) return;
          reconnectAttempts += 1;
          if (reconnectAttempts <= 5) {
            const delay = Math.min(1000 * reconnectAttempts, 4000);
            setTimeout(() => {
              if (!peer.destroyed && peer.disconnected && myPeer.current === peer) {
                try { peer.reconnect(); } catch { /* ignore */ }
              }
            }, delay);
          } else if (currentRoomId.current && myStream.current) {
            try { peer.destroy(); } catch { /* ignore */ }
          }
        });

        peer.on('close', () => {
          if (myPeer.current === peer) {
            myPeer.current = null;
            myPeerRef.current = null;
            // VC 参加中に Peer が完全に落ちた場合は自動復旧
            if (currentRoomId.current && myStream.current && socket.connected) {
              setTimeout(async () => {
                if (!currentRoomId.current || !myStream.current || myPeer.current) return;
                try {
                  const newPeerId = await createPeer(true);
                  if (currentRoomId.current && socket.connected) {
                    socket.emit('join_voice', {
                      roomId: currentRoomId.current,
                      peerId: newPeerId,
                      userState: { ...currentUserStateRef.current, connectedRoom: currentRoomId.current },
                    });
                  }
                } catch (e) {
                  console.error('[Peer] Auto-recovery failed:', e);
                }
              }, 1500);
            }
          }
        });
      });
    };

    const p = run().finally(() => {
      if (peerCreatePromise.current === p) peerCreatePromise.current = null;
    });
    peerCreatePromise.current = p;
    return p;
  }, [isCallerInMyRoom, bindVoiceCallEvents, reconcileRoomPeers]);

  // ---- Voice ----
  // RNNoise / ダミー用に作ったものを全部解放する（マイク使用中ランプが残る・処理チェーンが増えるのを防ぐ）
  const releaseVoiceAudioRes = useCallback(() => {
    const res = voiceAudioRes.current;
    if (res.rawStream) { try { res.rawStream.getTracks().forEach(t => t.stop()); } catch { /* ignore */ } }
    res.nodes.forEach(n => { try { n.disconnect(); } catch { /* ignore */ } });
    if (res.dummyCtx) { try { res.dummyCtx.close().catch(() => { }); } catch { /* ignore */ } }
    voiceAudioRes.current = { rawStream: null, nodes: [], dummyCtx: null };
  }, []);

  const handleLeaveVoice = useCallback(() => {
    playLeaveSound();
    socket.emit('leave_voice');
    setConnectedVoiceChannel(null);
    currentRoomId.current = null;
    Object.values(peers.current).forEach((call) => { try { call.close(); } catch { /* ignore */ } });
    peers.current = {};
    Object.values(outgoingScreenPeers.current).forEach((call) => { try { call.close(); } catch { /* ignore */ } });
    outgoingScreenPeers.current = {};
    Object.values(incomingScreenPeers.current).forEach((call) => { try { call.close(); } catch { /* ignore */ } });
    incomingScreenPeers.current = {};
    callRetryTimestamps.current = {};
    if (myStream.current) { myStream.current.getTracks().forEach(t => t.stop()); myStream.current = null; }
    releaseVoiceAudioRes();
    if (localScreenStreamRef.current) { localScreenStreamRef.current.getTracks().forEach(t => t.stop()); localScreenStreamRef.current = null; }
    removeAllAudio();
    setScreenStreams({});
    setLocalScreenStream(null);
  }, [releaseVoiceAudioRes, removeAllAudio]);

  const forceLogout = useCallback(() => {
    handleLeaveVoice();
    socket.disconnect();
    clearToken();
    preloadedOnce.current = false;
    resetMessageCache();
    setAuthed(false);
    setVoiceParticipants({});
    setOnlineAccountIds([]);
  }, [handleLeaveVoice, socket]);
  forceLogoutRef.current = forceLogout;

  const handleStartScreenShare = useCallback((stream) => {
    if (!currentUserStateRef.current?.isDeafened) playScreenShareSound();
    localScreenStreamRef.current = stream;
    setLocalScreenStream(stream);
    Object.values(voiceParticipantsRef.current).forEach(user => {
      if (user.peerId && user.socketId !== socket.id
          && user.userState?.connectedRoom === currentRoomId.current) {
        sendScreenToPeer(user.peerId);
      }
    });
  }, [sendScreenToPeer]);

  const handleStopScreenShare = useCallback(() => {
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach(t => t.stop());
      localScreenStreamRef.current = null;
    }
    setLocalScreenStream(null);
    // 自分の送信中画面共有だけ閉じ、相手からの受信中画面共有は維持する
    Object.values(outgoingScreenPeers.current).forEach(call => { try { call.close(); } catch { /* ignore */ } });
    outgoingScreenPeers.current = {};
    if (currentRoomId.current && socket?.connected) {
      socket.emit('stop_screen_share');
    }
  }, []);

  // ---- DM ----
  const handleOpenDm = useCallback((member) => {
    if (!member.accountId || !currentUserState?.accountId) return;
    const channelId = [currentUserState.accountId, member.accountId].sort().join('__dm__');
    navigate(`/d/${channelId}`);
    api.dmOpen(member.accountId).then(() => {
      socket.emit('open_dm', { targetAccountId: member.accountId, channelId });
    }).catch(() => { });
  }, [currentUserState, navigate]);

  const handleJoinVoice = useCallback(async (channel) => {
    if (connectedVoiceChannel) handleLeaveVoice();
    let stream = null;
    let hasMicrophone = false;

    setConnectingVoiceChannel(channel);
    setVoiceConnectionState(t('voice.requestingMic'));

    try {
      const inputDeviceId = localStorage.getItem('hc_audio_input') || 'default';
      const audioConstraints = inputDeviceId && inputDeviceId !== 'default'
        ? { deviceId: { exact: inputDeviceId } }
        : true;
      stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
      hasMicrophone = true;

      if (localStorage.getItem('hc_noise_suppression') === 'true') {
        try {
          if (typeof window.AudioWorkletNode === 'undefined') {
            throw new Error('AudioWorkletNode is not supported in this browser.');
          }
          const { RnnoiseWorkletNode, loadRnnoise } = await import('@sapphi-red/web-noise-suppressor');

          if (!sharedAudioCtx) initAudio();
          const audioContext = sharedAudioCtx;
          if (audioContext.state === 'suspended') await audioContext.resume();

          if (!window.__RNNOISE_WASM__) {
            window.__RNNOISE_WASM__ = await loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl });
          }
          if (!window.__RNNOISE_WORKLET_LOADED__) {
            await audioContext.audioWorklet.addModule(rnnoiseWorkletUrl);
            window.__RNNOISE_WORKLET_LOADED__ = true;
          }

          const source = audioContext.createMediaStreamSource(stream);
          const rnnoise = new RnnoiseWorkletNode(audioContext, {
            wasmBinary: window.__RNNOISE_WASM__,
            maxChannels: 2
          });
          const dest = audioContext.createMediaStreamDestination();

          source.connect(rnnoise);
          rnnoise.connect(dest);

          // 元のマイクストリームとノードを保持しておく（退出時に stop / disconnect する）
          voiceAudioRes.current.rawStream = stream;
          voiceAudioRes.current.nodes = [source, rnnoise, dest];
          stream = dest.stream;
        } catch (e) {
          console.error('[Voice] Failed to setup noise suppression:', e);
        }
      }
    } catch (err) {
      // マイクが無い場合は警告を表示するが、VC には入れるようにする
      const msg = err.name === 'NotAllowedError'
        ? t('voice.micDeniedListenOnly')
        : err.name === 'NotFoundError'
          ? t('voice.micNotFoundListenOnly')
          : t('voice.micErrorListenOnly', { message: err.message });
      console.warn('[Voice]', msg);
      // マイク無しでもダミーストリームを作成してWebRTCを成立させる
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        voiceAudioRes.current.dummyCtx = ctx;
        stream = ctx.createMediaStreamDestination().stream;
      } catch (e) {
        console.error('Failed to create dummy stream', e);
      }
    }

    myStream.current = stream;
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const shouldBeMuted = currentUserStateRef.current?.isMuted || currentUserStateRef.current?.isDeafened;
        audioTrack.enabled = !shouldBeMuted;
      }
    }
    let peerId;
    setVoiceConnectionState(t('voice.connectingServer'));
    try {
      peerId = await createPeer();
    } catch (err) {
      if (stream) stream.getTracks().forEach(t => t.stop());
      myStream.current = null;
      releaseVoiceAudioRes();
      console.error('[Voice] PeerJS connection failed:', err);
      alert(t('voice.serverConnectFailed'));
      return;
    }

    setConnectedVoiceChannel(channel);
    currentRoomId.current = channel.id;
    setVoiceConnectionState(t('voice.joiningRoom'));
    socket.emit('join_voice', {
      roomId: channel.id,
      peerId,
      userState: {
        ...currentUserStateRef.current,
        connectedRoom: channel.id,
        hasMicrophone, // マイクの有無を送信
      },
    });
    setConnectingVoiceChannel(null);
    setVoiceConnectionState(null);
    playJoinSound();
  }, [connectedVoiceChannel, handleLeaveVoice, createPeer, releaseVoiceAudioRes]);

  // VC 参加中は 5 秒ごとに通話・音声要素の健全性を点検して自己修復する
  useEffect(() => {
    if (!connectedVoiceChannel) return;
    const id = setInterval(() => {
      reconcileRoomPeers();
    }, 5000);
    return () => clearInterval(id);
  }, [connectedVoiceChannel, reconcileRoomPeers]);

  // ---- Socket events ----
  useEffect(() => {
    const onConnect = async () => {
      setCurrentSocketId(socket.id);
      // 再接続のたびに未読・メンション数をサーバーと同期（スリープ復帰・瞬断対策）
      refreshUnread();
      if (currentRoomId.current && myStream.current) {
        // PeerJS の接続復帰を確認してから join_voice を送ることで peer-unavailable を防ぐ
        try {
          const peerId = await createPeer();
          if (currentRoomId.current && socket.connected && peerId) {
            socket.emit('join_voice', {
              roomId: currentRoomId.current,
              peerId,
              userState: { ...currentUserStateRef.current, connectedRoom: currentRoomId.current },
            });
          }
        } catch (e) {
          console.error('[Voice] Reconnect peer failed:', e);
        }
      }

      // 起動時に全チャンネルのメッセージを一括事前取得して即時キャッシュ（初回のみ）
      if (!preloadedOnce.current) {
        preloadedOnce.current = true;
        const myId = currentUserStateRef.current?.accountId;
        const textChannelIds = allChannels
          .filter(c => !['voice', 'activity', 'custom'].includes(c.type))
          .filter(c => canSeeChannel(myId, c.id))
          .map(c => c.id);
        if (!textChannelIds.includes('forum_metadata')) {
          textChannelIds.push('forum_metadata');
        }
        socket.emit('preload_channels', textChannelIds);
      }
    };

    const onAllChannelsHistory = (allHistory) => {
      if (allHistory['forum_metadata']) {

        const msgs = allHistory['forum_metadata'].messages || [];
        const threadIds = msgs.map(m => {
          try {
            const t = JSON.parse(m.text);
            return t && t.id ? `thread_${t.id}` : null;
          } catch(e) { return null; }
        }).filter(Boolean);
        
        // まだ頼んでいないスレッドだけまとめて 1 回で取る（ForumArea の join_room と重複させない）
        preloadRoomsOnce(socket, threadIds);
      }
    };
    const onVoiceState = (users) => {
      const next = {};
      users.forEach(u => {
        if (u.socketId !== socket.id)
          next[u.socketId] = { socketId: u.socketId, peerId: u.peerId, isSpeaking: !!u.isSpeaking, userState: { ...u.userState, connectedRoom: u.roomId } };
      });
      voiceParticipantsRef.current = next;
      setVoiceParticipants(next);
      pruneInactivePeers(next);
      if (currentRoomId.current) {
        setTimeout(() => reconcileRoomPeers(), 300);
      }
    };
    const onPeerStoppedScreenShare = ({ peerId }) => {
      if (peerId && incomingScreenPeers.current[peerId]) {
        const call = incomingScreenPeers.current[peerId];
        delete incomingScreenPeers.current[peerId];
        try { call.close(); } catch { /* ignore */ }
      }
      if (peerId) {
        setScreenStreams(prev => {
          if (!prev[peerId]) return prev;
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
      }
    };
    const onVoiceSpeaking = ({ socketId, isSpeaking }) => {
      if (socketId === socket.id) return;
      const prev = voiceParticipantsRef.current;
      const existing = prev[socketId];
      if (!existing || existing.isSpeaking === !!isSpeaking) return;
      const updated = {
        ...prev,
        [socketId]: { ...existing, isSpeaking: !!isSpeaking },
      };
      voiceParticipantsRef.current = updated;
      setVoiceParticipants(updated);
    };
    const onVoiceUserUpdated = ({ socketId, roomId, userState }) => {
      if (socketId === socket.id) return;
      const prev = voiceParticipantsRef.current;
      const existing = prev[socketId];
      if (!existing) return;
      const updated = {
        ...prev,
        [socketId]: {
          ...existing,
          userState: { ...userState, connectedRoom: roomId || userState?.connectedRoom }
        }
      };
      voiceParticipantsRef.current = updated;
      setVoiceParticipants(updated);
      pruneInactivePeers(updated);
    };
    const onUserJoined = ({ socketId, peerId, roomId }) => {
      if (socketId === socket.id || currentRoomId.current !== roomId) return;
      if (!currentUserStateRef.current?.isDeafened) playJoinSound();
      if (!myStream.current || !myPeer.current || !peerId) return;
      callPeer(peerId);
      if (localScreenStreamRef.current) {
        sendScreenToPeer(peerId);
      }
    };
    const onRoomMembers = (members) => {
      // 着信チェック用に一覧を反映し、不足している接続があれば自己修復する
      if (!Array.isArray(members)) return;
      const next = { ...voiceParticipantsRef.current };
      members.forEach(u => { next[u.socketId] = { socketId: u.socketId, peerId: u.peerId, userState: { ...u.userState, connectedRoom: u.roomId } }; });
      voiceParticipantsRef.current = next;
      setTimeout(() => reconcileRoomPeers(), 400);
    };
    const onUserLeft = ({ socketId, peerId }) => {
      let wasInRoom = false;
      const prev = voiceParticipantsRef.current;
      const next = { ...prev };
      const u = next[socketId];
      const leftPeerId = peerId || u?.peerId;
      if (u) {
        wasInRoom = u.userState?.connectedRoom === currentRoomId.current;
        delete next[socketId];
      }
      voiceParticipantsRef.current = next;
      setVoiceParticipants(next);
      if (leftPeerId) {
        if (peers.current[leftPeerId]) wasInRoom = true;
        closePeer(leftPeerId);
      }
      pruneInactivePeers(next);
      if (wasInRoom && !currentUserStateRef.current?.isDeafened) playLeaveSound();
    };
    const onOnlineUsers = (accountIds) => setOnlineAccountIds(prev =>
      (prev.length === accountIds.length && prev.every((v, i) => v === accountIds[i]) ? prev : accountIds));
    const onProfileUpdated = ({ accountId, profile }) => {
      // 1. window.__ALL_MEMBERS__ を更新
      if (window.__ALL_MEMBERS__) {
        const idx = window.__ALL_MEMBERS__.findIndex(m => m.accountId === accountId);
        if (idx > -1) {
          window.__ALL_MEMBERS__[idx] = { ...window.__ALL_MEMBERS__[idx], ...profile };
        }
      }

      // 2. window.__DM_PARTNERS__ を更新
      if (window.__DM_PARTNERS__) {
        for (const [chId, partner] of Object.entries(window.__DM_PARTNERS__)) {
          if (partner.accountId === accountId) {
            window.__DM_PARTNERS__[chId] = { ...partner, ...profile };
          }
        }
      }

      // 3. 自分自身の currentUserState を更新
      setCurrentUserState(prev => {
        if (prev.accountId === accountId) return { ...prev, ...profileToUserState(profile) };
        return prev;
      });

      // 4. voiceParticipants を更新
      setVoiceParticipants(prev => {
        let changed = false;
        const next = { ...prev };
        for (const [sid, p] of Object.entries(next)) {
          if (p.userState?.accountId === accountId) {
            next[sid] = { ...p, userState: { ...p.userState, ...profile } };
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };
    // 未読カウント：自分が今いないチャンネルにメッセージが来たら +1
    const onReceiveMessage = (data) => {
      if (data.channelId === 'forum_metadata') {
        try {
          const t = JSON.parse(data.text);
          if (t && t.id) {
            joinRoomOnce(socket, `thread_${t.id}`);
          }
        } catch(e) {}
      }

      const isMine = data.user === currentUserStateRef.current?.accountId;
      const myAccountId = currentUserStateRef.current?.accountId;

      let isMentioned = false;
      if (myAccountId && data.text && (
        data.text.includes(`<${myAccountId}>`) ||
        data.text.includes('<hamachill>') ||
        data.text.includes('<everyone>')
      )) {
        isMentioned = true;
      }

      if (!isMine && isMentioned) {
        // デスクトップ通知 (メンション時のみ。ウィンドウがフォーカスされていない場合)
        if (!document.hasFocus() && Notification.permission === 'granted' && localStorage.getItem('hc_desktop_notifications') === 'true') {
          const author = window.__ALL_MEMBERS__?.find(m => m.accountId === data.user)?.displayName || data.user;
          const n = new Notification(t('notifications.mention', { author }), {
            body: localizeSystemText(data.text, data.user).replace(/<[^>]+>/g, ''), // 簡易的なタグ除去
            icon: '/favicon.png'
          });
          n.onclick = () => {
            window.focus();
          };
        }
      }

      if (data.channelId !== activeChannelRef.current) {
        if (!isMine) {
          setUnreadCounts(prev => ({
            ...prev,
            [data.channelId]: (prev[data.channelId] || 0) + 1,
          }));
          
          if (isMentioned) {
            setMentionCounts(prev => ({
              ...prev,
              [data.channelId]: (prev[data.channelId] || 0) + 1,
            }));
          }
          if (!currentUserStateRef.current?.isDeafened) playNotificationSound();
        }
      } else {
        // 現在見ているチャンネルにメッセージが届いた場合、サーバー側の既読状態（lastReadAt）を更新
        scheduleMarkRead(data.channelId);
        if (!isMine && !currentUserStateRef.current?.isDeafened) playNotificationSound();
      }
    };

    const onMarkRead = ({ channelId }) => {
      setUnreadCounts(prev => {
        if (!prev[channelId]) return prev;
        const n = { ...prev };
        delete n[channelId];
        return n;
      });
      setMentionCounts(prev => {
        if (!prev[channelId]) return prev;
        const n = { ...prev };
        delete n[channelId];
        return n;
      });
    };

    const onPlaySoundboard = ({ filename, sender }) => {
      if (currentUserStateRef.current?.isDeafened) return;
      if (!connectedVoiceChannelRef.current) return;
      soundboardManager.play(filename);
    };

    const handleDmUnauthorized = () => {
      navigate('/c/announcements', { replace: true });
    };

    let authRetryAt = 0;
    const onConnectError = (err) => {
      if (err?.message !== 'unauthorized') return; // ネットワークの問題は自動再接続に任せる
      const now = Date.now();
      if (now - authRetryAt < 10000) { // 10 秒以内に 2 回目 → あきらめてログアウト
        forceLogout();
        return;
      }
      authRetryAt = now;
      api.me()
        .then(({ token }) => { if (token) saveToken(token); socket.connect(); })
        .catch(() => { forceLogout(); });
    };

    const onDisconnect = (reason) => {
      if (reason === 'io server disconnect') socket.connect();
    };

    const onHcUnauthorized = () => {
      forceLogout();
    };
    window.addEventListener('hc:unauthorized', onHcUnauthorized);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('voice_state_update', onVoiceState);
    socket.on('voice_user_updated', onVoiceUserUpdated);
    socket.on('voice_speaking', onVoiceSpeaking);
    socket.on('peer_stopped_screen_share', onPeerStoppedScreenShare);
    socket.on('user_joined_voice', onUserJoined);
    socket.on('voice_room_members', onRoomMembers);
    socket.on('user_left_voice', onUserLeft);
    socket.on('online_users', onOnlineUsers);
    socket.on('profile_updated', onProfileUpdated);
    socket.on('receive_message', onReceiveMessage);
    socket.on('mark_read', onMarkRead);
    socket.on('play_soundboard', onPlaySoundboard);
    socket.on('vc_names', setVcNames);
    socket.on('dm_unauthorized', handleDmUnauthorized);
    socket.on('all_channels_history', onAllChannelsHistory);
    initMessageCache(socket);
    if (socket.connected) onConnect();

    return () => {
      window.removeEventListener('hc:unauthorized', onHcUnauthorized);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('voice_state_update', onVoiceState);
      socket.off('voice_user_updated', onVoiceUserUpdated);
      socket.off('voice_speaking', onVoiceSpeaking);
      socket.off('peer_stopped_screen_share', onPeerStoppedScreenShare);
      socket.off('user_joined_voice', onUserJoined);
      socket.off('voice_room_members', onRoomMembers);
      socket.off('user_left_voice', onUserLeft);
      socket.off('online_users', onOnlineUsers);
      socket.off('profile_updated', onProfileUpdated);
      socket.off('receive_message', onReceiveMessage);
      socket.off('mark_read', onMarkRead);
      socket.off('play_soundboard', onPlaySoundboard);
      socket.off('vc_names', setVcNames);
      socket.off('dm_unauthorized', handleDmUnauthorized);
      socket.off('all_channels_history', onAllChannelsHistory);
    };
  }, [callPeer, closePeer, createPeer, pruneInactivePeers, reconcileRoomPeers, sendScreenToPeer]);

  useEffect(() => () => { handleLeaveVoice(); if (myPeer.current) { try { myPeer.current.destroy(); } catch (e) { } } }, []);

  // ---- Render ----
  if (authChecking) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#0e0e10]">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  if (!authed) {
    return (
      <Suspense fallback={<div className="min-h-screen w-full flex items-center justify-center bg-[#0e0e10]"><div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" /></div>}>
        <LoginPage onLogin={handleLogin} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<div className="min-h-screen w-full flex items-center justify-center bg-[#0e0e10]"><div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" /></div>}>
      {showSettings && (
        <SettingsScreen
          onClose={() => setShowSettings(false)}
          userState={currentUserState}
          setUserState={setCurrentUserState}
          onLogout={handleLogout}
          socket={socket}
        />
      )}
      <Routes>
        <Route path="/c/:channelId" element={
          <MainLayout {...{
            allChannels, connectedVoiceChannel, voiceParticipants,
            handleJoinVoice, handleLeaveVoice, currentUserState, setCurrentUserState,
            setShowSettings, showSettings, currentSocketId, onlineAccountIds,
            unreadCounts, mentionCounts, clearUnread, activeChannelRef, handleOpenDm,
            connectingVoiceChannel, voiceConnectionState, setConnectingVoiceChannel, setVoiceConnectionState,
            vcNames, onRenameVc,
            screenStreams, localScreenStream, onStartScreenShare: handleStartScreenShare, onStopScreenShare: handleStopScreenShare
          }} />
        } />
        <Route path="/d/:userId" element={
          <MainLayout {...{
            allChannels, connectedVoiceChannel, voiceParticipants,
            handleJoinVoice, handleLeaveVoice, currentUserState, setCurrentUserState,
            setShowSettings, showSettings, currentSocketId, onlineAccountIds,
            unreadCounts, mentionCounts, clearUnread, activeChannelRef, handleOpenDm,
            connectingVoiceChannel, voiceConnectionState, setConnectingVoiceChannel, setVoiceConnectionState,
            vcNames, onRenameVc,
            screenStreams, localScreenStream, onStartScreenShare: handleStartScreenShare, onStopScreenShare: handleStopScreenShare
          }} />
        } />
        <Route path="/" element={<Navigate to="/c/rules" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
