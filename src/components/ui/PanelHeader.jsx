import {
  List,
  CaretLeft,
  Hash,
  SpeakerHigh,
  ShieldCheck,
  MegaphoneSimple,
  ChatCenteredDots
} from '@phosphor-icons/react';
import PhosphorIcon from './PhosphorIcon';
import { t } from '../../i18n';

export default function PanelHeader({ title, type, className = "", borderVar = "--border-chat", onBack, children }) {
  let HeaderIcon = Hash;
  if (type === 'voice') HeaderIcon = SpeakerHigh;
  else if (type === 'rules') HeaderIcon = ShieldCheck;
  else if (type === 'announcements') HeaderIcon = MegaphoneSimple;
  else if (type === 'forum' || type === 'threads' || type === 'thread' || title === t('channels.threads')) HeaderIcon = ChatCenteredDots;

  return (
    <div
      className={`h-12 flex items-center justify-between px-4 border-b border-black/[0.14] dark:border-white/[0.14] text-zinc-900 dark:text-zinc-100 text-[15px] font-bold select-none shrink-0 z-10 ${className}`}
    >
      <div className="flex items-center min-w-0 flex-1 gap-2">
        <button 
          onClick={() => window.dispatchEvent(new CustomEvent('toggle-mobile-menu'))}
          className="md:hidden p-1 -ml-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 active:scale-95 transition-colors rounded-md hc-press"
          title={t('common.menu')}
        >
          <PhosphorIcon icon={List} size={20} />
        </button>
        {onBack && (
          <button onClick={onBack} className="mr-1 p-1 -ml-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md active:scale-95 transition-colors hc-press">
            <PhosphorIcon icon={CaretLeft} size={16} weight="bold" />
          </button>
        )}
        {type && (
          <span className="text-zinc-500 dark:text-zinc-400 shrink-0 flex items-center">
            <PhosphorIcon icon={HeaderIcon} size={20} />
          </span>
        )}
        <span className="truncate tracking-tight font-bold">{title}</span>
      </div>
      <div className="flex items-center justify-end gap-1 shrink-0">
        {children}
      </div>
    </div>
  );
}
