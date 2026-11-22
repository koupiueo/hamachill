import {
  Hash,
  SpeakerHigh,
  ShieldCheck,
  MegaphoneSimple,
  ChatCenteredDots,
  PencilSimple
} from '@phosphor-icons/react';
import PhosphorIcon from '../ui/PhosphorIcon';
import { t } from '../../i18n';

export const Channel = ({ id, name, type = 'text', selected = false, onClick, unread = 0, mention = 0, onEdit }) => {
  let IconComponent = Hash;

  if (type === 'voice') IconComponent = SpeakerHigh;
  else if (type === 'rules') IconComponent = ShieldCheck;
  else if (type === 'announcements') IconComponent = MegaphoneSimple;
  else if (type === 'forum' || type === 'threads' || type === 'thread' || name === t('channels.threads')) IconComponent = ChatCenteredDots;

  const showMention = mention > 0;
  const showUnread = unread > 0 && !showMention;

  return (
    <div
      data-channel-id={id}
      onClick={onClick}
      className={`group relative z-10 flex items-center px-2 py-1.5 mx-2 rounded-md cursor-pointer select-none ${
        selected
          ? 'text-zinc-900 font-semibold'
          : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-950/5 font-medium'
      }`}
    >
      <PhosphorIcon
        icon={IconComponent}
        size={18}
        className={`shrink-0 ${selected ? 'text-zinc-900' : 'text-zinc-400 group-hover:text-zinc-600'}`}
      />
      <span className="ml-2 text-[15px] leading-5 truncate flex-1 min-w-0 tracking-tight">
        {name}
      </span>
      {onEdit && (
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="opacity-0 group-hover:opacity-100 p-1 shrink-0 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-950/10 rounded hc-press"
          title={t('channels.edit')}
        >
          <PhosphorIcon icon={PencilSimple} size={14} />
        </button>
      )}
      {showMention && (
        <span key={mention} className="ml-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shrink-0 shadow-sm hc-scale-in">
          {mention > 99 ? '99+' : mention}
        </span>
      )}
      {showUnread && (
        <span key={unread} className="ml-1 min-w-[18px] h-[18px] px-1 bg-white text-zinc-900 border border-zinc-300/40 text-[10px] font-black rounded-full flex items-center justify-center shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.08)] hc-scale-in">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </div>
  );
};
