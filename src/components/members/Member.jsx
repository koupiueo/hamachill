import { useRef } from 'react';
import { getNameStyle } from '../../utils/nameStyle';
import { t } from '../../i18n';

export const Member = ({ name, avatarUrl, pronouns, bio, profileColor1, profileColor2, profileColor3, profileBannerColor, nameStyle, bannerUrl, isOnline, isSelf, onMessage }) => {
  const memberRef = useRef(null);

  const handleClick = (e) => {
    if (memberRef.current) {
      const rect = memberRef.current.getBoundingClientRect();
      window.dispatchEvent(new CustomEvent('open-right-profile', {
        detail: {
          user: { name, pronouns, bio, profileColor1, profileColor2, profileColor3, profileBannerColor, nameStyle, avatarUrl, bannerUrl, isSelf, isOnline, accountId: name },
          rect
        }
      }));
    }
  };

  return (
    <div
      ref={memberRef}
      onClick={handleClick}
      className="flex items-center px-3 py-2 rounded-lg cursor-pointer group hover:bg-zinc-950/5 select-none mx-1"
    >
      <div className="relative shrink-0">
        <div className="w-8 h-8 rounded-full bg-zinc-950/10 overflow-hidden border border-zinc-950/5">
          {avatarUrl
            ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center font-black text-zinc-900/30 text-[10px]">
                {name?.[0]?.toUpperCase()}
              </div>
          }
        </div>
        <div className={`absolute -bottom-[2px] -right-[2px] w-3 h-3 rounded-full border-[2px] border-[var(--bg-members)] ${isOnline ? 'bg-green-500' : 'bg-[#80848e]'}`} />
      </div>
      <div className="ml-3 overflow-hidden">
        <span 
          className="text-[13px] font-bold tracking-tight truncate transition-colors block group-hover:opacity-80"
          style={{...getNameStyle({ nameStyle, profileColor1, profileColor2, profileColor3 }), opacity: 0.8}}
        >
          {name}{isSelf ? t('members.youSuffix') : ''}
        </span>
      </div>
    </div>
  );
};
