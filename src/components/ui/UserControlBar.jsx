import { useState, useRef, useEffect } from 'react';
import {
  Microphone,
  MicrophoneSlash,
  Headphones,
  SpeakerSlash,
  SpeakerHigh,
  SpeakerSimpleSlash,
  Square,
  Gear
} from '@phosphor-icons/react';
import PhosphorIcon from './PhosphorIcon';
import { getNameStyle } from '../../utils/nameStyle';
import { useSoundboard } from '../../utils/soundboardManager';
import UserProfileCard from './UserProfileCard';
import { t } from '../../i18n';

export default function UserControlBar({ socket, onlineAccountIds, userState, setUserState, onSettingsClick, className = "w-full" }) {
  const { name, isMuted, isDeafened, accountId } = userState;
  const [profilePopupPos, setProfilePopupPos] = useState(null);
  const [isConnected, setIsConnected] = useState(socket?.connected || false);

  const { isMuted: isSoundboardMuted, isPlaying: isSoundboardPlaying, toggleMute: toggleSoundboardMute, stopAll: stopSoundboardAll } = useSoundboard();

  const isOnline = onlineAccountIds?.includes(accountId);

  useEffect(() => {
    if (!socket) return;
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    setIsConnected(socket.connected);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  const setIsMuted = (val) => setUserState(prev => ({ ...prev, isMuted: val }));
  const setIsDeafened = (val) => setUserState(prev => ({ ...prev, isDeafened: val }));

  const openProfile = (e) => {
    e.stopPropagation();
    if (profilePopupPos) {
      setProfilePopupPos(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setProfilePopupPos({
      bottom: Math.max(16, window.innerHeight - rect.top + 8),
      left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - 332)),
    });
  };

  return (
    <div className={`relative ${className}`}>
      {profilePopupPos && (
        <UserProfileCard
          user={{ ...userState, isOnline, isSelf: true, name: userState.displayName || userState.name, accountId }}
          position={profilePopupPos}
          onClose={() => setProfilePopupPos(null)}
          onEditProfile={onSettingsClick}
          socket={socket}
          showAccountMenu
        />
      )}

      <div className="flex items-center justify-between w-full min-h-[56px] px-1.5 py-1.5 relative overflow-hidden bg-transparent select-none">
        {/* Profile Avatar + Info (統合された単一クリック領域) */}
        <div
          className="flex items-center flex-1 min-w-0 mr-1 px-1.5 py-1 rounded-[8px] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors cursor-pointer group/profile"
          onClick={openProfile}
          title={t('userBar.openProfile')}
        >
          <div className="relative shrink-0">
            <div className={`w-9 h-9 bg-zinc-950/10 dark:bg-white/10 rounded-full flex items-center justify-center text-zinc-900 dark:text-zinc-100 font-black text-xs overflow-hidden transition-shadow duration-150 ${userState.isSpeaking ? 'ring-[2.5px] ring-[#23a55a]' : ''}`}>
              {userState.avatarUrl
                ? <img src={userState.avatarUrl} alt="" className="w-full h-full object-cover" />
                : (name && name[0] ? name[0].toUpperCase() : '?')
              }
            </div>
            <div
              className={`absolute -bottom-[2px] -right-[2px] w-3.5 h-3.5 rounded-full border-[2.5px] border-white dark:border-[#1e1f20] flex items-center justify-center ${
                isOnline ? 'bg-emerald-500' : 'bg-[#80848e]'
              }`}
            >
              {!isOnline && <div className="w-1.5 h-1.5 rounded-full bg-white dark:bg-[#1e1f20]" />}
            </div>
          </div>

          <div className="ml-2.5 flex flex-col items-start overflow-hidden flex-1 min-w-0">
            <div className="w-full truncate text-left leading-tight">
              <span className="text-[14px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 truncate" style={getNameStyle(userState)}>
                {userState.displayName || name}
              </span>
            </div>
            <span className="text-[12px] font-normal leading-tight text-zinc-500 dark:text-zinc-400 truncate w-full text-left mt-0.5">
              {isOnline ? t('presence.online') : t('presence.offline')}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0 pr-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMuted(!isMuted);
            }}
            className={`w-8 h-8 rounded-[8px] transition-all active:scale-95 cursor-pointer flex items-center justify-center shrink-0 ${
              isMuted ? 'text-red-500 bg-red-500/10' : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
            title={isMuted ? t('userBar.unmute') : t('userBar.mute')}
          >
            <PhosphorIcon icon={isMuted ? MicrophoneSlash : Microphone} size={20} />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsDeafened(!isDeafened);
            }}
            className={`w-8 h-8 rounded-[8px] transition-all active:scale-95 cursor-pointer flex items-center justify-center shrink-0 ${
              isDeafened ? 'text-red-500 bg-red-500/10' : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
            title={isDeafened ? t('userBar.undeafen') : t('userBar.deafen')}
          >
            <PhosphorIcon icon={isDeafened ? SpeakerSlash : Headphones} size={20} />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isSoundboardPlaying) {
                stopSoundboardAll();
              } else {
                toggleSoundboardMute();
              }
            }}
            className={`w-8 h-8 rounded-[8px] transition-all active:scale-95 cursor-pointer flex items-center justify-center shrink-0 ${
              isSoundboardMuted
                ? 'text-red-500 bg-red-500/10'
                : isSoundboardPlaying
                  ? 'text-red-500 bg-red-500/15 animate-pulse'
                  : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
            title={
              isSoundboardMuted
                ? t('userBar.unmuteSoundboard')
                : isSoundboardPlaying
                  ? t('userBar.stopSoundboard')
                  : t('userBar.muteSoundboard')
            }
          >
            <PhosphorIcon
              icon={isSoundboardMuted ? SpeakerSimpleSlash : isSoundboardPlaying ? Square : SpeakerHigh}
              size={20}
            />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onSettingsClick) onSettingsClick();
            }}
            onPointerEnter={() => import('./SettingsScreen')}
            className="w-8 h-8 rounded-[8px] transition-all text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 cursor-pointer flex items-center justify-center shrink-0"
            title={t('settings.userSettings')}
          >
            <PhosphorIcon icon={Gear} size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}