import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { navigateTo } from '../../utils/nav';
import PanelHeader from '../ui/PanelHeader';
import { DMUser } from './DMUser';
import { api } from '../../utils/api';
import { t } from '../../i18n';

function DMList({ 
  socket, 
  currentUserState, 
  setUserState,
  onSettingsClick,
  unreadCounts = {}, 
  onlineAccountIds = [],
  connectedVoiceChannel,
  connectingVoiceChannel,
  voiceConnectionState,
  onLeaveVoice
}) {
  const { userId } = useParams();
  const [pendingId, setPendingId] = useState(null);
  useEffect(() => { setPendingId(null); }, [userId]);
  const selectedUserId = pendingId ?? userId;

  const scrollContainerRef = useRef(null);
  const listWrapperRef = useRef(null);
  const [indicatorRect, setIndicatorRect] = useState(null);
  const [indicatorMode, setIndicatorMode] = useState('instant');
  const [stretchData, setStretchData] = useState(null);
  const prevTopRef = useRef(null);
  const isFirstRenderRef = useRef(true);
  const isUserClickRef = useRef(false);

  const [members, setMembers] = useState([]);       // 全メンバー
  const [dmOrder, setDmOrder] = useState([]); // channelId の順序（最新メッセージ順）
  const [channelMap, setChannelMap] = useState({}); // accountId → channelId
  const channelMapRef = useRef(channelMap);
  useEffect(() => { channelMapRef.current = channelMap; }, [channelMap]);

  const updateIndicator = useCallback((mode = null) => {
    if (!listWrapperRef.current || !selectedUserId) {
      setIndicatorRect(prev => prev ? { ...prev, opacity: 0 } : null);
      return;
    }

    const target = listWrapperRef.current.querySelector(`[data-channel-id="${selectedUserId}"]`);
    if (!target) {
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

    if (isSpring && prevTopRef.current !== null) {
      const distance = Math.abs(top - prevTopRef.current);
      if (distance > 4) {
        const scale = Math.min(1.10 + (distance / 320) * 0.26, 1.36);
        setStretchData({ key: Date.now(), scale: Number(scale.toFixed(3)) });
      }
    }

    prevTopRef.current = top;
    setIndicatorRect({ top, left, width, height, opacity: 1 });
  }, [selectedUserId]);

  React.useLayoutEffect(() => {
    updateIndicator();
  }, [selectedUserId, updateIndicator]);

  useEffect(() => {
    if (!listWrapperRef.current) return;
    const ro = new ResizeObserver(() => {
      updateIndicator('layout');
    });
    ro.observe(listWrapperRef.current);
    return () => ro.disconnect();
  }, [updateIndicator]);

  const refreshDms = useCallback(() => {
    return Promise.all([api.members(), api.get('/dm/list?ts=' + Date.now())]).then(([{ members: list }, { dms }]) => {
      setMembers(list);
      window.__ALL_MEMBERS__ = list;
      window.__DM_PARTNERS__ = window.__DM_PARTNERS__ || {};
      const map = {};
      dms.forEach(d => {
        map[d.partnerAccountId] = d.channelId;
        const partner = list.find(m => m.accountId === d.partnerAccountId);
        if (partner) window.__DM_PARTNERS__[d.channelId] = partner;
      });
      window.dispatchEvent(new Event('dm_partners_updated'));
      setChannelMap(map);
      // メッセージ履歴がある DM のみを最新順の並び替え対象にする（開いただけの空 DM で順位が飛ばないようにする）
      setDmOrder(dms.filter(d => d.lastMessageAt != null).map(d => d.channelId));
      return dms.map(d => d.channelId);
    });
  }, []);

  // 全メンバーと DM チャンネル一覧を取得
  useEffect(() => {
    refreshDms().then(dmIds => {
      if (socket && dmIds.length > 0) {
        socket.emit('preload_channels', dmIds);
      }
    }).catch(() => {});
  }, [socket, refreshDms]);

  // メッセージが来たら順序を更新（最新を先頭に）
  useEffect(() => {
    if (!socket) return;
    const onMsg = (data) => {
      const cid = data.channelId;
      if (!cid?.includes('__dm__')) return;
      setDmOrder(prev => [cid, ...prev.filter(id => id !== cid)]);
      if (!Object.values(channelMapRef.current).includes(cid)) {
        refreshDms().then(ids => { if (ids.includes(cid)) socket.emit('preload_channels', [cid]); }).catch(() => {});
      }
    };
    const onProfileUpdated = ({ accountId, profile }) => {
      setMembers(prev => {
        const next = [...prev];
        const idx = next.findIndex(m => m.accountId === accountId);
        if (idx > -1) next[idx] = { ...next[idx], ...profile };
        return next;
      });
    };
    socket.on('receive_message', onMsg);
    socket.on('profile_updated', onProfileUpdated);
    return () => {
      socket.off('receive_message', onMsg);
      socket.off('profile_updated', onProfileUpdated);
    };
  }, [socket, refreshDms]);

  // 他タブ/デバイスから open_dm イベント
  useEffect(() => {
    if (!socket) return;
    const onOpenDm = ({ targetAccountId, channelId, fromAccountId }) => {
      setChannelMap(prev => ({ ...prev, [targetAccountId]: channelId }));
      refreshDms().catch(() => {});
      if (fromAccountId === currentUserState?.accountId) {
        setPendingId(channelId);
        navigateTo(`/d/${channelId}`);
      }
    };
    socket.on('open_dm', onOpenDm);
    return () => socket.off('open_dm', onOpenDm);
  }, [socket, currentUserState?.accountId, refreshDms]);

  const openDm = useCallback((member) => {
    if (!currentUserState?.accountId) return;
    if (member.accountId === currentUserState.accountId) return;
    
    isUserClickRef.current = true;

    // チャンネルIDをフロントエンドで事前計算して即座に画面遷移
    const channelId = channelMap[member.accountId] || [currentUserState.accountId, member.accountId].sort().join('__dm__');
    
    // 即座に画面を切り替える（ロード中のくるくるが表示される）
    setPendingId(channelId);
    navigateTo(`/d/${channelId}`);

    // 裏でAPIを叩いてDBへの登録を行う（未登録のときだけ。クリックだけで並び順は変えない）
    if (!channelMap[member.accountId]) {
      api.dmOpen(member.accountId).then(() => {
        setChannelMap(prev => ({ ...prev, [member.accountId]: channelId }));
        if (socket) socket.emit('open_dm', { targetAccountId: member.accountId });
      }).catch(() => {});
    }

  }, [currentUserState, channelMap, socket]);

  // メンバーを「メッセージ履歴のある DM（最新順）→ それ以外（名前順・ID 順）」で安定ソート
  const sortedMembers = [...members].filter(m => m.accountId !== currentUserState?.accountId).sort((a, b) => {
    const aCid = channelMap[a.accountId];
    const bCid = channelMap[b.accountId];
    const aRaw = aCid ? dmOrder.indexOf(aCid) : -1;
    const bRaw = bCid ? dmOrder.indexOf(bCid) : -1;
    const aIdx = aRaw === -1 ? Infinity : aRaw;
    const bIdx = bRaw === -1 ? Infinity : bRaw;
    if (aIdx !== bIdx) return aIdx - bIdx;
    const aName = a.displayName || a.firstName || a.accountId || '';
    const bName = b.displayName || b.firstName || b.accountId || '';
    const cmp = aName.localeCompare(bName, 'ja');
    if (cmp !== 0) return cmp;
    return (a.accountId || '').localeCompare(b.accountId || '');
  });

  // 並び順やメンバー一覧が変わったときも選択インジケーターを正しい位置へ追従させる
  const orderSignature = sortedMembers.map(m => m.accountId).join(',');
  React.useLayoutEffect(() => {
    updateIndicator('layout');
  }, [orderSignature, updateIndicator]);

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
    <aside className="relative w-full h-full min-h-0 bg-[var(--bg-dm)] flex flex-col border-r border-black/[0.14] dark:border-white/[0.14]">
      <div
        ref={scrollContainerRef}
        className={`flex-1 min-h-0 overflow-y-auto p-2 ${(connectedVoiceChannel || connectingVoiceChannel) ? 'md:mb-[132px]' : 'md:mb-[76px]'}`}
      >
        <div ref={listWrapperRef} className="relative min-h-full space-y-1">
          {/* Active DM sliding indicator pill */}
          <div
            style={indicatorStyle}
            className={`channel-active-indicator rounded-lg ${indicatorClass}`}
            aria-hidden="true"
          >
            <div
              key={stretchData?.key}
              className={`channel-indicator-pill ${stretchData ? 'is-stretching' : ''}`}
              style={stretchData ? { '--stretch-scale': stretchData.scale } : undefined}
            />
          </div>

          {sortedMembers.length === 0 && (
            <p className="text-[11px] text-zinc-900/20 px-3 py-2">{t('members.none')}</p>
          )}
          {sortedMembers.map(m => {
            const channelId = channelMap[m.accountId] || (currentUserState?.accountId ? [currentUserState.accountId, m.accountId].sort().join('__dm__') : null);
            const isSelected = !!selectedUserId && selectedUserId === channelId;
            const unread = channelId ? (unreadCounts[channelId] || 0) : 0;
            return (
              <DMUser
                key={m.accountId}
                id={channelId}
                name={m.displayName || m.firstName}
                member={m}
                avatarUrl={m.avatarUrl}
                selected={isSelected}
                onClick={() => openDm(m)}
                unread={unread}
                isOnline={onlineAccountIds?.includes(m.accountId)}
              />
            );
          })}
        </div>
      </div>
    </aside>
  );
}

export default React.memo(DMList);
