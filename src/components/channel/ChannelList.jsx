import React, { useState, useEffect } from 'react';
import PanelHeader from '../ui/PanelHeader';
import { Channel } from './Channel';
import { MicrophoneSlash, SpeakerSlash, ChatCenteredDots } from '@phosphor-icons/react';
import PhosphorIcon from '../ui/PhosphorIcon';
import { getNameStyle } from '../../utils/nameStyle';
import { canSeeChannel, useServerConfig } from '../../utils/permissions';
import { t } from '../../i18n';

function ChannelList({ activeChannel, onChannelSelect, connectedVoiceChannel, connectingVoiceChannel, participantsData, socketId, currentUserState, unreadCounts = {}, mentionCounts = {}, vcNames = {}, onRenameVc }) {
  useServerConfig(); // 権限が届いたら再描画
  const [recentThreads, setRecentThreads] = useState([]);
  const [pendingId, setPendingId] = useState(null);

  const scrollContainerRef = React.useRef(null);
  const listWrapperRef = React.useRef(null);
  const [indicatorRect, setIndicatorRect] = useState(null);
  const [indicatorMode, setIndicatorMode] = useState('instant');
  const [stretchData, setStretchData] = useState(null);
  const prevTopRef = React.useRef(null);
  const isFirstRenderRef = React.useRef(true);
  const isUserClickRef = React.useRef(false);

  useEffect(() => {
    setPendingId(null);
  }, [activeChannel?.id]);

  const selectedId = pendingId ?? activeChannel?.id;

  const updateIndicator = React.useCallback((mode = null) => {
    if (!listWrapperRef.current || !selectedId) {
      setIndicatorRect(prev => prev ? { ...prev, opacity: 0 } : null);
      return;
    }

    const target = listWrapperRef.current.querySelector(`[data-channel-id="${selectedId}"]`);
    if (!target || target.closest('.collapsible-grid:not(.expanded)')) {
      setIndicatorRect(prev => prev ? { ...prev, opacity: 0 } : null);
      return;
    }

    const wrapperRect = listWrapperRef.current.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    const top = targetRect.top - wrapperRect.top;
    const left = targetRect.left - wrapperRect.left;
    const width = targetRect.width;
    const height = targetRect.height;

    const isSpring = mode === 'spring' || (!mode && !isFirstRenderRef.current && isUserClickRef.current);

    if (mode) {
      setIndicatorMode(mode);
    } else if (isFirstRenderRef.current) {
      setIndicatorMode('instant');
      isFirstRenderRef.current = false;
    } else if (isUserClickRef.current) {
      setIndicatorMode('spring');
      isUserClickRef.current = false;
    } else {
      setIndicatorMode('layout');
    }

    // スピードが出ている中盤でのストレッチ（距離に応じた伸縮率を算出）
    if (isSpring && prevTopRef.current !== null) {
      const distance = Math.abs(top - prevTopRef.current);
      if (distance > 4) {
        // 距離が近い（隣~40px）でもしっかり伸びる(~1.24)、距離が遠い（150px~350px+）ならダイナミックに伸びる(~1.52)
        const scale = Math.min(1.20 + (distance / 280) * 0.32, 1.52);
        setStretchData({ key: Date.now(), scale: Number(scale.toFixed(3)) });
      }
    }

    prevTopRef.current = top;
    setIndicatorRect({ top, left, width, height, opacity: 1 });
  }, [selectedId]);

  React.useLayoutEffect(() => {
    updateIndicator();
  }, [selectedId, updateIndicator]);

  useEffect(() => {
    if (!listWrapperRef.current) return;
    const ro = new ResizeObserver(() => {
      updateIndicator('layout');
    });
    ro.observe(listWrapperRef.current);
    return () => ro.disconnect();
  }, [updateIndicator]);

  useEffect(() => {
    const updateRecentThreads = () => {
      const msgs = window.__GLOBAL_MESSAGE_CACHE__?.['forum_metadata'] || [];
      const parsedThreads = msgs.map(m => {
        try { return JSON.parse(m.text); } catch(e) { return null; }
      }).filter(Boolean);

      parsedThreads.sort((a, b) => {
        const msgsA = window.__GLOBAL_MESSAGE_CACHE__[`thread_${a.id}`] || [];
        const msgsB = window.__GLOBAL_MESSAGE_CACHE__[`thread_${b.id}`] || [];
        const lastA = msgsA.length > 0 ? new Date(msgsA[msgsA.length - 1].timestamp).getTime() : new Date(a.createdAt).getTime();
        const lastB = msgsB.length > 0 ? new Date(msgsB[msgsB.length - 1].timestamp).getTime() : new Date(b.createdAt).getTime();
        return lastB - lastA;
      });

      setRecentThreads(parsedThreads.slice(0, 3));
    };

    updateRecentThreads();

    const onCacheUpdate = (e) => {
      if (e.detail?.all || e.detail?.channelId === 'forum_metadata' || e.detail?.channelId?.startsWith('thread_')) {
        updateRecentThreads();
      }
    };

    window.addEventListener('cache_updated', onCacheUpdate);
    return () => window.removeEventListener('cache_updated', onCacheUpdate);
  }, []);

  const handleChannelClick = (channel) => {
    isUserClickRef.current = true;
    setPendingId(channel.id);
    onChannelSelect(channel);
  };

  const renderParticipants = (channelId) => {
    // このチャンネル(channelId)にいる他の参加者を抽出
    const others = Object.values(participantsData || {}).filter(p => 
      p.userState?.connectedRoom === channelId && p.socketId !== socketId
    );
    
    // 自分がこのチャンネルに実際に接続中か
    const isMeInHere = connectedVoiceChannel?.id === channelId;
    
    let participants = [...others];
    
    if (isMeInHere && currentUserState) {
      // socketId ベースで重複チェック（複数タブ対応）
      const meExists = others.some(p => p.socketId === socketId);
      if (!meExists) {
        participants.unshift({
          socketId,
          userState: { ...currentUserState, connectedRoom: channelId },
        });
      }
    }

    if (participants.length === 0) return null;

    return (
      <div className="ml-9 mt-1 mb-2 space-y-1">
        {participants.map((p, idx) => (
          <div key={p.socketId || idx} className="flex items-center justify-between group/user py-1 pr-2 hc-vc-join">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-4 h-4 rounded-full bg-zinc-950/10 flex items-center justify-center text-[7px] font-black text-zinc-900/40 border border-zinc-950/5 shrink-0 overflow-hidden hc-vc-mini-avatar ${(p.isSpeaking || p.userState?.isSpeaking) ? 'is-speaking' : ''}`}>
                {p.userState?.avatarUrl ? (
                  <img src={p.userState.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  p.userState?.name?.[0]?.toUpperCase() || '?'
                )}
              </div>
              <span className="text-[12px] font-medium text-zinc-500 group-hover/user:text-zinc-900 truncate py-1 -my-1 px-1 -mx-1 block" style={p.userState ? getNameStyle(p.userState) : undefined}>
                {p.userState?.name}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {p.userState?.isMuted && <PhosphorIcon icon={MicrophoneSlash} size={15} weight="fill" className="text-red-500" />}
              {p.userState?.isDeafened && <PhosphorIcon icon={SpeakerSlash} size={15} weight="fill" className="text-red-500" />}
            </div>
          </div>
        ))}
      </div>
    );
  };



  const indicatorStyle = indicatorRect ? {
    transform: `translate3d(${indicatorRect.left}px, ${indicatorRect.top}px, 0)`,
    width: `${indicatorRect.width}px`,
    height: `${indicatorRect.height}px`,
    opacity: indicatorRect.opacity ?? 1,
  } : {
    opacity: 0,
    pointerEvents: 'none',
  };

  const indicatorClass = indicatorMode === 'spring'
    ? 'channel-indicator-spring'
    : indicatorMode === 'layout'
      ? 'channel-indicator-layout'
      : 'channel-indicator-instant';

  return (
    <nav className="w-full h-full min-h-0 bg-[var(--bg-channel)] backdrop-blur-[var(--glass-blur)] flex flex-col">
      <div ref={scrollContainerRef} className={`flex-1 min-h-0 overflow-y-auto py-3 ${(connectedVoiceChannel || connectingVoiceChannel) ? 'md:mb-[132px]' : 'md:mb-[76px]'}`}>
        <div ref={listWrapperRef} className="relative min-h-full space-y-4">
          {/* Active channel sliding indicator pill */}
          <div
            style={indicatorStyle}
            className={`channel-active-indicator ${indicatorClass}`}
            aria-hidden="true"
          >
            <div
              key={stretchData?.key}
              className={`channel-indicator-pill ${stretchData ? 'is-stretching' : ''}`}
              style={stretchData ? { '--stretch-scale': stretchData.scale } : undefined}
            />
          </div>

          <div className="space-y-0.5">
            <Channel 
              id="rules"
              name={t('channels.rules')} 
              type="rules" 
              selected={selectedId === 'rules'} 
              onClick={() => handleChannelClick({ id: 'rules', name: t('channels.rules'), type: 'rules' })}
            />
            <Channel 
              id="announcements"
              name={t('channels.announcements')} 
              type="announcements" 
              selected={selectedId === 'announcements'} 
              onClick={() => handleChannelClick({ id: 'announcements', name: t('channels.announcements'), type: 'announcements' })}
              unread={unreadCounts['announcements'] || 0}
              mention={mentionCounts['announcements'] || 0}
            />
          </div>

          <div className="space-y-0.5">
            <div className="px-4 mb-1">
              <span className="text-[11.5px] font-bold tracking-wider text-zinc-900/50 uppercase">{t('channels.textChat')}</span>
            </div>
            <Channel 
              id="general"
              name={t('channels.general')} 
              selected={selectedId === 'general'} 
              onClick={() => handleChannelClick({ id: 'general', name: t('channels.general'), type: 'text' })}
              unread={unreadCounts['general'] || 0}
              mention={mentionCounts['general'] || 0}
            />
            <Channel 
              id="threads"
              name={t('channels.threads')} 
              type="forum"
              selected={selectedId === 'threads'} 
              onClick={() => handleChannelClick({ id: 'threads', name: t('channels.threads'), type: 'forum' })}
              unread={unreadCounts['threads'] || 0}
              mention={mentionCounts['threads'] || 0}
            />
            {recentThreads.length > 0 && (
              <div className="relative ml-6 mt-0.5 mb-1.5 flex flex-col gap-0.5">
                {recentThreads.map((t, idx) => {
                  const isLast = idx === recentThreads.length - 1;
                  const hasUnread = unreadCounts[`thread_${t.id}`] > 0;
                  const isSelected = activeChannel?.id === 'thread_' + t.id;
                  return (
                    <div 
                      key={t.id} 
                      onClick={() => handleChannelClick({ id: 'thread_' + t.id, name: t.title, type: 'text' })}
                      className="relative flex items-center group cursor-pointer h-[26px]"
                    >
                      <svg className="absolute left-[-10px] top-0 h-full w-[24px] text-zinc-300 dark:text-[#42444b] pointer-events-none" fill="none" viewBox="0 0 24 26" preserveAspectRatio="none">
                        <path 
                          d={isLast ? "M 8 0 L 8 5 Q 8 13 16 13 L 24 13" : "M 8 0 L 8 26 M 8 13 L 24 13"} 
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" 
                        />
                      </svg>
                      <div 
                        data-channel-id={'thread_' + t.id}
                        className={`relative z-10 ml-3 px-2 py-1 rounded-md flex-1 min-w-0 truncate text-[13px] flex items-center ${
                        isSelected 
                          ? 'text-zinc-900 dark:text-white font-semibold' 
                          : hasUnread 
                            ? 'text-zinc-900 dark:text-white font-bold hover:bg-zinc-950/5 dark:hover:bg-white/5' 
                            : 'text-zinc-500 dark:text-[#949ba4] font-medium hover:text-zinc-900 dark:hover:text-[#dbdee1] hover:bg-zinc-950/5 dark:hover:bg-white/5'
                      }`}>
                        <span className="truncate">{t.title}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-0.5">
            <div className="px-4 mb-1">
              <span className="text-[11.5px] font-bold tracking-wider text-zinc-900/50 uppercase">{t('channels.voiceChat')}</span>
            </div>
            <Channel 
              id="vc1"
              name={vcNames.vc1 || 'VC 1'} 
              type="voice" 
              selected={selectedId === 'vc1'} 
              onClick={() => handleChannelClick({ id: 'vc1', name: vcNames.vc1 || 'VC 1', type: 'voice' })}
              onEdit={() => {
                const newName = prompt(t('channels.promptVcName'), vcNames.vc1 || 'VC 1');
                if (newName && newName.trim() && onRenameVc) onRenameVc('vc1', newName.trim().slice(0, 20));
              }}
            />
            {renderParticipants('vc1')}
            
            <Channel 
              id="vc2"
              name={vcNames.vc2 || 'VC 2'} 
              type="voice" 
              selected={selectedId === 'vc2'} 
              onClick={() => handleChannelClick({ id: 'vc2', name: vcNames.vc2 || 'VC 2', type: 'voice' })}
              onEdit={() => {
                const newName = prompt(t('channels.promptVcName'), vcNames.vc2 || 'VC 2');
                if (newName && newName.trim() && onRenameVc) onRenameVc('vc2', newName.trim().slice(0, 20));
              }}
            />
            {renderParticipants('vc2')}

            <Channel 
              id="vc3"
              name={vcNames.vc3 || 'VC 3'} 
              type="voice" 
              selected={selectedId === 'vc3'} 
              onClick={() => handleChannelClick({ id: 'vc3', name: vcNames.vc3 || 'VC 3', type: 'voice' })}
              onEdit={() => {
                const newName = prompt(t('channels.promptVcName'), vcNames.vc3 || 'VC 3');
                if (newName && newName.trim() && onRenameVc) onRenameVc('vc3', newName.trim().slice(0, 20));
              }}
            />
            {renderParticipants('vc3')}

            <Channel 
              id="kikisen"
              name={t('channels.kikisen')} 
              selected={selectedId === 'kikisen'} 
              onClick={() => handleChannelClick({ id: 'kikisen', name: t('channels.kikisen'), type: 'text' })}
              unread={unreadCounts['kikisen'] || 0}
              mention={mentionCounts['kikisen'] || 0}
            />
          </div>

          {canSeeChannel(currentUserState?.accountId, 'logs') && (
            <div className="space-y-0.5">
              <div className="px-4 mb-1">
                <span className="text-[11.5px] font-bold tracking-wider text-zinc-900/50 uppercase">{t('channels.system')}</span>
              </div>
              <Channel 
                id="logs"
                name={t('channels.logs')} 
                selected={selectedId === 'logs'} 
                onClick={() => handleChannelClick({ id: 'logs', name: t('channels.logs'), type: 'text' })}
                unread={unreadCounts['logs'] || 0}
                mention={mentionCounts['logs'] || 0}
              />
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

export default React.memo(ChannelList);