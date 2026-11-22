import { X } from 'lucide-react';
import { getNameStyle } from '../../utils/nameStyle';
import { t } from '../../i18n';

export default function RightSidebarProfile({ user, onClose, isFixed = false, isClosing = false, isOnline, isPopup = false }) {
  if (!user) return null;

  const nameStr = String(user.displayName || user.firstName || user.name || 'User');
  const hash = nameStr.split('').reduce((a, c) => a + c.charCodeAt(0), 0) || 0;
  const hue = hash % 360;
  const bannerGradient = user.profileColor1 && user.profileColor2
    ? `linear-gradient(135deg, ${user.profileColor1}, ${user.profileColor2}${user.profileColor3 ? `, ${user.profileColor3}` : ''})`
    : `linear-gradient(135deg, hsl(${hue}, 70%, 40%), hsl(${(hue + 40) % 360}, 60%, 30%))`;

  const displayName = user.displayName || user.firstName || user.name;

  return (
    <div className={isPopup 
      ? "w-full h-full popup-bg flex flex-col shrink-0" 
      : `hidden md:flex relative right-0 z-50 w-[85vw] md:w-80 h-full popup-bg flex-col shrink-0 border-l border-zinc-950/5 ${isClosing ? 'sidebar-slide-out' : 'sidebar-slide-in'}`}>
      <div 
        className="h-[100px] relative shrink-0"
        style={user.bannerUrl
          ? { backgroundImage: `url(${user.bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { background: user.profileBannerColor || bannerGradient }
        }
      >
        {!isFixed && onClose && (
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <div className="relative flex-1 popup-bg flex flex-col min-h-0">
        <div className="absolute -top-[40px] left-5 z-20 flex items-center">
          <div className="w-[84px] h-[84px] rounded-full popup-bg p-2 shadow-sm relative">
            <div className="w-full h-full rounded-full bg-zinc-100 flex items-center justify-center text-[30px] font-black text-zinc-400 border border-zinc-950/10 overflow-hidden">
              {user.avatarUrl
                ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                : displayName?.[0]?.toUpperCase()
              }
            </div>
            <div className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-[3px] border-[var(--theme-primary)] ${isOnline ? 'bg-green-500' : 'bg-[#80848e]'}`} />
          </div>
          
          {user.statusMessage && (
            <div className="ml-2 relative">
              <div className="absolute left-[-6px] top-[14px] w-3 h-3 bg-[#4b5563] rotate-45" />
              <div className="bg-[#4b5563] text-white py-2 px-4 rounded-2xl rounded-tl-sm shadow-md relative z-10 whitespace-nowrap">
                <div className="text-[10px] text-zinc-300 font-medium mb-1">{t('profile.status')}</div>
                <div className="text-[13px] font-medium">{user.statusMessage}</div>
              </div>
            </div>
          )}
        </div>

        <div className="pt-[52px] px-6 pb-6 overflow-y-auto flex-1">
          <div className="mb-6">
            <h2 className="text-[20px] font-bold tracking-tight leading-tight break-all" style={getNameStyle(user)}>{displayName}</h2>
            {(user.username || user.pronouns) && (
              <div className="flex flex-col gap-1 mt-1">
                {user.username && <span className="text-[14px] font-medium text-zinc-900/50 break-all">@{user.username}</span>}
                {user.pronouns && <span className="text-[13px] font-medium text-zinc-900/40 break-all">{user.pronouns}</span>}
              </div>
            )}
          </div>

          <div className="w-full h-px bg-zinc-950/5 mb-6" />

          {user.bio && (
            <div className="mb-6">
              <div className="text-[11px] font-bold text-zinc-900/40 uppercase tracking-widest mb-2">{t('profile.aboutMe')}</div>
              <div className="text-[14px] text-zinc-900/80 leading-relaxed whitespace-pre-wrap bg-zinc-50/50 p-4 rounded-xl border border-zinc-900/5">
                {user.bio}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
