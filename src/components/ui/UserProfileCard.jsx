import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Pencil, ChevronRight, Check } from 'lucide-react';
import { getNameStyle } from '../../utils/nameStyle';
import { t } from '../../i18n';

export default function UserProfileCard({ user, position, onClose, onMessage, onEditProfile, socket, showAccountMenu = false }) {
  const popupRef = useRef(null);
  const statusCloseTimer = useRef(null);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const openStatusMenu = () => {
    if (statusCloseTimer.current) {
      clearTimeout(statusCloseTimer.current);
      statusCloseTimer.current = null;
    }
    setShowStatusMenu(true);
  };

  const closeStatusMenuDelayed = () => {
    if (statusCloseTimer.current) clearTimeout(statusCloseTimer.current);
    statusCloseTimer.current = setTimeout(() => setShowStatusMenu(false), 140);
  };

  useEffect(() => {
    const handleClick = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) onClose();
    };
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      if (statusCloseTimer.current) clearTimeout(statusCloseTimer.current);
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const setPresence = (status) => {
    if (socket) socket.emit('set_presence', { status });
    setShowStatusMenu(false);
  };

  const hash = (user.name || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = hash % 360;
  const bannerGradient = user.profileColor1 && user.profileColor2
    ? `linear-gradient(135deg, ${user.profileColor1}, ${user.profileColor2}${user.profileColor3 ? `, ${user.profileColor3}` : ''})`
    : `linear-gradient(135deg, hsl(${hue}, 70%, 40%), hsl(${(hue + 40) % 360}, 60%, 30%))`;

  return (
    <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: 'auto' }}>
      <div
        ref={popupRef}
        className="absolute"
        style={{ ...(position || {}) }}
      >
        <div 
          className="w-[316px] rounded-2xl overflow-visible shadow-2xl border border-black/10 dark:border-white/10 popup-bg animate-in fade-in zoom-in-95 duration-150 relative"
        >
          <div className="rounded-2xl popup-bg">
          <div
            className="h-[100px] rounded-t-2xl relative transition-all duration-700 overflow-hidden"
            style={user.bannerUrl
              ? { backgroundImage: `url(${user.bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : { background: user.profileBannerColor || bannerGradient }
            }
          />

          {/* アイコン: バナーとコンテンツの境界に absolute で重ね、背景色とシームレスに繋げる */}
          <div className="relative">
            <div className="absolute -top-[42px] left-4 z-10">
              <div className="w-[84px] h-[84px] rounded-full popup-bg p-[5px] relative">
                <div className="w-full h-full rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[28px] font-black text-zinc-900 dark:text-zinc-100 overflow-hidden">
                  {user.avatarUrl
                    ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                    : (user.name?.[0] || '?').toUpperCase()
                  }
                </div>
                <div className="absolute bottom-0.5 right-0.5 w-6 h-6 rounded-full popup-bg p-[3.5px] flex items-center justify-center">
                  <div className={`w-full h-full rounded-full flex items-center justify-center ${user.isOnline ? 'bg-emerald-500' : 'bg-[#80848e]'}`}>
                    {!user.isOnline && <div className="w-2 h-2 rounded-full popup-bg" />}
                  </div>
                </div>
              </div>
            </div>

          <div className="pt-[46px] px-4 pb-4 popup-bg rounded-b-2xl">

            <div className="mb-3">
              <h2 className="text-[20px] font-black tracking-tight leading-tight text-[var(--theme-text)]" style={getNameStyle(user)}>{user.name}</h2>
              {(user.username || user.pronouns) && (
                <div className="flex flex-col gap-0.5 mt-1">
                  {user.username && <span className="text-[13px] font-medium text-[var(--theme-text-muted)] break-all">@{user.username}</span>}
                  {user.pronouns && <span className="text-[12.5px] font-medium text-[var(--theme-text-subtle)] break-all">{user.pronouns}</span>}
                </div>
              )}
            </div>

            {user.statusMessage && (
              <div className="mb-3">
                <div className="text-[11px] font-black text-[var(--theme-text-subtle)] uppercase tracking-widest mb-1">{t('profile.status')}</div>
                <div className="text-[13px] text-[var(--theme-text-muted)]">{user.statusMessage}</div>
              </div>
            )}

            {user.bio && (
              <div className="mb-3">
                <div className="text-[11px] font-black text-[var(--theme-text-subtle)] uppercase tracking-widest mb-1">{t('settings.tabs.profile')}</div>
                <div className="text-[13px] text-[var(--theme-text-muted)] leading-relaxed whitespace-pre-wrap">{user.bio}</div>
              </div>
            )}

            {showAccountMenu ? (
              <div className="mt-4 flex flex-col gap-2">
                <div className="rounded-xl bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] p-1.5 flex flex-col gap-1 overflow-visible">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEditProfile?.();
                    }}
                    className="w-full px-3 py-2.5 flex items-center gap-3 text-[13px] font-semibold text-[var(--theme-text)] hover:bg-black/[0.05] dark:hover:bg-white/[0.06] rounded-lg transition-colors text-left"
                  >
                    <Pencil size={15} className="text-[var(--theme-text-muted)] shrink-0" />
                    <span>{t('profile.edit')}</span>
                  </button>

                  <div className="h-px bg-black/[0.06] dark:bg-white/[0.08] mx-2 my-0.5" />

                  <div
                    className="relative"
                    onMouseEnter={openStatusMenu}
                    onMouseLeave={closeStatusMenuDelayed}
                  >
                    <button
                      type="button"
                      onClick={() => setShowStatusMenu(v => !v)}
                      className={`w-full px-3 py-2.5 flex items-center justify-between text-[13px] font-semibold text-[var(--theme-text)] rounded-lg transition-colors text-left ${
                        showStatusMenu ? 'bg-black/[0.06] dark:bg-white/[0.08]' : 'hover:bg-black/[0.05] dark:hover:bg-white/[0.06]'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <span className={`w-3 h-3 rounded-full shrink-0 flex items-center justify-center ${user.isOnline ? 'bg-emerald-500' : 'bg-[#80848e]'}`}>
                          {!user.isOnline && <span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-[#222327]" />}
                        </span>
                        <span>{user.isOnline ? t('presence.online') : t('presence.invisible')}</span>
                      </span>
                      <ChevronRight size={15} className="text-[var(--theme-text-subtle)]" />
                    </button>

                    {showStatusMenu && (
                      <div
                        onMouseEnter={openStatusMenu}
                        onMouseLeave={closeStatusMenuDelayed}
                        className="absolute left-[calc(100%+8px)] bottom-0 w-[236px] rounded-xl popup-bg border border-black/10 dark:border-white/10 shadow-2xl p-1.5 z-[10000] animate-in fade-in zoom-in-95 duration-120"
                      >
                        <button
                          type="button"
                          onClick={() => setPresence('online')}
                          className="w-full px-2.5 py-2 rounded-lg flex items-center justify-between text-[13px] font-semibold text-[var(--theme-text)] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors text-left"
                        >
                          <span className="flex items-center gap-2.5">
                            <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
                            <span>{t('presence.online')}</span>
                          </span>
                          {user.isOnline && <Check size={14} className="text-emerald-500 shrink-0" />}
                        </button>

                        <div className="h-px bg-black/[0.06] dark:bg-white/[0.08] my-1 mx-1.5" />

                        <button
                          type="button"
                          onClick={() => setPresence('invisible')}
                          className="w-full px-2.5 py-2 rounded-lg flex items-center justify-between text-[13px] font-semibold text-[var(--theme-text)] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors text-left"
                        >
                          <span className="flex items-start gap-2.5">
                            <span className="w-3 h-3 rounded-full border-2 border-[#80848e] shrink-0 mt-1" />
                            <span className="flex flex-col">
                              <span>{t('presence.invisible')}</span>
                              <span className="text-[11px] font-normal text-[var(--theme-text-subtle)] leading-tight mt-0.5">
                                {t('presence.invisibleHint')}
                              </span>
                            </span>
                          </span>
                          {!user.isOnline && <Check size={14} className="text-zinc-400 shrink-0 ml-2" />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : !user.isSelf ? (
              <div className="flex gap-2 pt-2 border-t border-black/10 dark:border-white/10">
                <button
                  onClick={() => { onMessage?.(user); onClose(); }}
                  className="flex-1 flex items-center justify-center gap-2 bg-black/[0.05] hover:bg-black/[0.09] dark:bg-white/[0.06] dark:hover:bg-white/[0.1] border border-black/[0.06] dark:border-white/[0.08] rounded-xl py-2 text-[12px] font-bold text-[var(--theme-text)] transition-all"
                >
                  <MessageCircle size={14} /> {t('profile.message')}
                </button>
              </div>
            ) : null}
          </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
