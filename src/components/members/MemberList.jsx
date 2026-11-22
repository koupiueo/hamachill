import { useState, useEffect } from 'react';
import { Member } from './Member';
import { api } from '../../utils/api';
import { t } from '../../i18n';

export default function MemberList({ socket, onlineAccountIds, currentUserState, onMessage }) {
  const [members, setMembers] = useState([]);

  useEffect(() => {
    api.members().then(res => setMembers(res.members)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleProfileUpdate = ({ accountId, profile }) => {
      setMembers(prev => prev.map(m => m.accountId === accountId ? { ...m, ...profile } : m));
    };
    socket.on('profile_updated', handleProfileUpdate);
    return () => socket.off('profile_updated', handleProfileUpdate);
  }, [socket]);

  const sorted = [...members].sort((a, b) => {
    const aOn = onlineAccountIds.includes(a.accountId);
    const bOn = onlineAccountIds.includes(b.accountId);
    if (aOn && !bOn) return -1;
    if (!aOn && bOn) return 1;
    return 0;
  });

  return (
    <aside className="w-60 h-full bg-[var(--bg-members)] backdrop-blur-[var(--glass-blur)] flex flex-col border-l border-[var(--border-members)]">
      <div className="flex-1 overflow-y-auto py-4 space-y-1">
        <div className="px-4 mb-2 text-[10px] font-black tracking-widest text-zinc-900/40 uppercase">
          {t('members.header', { count: members.length })}
        </div>
        {sorted.map(m => (
          <Member
            key={m.accountId}
            name={m.displayName || m.firstName}
            pronouns={m.pronouns}
            bio={m.bio}
            avatarUrl={m.avatarUrl}
            profileColor1={m.profileColor1}
            profileColor2={m.profileColor2}
            profileColor3={m.profileColor3}
            profileBannerColor={m.profileBannerColor}
            nameStyle={m.nameStyle}
            bannerUrl={m.bannerUrl}
            isOnline={onlineAccountIds.includes(m.accountId)}
            isSelf={m.accountId === currentUserState?.accountId}
            onMessage={onMessage ? () => onMessage(m) : undefined}
          />
        ))}
      </div>
    </aside>
  );
}
