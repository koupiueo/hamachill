import { Mic, MicOff, Phone, Headphones, HeadphoneOff, Music, ChevronDown, Search, Play, Star, MonitorUp, AlertTriangle, Volume2, VolumeX, Square } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import RightSidebarProfile from '../ui/RightSidebarProfile';
import { getNameStyle } from '../../utils/nameStyle';
import { api } from '../../utils/api';
import { soundboardManager, useSoundboard } from '../../utils/soundboardManager';
import { t } from '../../i18n';

export default function VoiceRoom({ participants, onLeave, currentSocketId, currentUserState, setCurrentUserState, socket, roomId, screenStreams = {}, localScreenStream, onStartScreenShare, onStopScreenShare }) {
  const [volumes, setVolumes] = useState({});
  const [profileUser, setProfileUser] = useState(null);

  const { isMuted: isSoundboardMuted, isPlaying: isSoundboardPlaying, toggleMute: toggleSoundboardMute, stopAll: stopSoundboardAll } = useSoundboard();

  // Soundboard state
  const [soundboards, setSoundboards] = useState([]);
  const [showSoundboard, setShowSoundboard] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [playingSounds, setPlayingSounds] = useState({});
  const [favorites, setFavorites] = useState(() => {
    try {
      const stored = localStorage.getItem('hc_soundboard_favorites');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const soundboardRef = useRef(null);

  // Screen Share State
  const [showScreenShareWarning, setShowScreenShareWarning] = useState(false);
  const [focusedUserId, setFocusedUserId] = useState(null);

  const currentUserStateRef = useRef(currentUserState);
  useEffect(() => {
    currentUserStateRef.current = currentUserState;
  }, [currentUserState]);

  useEffect(() => {
    if (socket) {
      const handlePlay = ({ filename, sender }) => {
        const displayName = filename.split('/').pop().replace(/\.[^/.]+$/, "");
        setPlayingSounds(prev => {
          const next = { ...prev };
          if (next[sender]?.timeoutId) clearTimeout(next[sender].timeoutId);
          next[sender] = {
            name: displayName,
            timeoutId: setTimeout(() => {
              setPlayingSounds(p => {
                const p2 = { ...p };
                delete p2[sender];
                return p2;
              });
            }, 3000)
          };
          return next;
        });
      };

      const onStopEvent = () => setPlayingSounds({});
      window.addEventListener('soundboard_stopped', onStopEvent);

      socket.on('play_soundboard', handlePlay);
      return () => {
        window.removeEventListener('soundboard_stopped', onStopEvent);
        socket.off('play_soundboard', handlePlay);
      };
    }
  }, [socket]);

  useEffect(() => {
    const fetchSoundboards = async () => {
      try {
        const files = await api.get(`/soundboards?t=${Date.now()}`);
        setSoundboards(files);
      } catch (err) {
        console.error("Failed to fetch soundboards:", err);
      }
    };

    if (showSoundboard) {
      fetchSoundboards();
    }

    if (socket) {
      const handleUpdate = () => {
        if (showSoundboard) fetchSoundboards();
      };
      socket.on('soundboard_updated', handleUpdate);
      return () => socket.off('soundboard_updated', handleUpdate);
    }
  }, [showSoundboard, socket]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (soundboardRef.current && !soundboardRef.current.contains(e.target)) {
        setShowSoundboard(false);
      }
    };
    if (showSoundboard) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSoundboard]);

  const handlePlaySoundboard = (filename) => {
    if (socket && roomId) {
      socket.emit('play_soundboard', { roomId, filename });
    }
  };

  const handlePreviewSoundboard = (e, filename) => {
    e.stopPropagation();
    soundboardManager.play(filename);
  };

  const toggleFavorite = (e, filename) => {
    e.stopPropagation();
    setFavorites(prev => {
      const next = prev.includes(filename) ? prev.filter(f => f !== filename) : [...prev, filename];
      localStorage.setItem('hc_soundboard_favorites', JSON.stringify(next));
      return next;
    });
  };

  // 一意なID（peerId または socketId）をキーにする
  const getUniqueId = (user) => user.socketId || user.peerId || `user-${Math.random()}`;

  useEffect(() => {
    if (focusedUserId) {
      const user = participants.find(p => getUniqueId(p) === focusedUserId);
      const isMe = user?.isMe === true || (currentSocketId && user?.socketId === currentSocketId);
      const stream = isMe ? localScreenStream : screenStreams?.[user?.peerId];
      if (!user || !stream) {
        setFocusedUserId(null); // Valid state sync for when stream stops externally
      }
    }
  }, [participants, focusedUserId, localScreenStream, screenStreams, currentSocketId]);

  const handleScreenShareClick = () => {
    if (localScreenStream) {
      localScreenStream.getTracks().forEach(t => t.stop());
      if (onStopScreenShare) onStopScreenShare();
    } else {
      setShowScreenShareWarning(true);
    }
  };

  const startScreenShare = async () => {
    setShowScreenShareWarning(false);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { max: 30 },
          width: { max: 1280 },
          height: { max: 720 }
        },
        audio: false
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) return;
      try { videoTrack.contentHint = 'detail'; } catch { /* ignore */ }

      videoTrack.onended = () => {
        if (onStopScreenShare) onStopScreenShare();
      };

      if (onStartScreenShare) onStartScreenShare(stream);
    } catch (err) {
      if (err?.name !== 'AbortError' && err?.name !== 'NotAllowedError') {
        console.error("Screen share error:", err);
        alert(t('vc.screenShareFailed'));
      }
    }
  };

  const favoriteItems = [];
  const categorizedItems = [];

  soundboards.forEach(category => {
    const filteredFiles = category.files.filter(sb =>
      sb.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const favs = filteredFiles.filter(sb => favorites.includes(sb));
    const others = filteredFiles.filter(sb => !favorites.includes(sb));

    favs.forEach(sb => {
      // Avoid duplicates in favorites if multiple categories have same file (unlikely)
      if (!favoriteItems.includes(sb)) favoriteItems.push(sb);
    });

    if (others.length > 0) {
      categorizedItems.push({ owner: category.owner, files: others });
    }
  });

  const handleVolumeChange = (socketId, peerId, val) => {
    setVolumes(prev => ({ ...prev, [socketId]: val }));

    // 実際のオーディオ要素の音量を変更 (自分以外)
    const audio = document.getElementById(`audio-${peerId}`);
    if (audio) {
      audio.volume = val / 100;
    }
  };

  const openProfile = (user, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setProfileUser(user.userState);
  };


  const getGridClass = (count) => {
    if (count === 1) return 'grid-cols-1 grid-rows-1';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2 grid-rows-2 md:grid-rows-1';
    if (count <= 4) return 'grid-cols-2 grid-rows-2';
    if (count <= 6) return 'grid-cols-2 md:grid-cols-3 grid-rows-3 md:grid-rows-2';
    return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 auto-rows-fr';
  };

  const renderTile = (user, isFocused) => {
    const uid = getUniqueId(user);
    const isMe = user.isMe === true || (currentSocketId && user.socketId === currentSocketId);
    const volume = volumes[uid] ?? 80;
    const stream = isMe ? localScreenStream : screenStreams?.[user.peerId];
    const isSpeaking = Boolean(user.isSpeaking || user.userState?.isSpeaking);

    return (
      <div
        key={uid}
        onClick={() => {
          if (stream) setFocusedUserId(prev => prev === uid ? null : uid);
        }}
        className={`relative flex flex-col items-center justify-center rounded-2xl border border-zinc-950/10 shadow-xl overflow-hidden group transition-all hc-scale-in ${stream ? 'bg-black cursor-pointer' : 'bg-white hover:border-zinc-950/20'
          } ${isFocused ? 'w-full h-full' : (focusedUserId ? 'w-32 h-32 md:w-full md:h-48 shrink-0' : 'w-full h-full')}`}
      >
        {stream ? (
          <div className="absolute inset-0 w-full h-full bg-black flex items-center justify-center">
            <video
              autoPlay
              playsInline
              muted
              onLoadedMetadata={(e) => e.currentTarget.play().catch(() => {})}
              ref={el => {
                if (el && el.srcObject !== stream) {
                  el.srcObject = stream;
                  el.play().catch(() => {});
                }
              }}
              className="w-full h-full object-contain"
            />
            {isMe && (
              <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded backdrop-blur-md text-white text-xs font-bold z-10 pointer-events-none">
                {t('vc.yourScreen')}
              </div>
            )}
          </div>
        ) : (
          <div
            className={`${isFocused ? 'w-32 h-32 md:w-48 md:h-48' : (focusedUserId ? 'w-16 h-16' : 'w-20 h-20 md:w-32 md:h-32')} rounded-full mb-4 border-[3px] border-zinc-100 shadow-sm overflow-hidden cursor-pointer hover:scale-105 transition-all relative z-10 ${
              isSpeaking ? 'ring-[3px] ring-emerald-500 duration-120 hc-speaking' : 'ring-0 ring-transparent duration-300'
            }`}
            onClick={(e) => openProfile(user, e)}
          >
            {user.userState?.avatarUrl ? (
              <img src={user.userState.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-zinc-100 flex items-center justify-center text-3xl font-black text-zinc-400">
                {user.userState?.name?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>
        )}

        {/* Playing Soundboard Badge */}
        {playingSounds[user.socketId] && (
          <div className="absolute top-2 right-2 bg-zinc-800/90 backdrop-blur-md text-white px-3 py-2 rounded-full text-[10px] sm:text-xs font-bold shadow-lg shadow-zinc-900/30 flex items-center gap-2 animate-in slide-in-from-top-4 fade-in duration-300 z-20 max-w-[80%] pointer-events-none">
            <Music size={12} className="shrink-0 animate-pulse" />
            <span className="truncate">{playingSounds[user.socketId].name}</span>
          </div>
        )}

        {/* Name & Status */}
        <div
          className={`flex items-center gap-2 bg-zinc-100/80 px-3 py-1 md:px-4 md:py-2 rounded-full backdrop-blur-md border border-zinc-950/5 cursor-pointer hover:bg-zinc-200/80 transition-colors z-10 ${stream ? 'absolute bottom-3 left-3' : ''
            }`}
          onClick={(e) => {
            if (!stream) openProfile(user, e);
          }}
        >
          <span
            className={`text-zinc-900 font-bold truncate ${focusedUserId && !isFocused ? 'text-xs max-w-[80px]' : 'text-sm max-w-[120px] md:max-w-[200px]'}`}
            style={user.userState ? getNameStyle(user.userState) : undefined}
          >
            {user.userState?.name} {isMe ? t('members.you') : ''}
          </span>
          {user.userState?.isMuted && <MicOff size={14} className="text-red-500 shrink-0" />}
        </div>

        {/* Volume Control (Hover) */}
        {!isMe && (
          <div className={`absolute left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 ${stream ? 'bottom-14' : 'bottom-4'}`}>
            <div className="bg-white/90 px-4 py-2 rounded-full backdrop-blur-xl border border-zinc-950/10 flex items-center gap-3 w-3/4 max-w-[200px] shadow-lg" onClick={e => e.stopPropagation()}>
              <Mic size={14} className="text-zinc-500 shrink-0" />
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => handleVolumeChange(uid, user.peerId, parseInt(e.target.value))}
                className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer bg-zinc-200 accent-zinc-700 hover:accent-zinc-600"
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  const focusedUser = participants.find(p => getUniqueId(p) === focusedUserId);
  const otherUsers = participants.filter(p => getUniqueId(p) !== focusedUserId);

  return (
    <>
      <main className="flex-1 h-full bg-zinc-50 flex flex-col min-w-0 relative">
        <div className="absolute top-4 left-4 z-10 flex items-center gap-3">
          <span className="text-[12px] font-black tracking-[0.1em] text-zinc-900/40">{t('channels.voiceChat')}</span>
          <span className="bg-zinc-900/10 px-2 py-1 rounded-full text-[11px] font-bold text-zinc-900/60">{participants.length}</span>
        </div>

        <div className="flex-1 p-4 md:p-6 pb-32 md:pb-32 overflow-hidden flex flex-col md:flex-row gap-4 items-center justify-center">
          {focusedUserId && focusedUser ? (
            <>
              <div className="flex-1 w-full h-full min-h-0 min-w-0 flex items-center justify-center">
                {renderTile(focusedUser, true)}
              </div>
              <div className="w-full md:w-64 h-32 md:h-full shrink-0 flex md:flex-col gap-3 overflow-x-auto md:overflow-y-auto no-scrollbar px-1 py-1 snap-x md:snap-y items-center md:items-stretch">
                {otherUsers.map(u => renderTile(u, false))}
              </div>
            </>
          ) : (
            <div className={`w-full h-full max-h-[800px] max-w-[1200px] grid gap-4 ${getGridClass(participants.length)}`}>
              {participants.map(u => renderTile(u, false))}
            </div>
          )}
        </div>

        {/* Floating VC Controls */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 md:gap-4 animate-in slide-in-from-bottom-4">
          <div className="flex items-center bg-white/90 backdrop-blur-xl rounded-full p-2 shadow-2xl border border-zinc-950/10">
            <div
              onClick={handleScreenShareClick}
              className={`flex items-center justify-center w-12 h-12 rounded-full cursor-pointer transition-colors hc-press ${localScreenStream ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'}`}
              title={localScreenStream ? t('vc.stopScreenShare') : t('vc.screenShare')}
            >
              <MonitorUp size={22} />
            </div>
            <div className="w-[1px] h-6 bg-zinc-950/10 mx-1"></div>
            <div
              onClick={() => setCurrentUserState && setCurrentUserState(prev => ({ ...prev, isMuted: !prev.isMuted }))}
              className={`flex items-center justify-center w-12 h-12 rounded-full cursor-pointer transition-colors hc-press ${currentUserState?.isMuted ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'}`}
              title={t('vc.mic')}
            >
              <span key={currentUserState?.isMuted ? 'muted' : 'unmuted'} className="inline-flex hc-scale-in">
                {currentUserState?.isMuted ? <MicOff size={22} /> : <Mic size={22} />}
              </span>
            </div>
            <div className="w-[1px] h-6 bg-zinc-950/10 mx-1"></div>
            <div
              onClick={() => setCurrentUserState && setCurrentUserState(prev => ({ ...prev, isDeafened: !prev.isDeafened }))}
              className={`flex items-center justify-center w-12 h-12 rounded-full cursor-pointer transition-colors hc-press ${currentUserState?.isDeafened ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'}`}
              title={t('vc.speaker')}
            >
              <span key={currentUserState?.isDeafened ? 'deaf' : 'undeaf'} className="inline-flex hc-scale-in">
                {currentUserState?.isDeafened ? <HeadphoneOff size={22} /> : <Headphones size={22} />}
              </span>
            </div>
            <div className="w-[1px] h-6 bg-zinc-950/10 mx-1"></div>
            <div className="relative" ref={soundboardRef}>
              <div
                onClick={() => setShowSoundboard(!showSoundboard)}
                className={`flex items-center justify-center w-12 h-12 rounded-full cursor-pointer transition-colors hc-press ${showSoundboard ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'}`}
                title={t('settings.tabs.soundboard')}
              >
                <Music size={22} />
              </div>

              {showSoundboard && (
                <div className="absolute bottom-[calc(100%+16px)] left-1/2 -translate-x-1/2 w-64 md:w-72 bg-white/95 backdrop-blur-xl border border-zinc-950/10 rounded-2xl shadow-2xl p-3 animate-in slide-in-from-bottom-2 fade-in duration-200">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="text-sm font-bold text-zinc-800">{t('settings.tabs.soundboard')}</div>
                    <div className="flex items-center gap-1">
                      {isSoundboardPlaying && (
                        <button
                          onClick={() => {
                            stopSoundboardAll();
                            setPlayingSounds({});
                          }}
                          className="flex items-center gap-1 px-2 py-1 bg-red-500 hover:bg-red-600 active:scale-95 text-white rounded-md text-[11px] font-bold shadow-sm transition-all"
                          title={t('vc.stopPlayingSound')}
                        >
                          <Square size={10} fill="currentColor" />
                          <span>{t('common.stop')}</span>
                        </button>
                      )}
                      <button
                        onClick={() => {
                          toggleSoundboardMute();
                          setPlayingSounds({});
                        }}
                        className={`p-1 rounded-lg text-xs font-bold transition-all active:scale-95 ${
                          isSoundboardMuted
                            ? 'bg-red-50 text-red-500 hover:bg-red-100'
                            : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                        }`}
                        title={isSoundboardMuted ? t('userBar.unmuteSoundboard') : t('userBar.muteSoundboard')}
                      >
                        {isSoundboardMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* Search Bar */}
                  <div className="relative mb-3">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      placeholder={t('common.searchEllipsis')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-zinc-100/80 border border-zinc-950/5 rounded-xl pl-8 pr-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/30 transition-all"
                    />
                  </div>

                  <div className="max-h-[300px] overflow-y-auto pr-1 custom-scrollbar flex flex-col gap-1">
                    {soundboards.length === 0 ? (
                      <div className="text-xs text-zinc-400 py-4 text-center">
                        {t('vc.noFiles')}<br /><span className="text-[10px]">{t('vc.addToFolder')}</span>
                      </div>
                    ) : favoriteItems.length === 0 && categorizedItems.length === 0 ? (
                      <div className="text-xs text-zinc-400 py-4 text-center">
                        {t('common.notFound')}
                      </div>
                    ) : (
                      <>
                        {favoriteItems.length > 0 && (
                          <div className="mb-2">
                            <div className="text-[10px] font-bold text-zinc-400 mb-1 px-1">{t('vc.favorites')}</div>
                            {favoriteItems.map(sb => {
                              const displayName = sb.split('/').pop().replace(/\.[^/.]+$/, "");
                              return (
                                <div key={`fav-${sb}`} className="flex items-center gap-1 w-full p-1 rounded-xl hover:bg-zinc-100 transition-colors group">
                                  <button
                                    onClick={() => handlePlaySoundboard(sb)}
                                    className="flex-1 text-left px-2 py-2 text-sm font-semibold text-zinc-700 truncate"
                                  >
                                    {displayName}
                                  </button>
                                  <button onClick={(e) => handlePreviewSoundboard(e, sb)} className="p-1 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 rounded-lg transition-colors" title={t('soundboard.preview')}>
                                    <Play size={14} />
                                  </button>
                                  <button onClick={(e) => toggleFavorite(e, sb)} className="p-1 text-amber-400 hover:bg-amber-50 rounded-lg transition-colors" title={t('vc.unfavorite')}>
                                    <Star size={14} fill="currentColor" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {categorizedItems.map(cat => (
                          <div key={`cat-${cat.owner}`} className="mb-2 last:mb-0">
                            <div className="text-[10px] font-bold text-zinc-400 mb-1 px-1">{cat.owner}</div>
                            {cat.files.map(sb => {
                              const displayName = sb.split('/').pop().replace(/\.[^/.]+$/, "");
                              return (
                                <div key={`all-${sb}`} className="flex items-center gap-1 w-full p-1 rounded-xl hover:bg-zinc-100 transition-colors group">
                                  <button
                                    onClick={() => handlePlaySoundboard(sb)}
                                    className="flex-1 text-left px-2 py-2 text-sm font-medium text-zinc-600 truncate"
                                  >
                                    {displayName}
                                  </button>
                                  <button onClick={(e) => handlePreviewSoundboard(e, sb)} className="p-1 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 rounded-lg transition-all" title={t('soundboard.preview')}>
                                    <Play size={14} />
                                  </button>
                                  <button onClick={(e) => toggleFavorite(e, sb)} className="p-1 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-amber-400 hover:bg-amber-50 rounded-lg transition-all" title={t('vc.favorite')}>
                                    <Star size={14} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="w-[1px] h-6 bg-zinc-950/10 mx-1"></div>
            {/* Soundboard Mute Button */}
            <div
              onClick={() => {
                toggleSoundboardMute();
                setPlayingSounds({});
              }}
              className={`flex items-center justify-center w-12 h-12 rounded-full cursor-pointer transition-colors ${
                isSoundboardMuted
                  ? 'bg-red-50 text-red-500 hover:bg-red-100'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
              }`}
              title={isSoundboardMuted ? t('userBar.unmuteSoundboard') : t('userBar.muteSoundboard')}
            >
              {isSoundboardMuted ? <VolumeX size={22} /> : <Volume2 size={22} />}
            </div>

            {/* When any soundboard audio is actively playing: instant Stop button */}
            {isSoundboardPlaying && (
              <button
                onClick={() => {
                  stopSoundboardAll();
                  setPlayingSounds({});
                }}
                className="flex items-center gap-2 px-3 py-2 bg-red-500 hover:bg-red-600 active:scale-95 text-white rounded-full text-xs font-bold shadow-lg shadow-red-500/25 transition-all animate-in zoom-in duration-150 shrink-0 ml-1"
                title={t('vc.stopNow')}
              >
                <Square size={12} fill="currentColor" />
                <span>{t('vc.stopSound')}</span>
              </button>
            )}
          </div>

          <button
            onClick={onLeave}
            className="bg-red-500 hover:bg-red-600 rounded-full w-14 h-14 shadow-2xl transition-all active:scale-95 text-white flex items-center justify-center border border-red-500/20 shrink-0"
            title={t('vc.disconnect')}
          >
            <Phone size={24} style={{ transform: 'rotate(135deg)' }} />
          </button>
        </div>

      </main>

      {profileUser && (
        <RightSidebarProfile
          user={profileUser}
          onClose={() => setProfileUser(null)}
          isFixed={false}
        />
      )}

      {/* Screen Share Warning Modal */}
      {showScreenShareWarning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-amber-500 p-6 flex flex-col items-center justify-center text-white">
              <AlertTriangle size={48} className="mb-3" />
              <h2 className="text-xl font-black tracking-tight">{t('vc.screenShareWarning')}</h2>
            </div>
            <div className="p-6 text-zinc-700 font-medium leading-relaxed space-y-4 text-center">
              <p className="font-bold text-base">
                {t('vc.screenShareWarning1')}
              </p>
              <p className="font-bold text-zinc-500">
                {t('vc.screenShareWarning2')}
              </p>
            </div>
            <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex gap-3 justify-end">
              <button
                onClick={() => setShowScreenShareWarning(false)}
                className="px-4 py-2 rounded-xl font-bold text-zinc-500 hover:bg-zinc-200 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={startScreenShare}
                className="px-4 py-2 rounded-xl font-bold text-white bg-zinc-800 hover:bg-zinc-900 transition-colors shadow-lg shadow-zinc-900/30"
              >
                {t('vc.acceptAndShare')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
