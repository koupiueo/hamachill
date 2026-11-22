import { PhoneDisconnect } from '@phosphor-icons/react';
import PhosphorIcon from '../ui/PhosphorIcon';
import { t } from '../../i18n';

export default function VoiceControl({ channelName, onLeave, connectionState, embedded = false }) {
  if (embedded) {
    return (
      <div className="flex items-center justify-between bg-emerald-500/10 dark:bg-emerald-950/25 p-2 px-3 w-full animate-in slide-in-from-bottom-2 duration-200">
        <div className="flex flex-col min-w-0 pr-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connectionState ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
            <span className="text-emerald-600 dark:text-emerald-400 text-[12px] font-bold tracking-tight truncate leading-tight">
              {connectionState ? t('vc.connecting') : t('vc.connected')}
            </span>
          </div>
          <span className="text-zinc-600 dark:text-zinc-400 text-[11px] font-medium mt-1 truncate pl-4">
            {connectionState || channelName}
          </span>
        </div>

        <button
          onClick={onLeave}
          className="w-7 h-7 rounded-md text-zinc-500 hover:bg-black/5 dark:hover:bg-white/5 hover:text-red-500 transition-all flex items-center justify-center active:scale-95 cursor-pointer shrink-0"
          title={t('vc.disconnect')}
        >
          <PhosphorIcon icon={PhoneDisconnect} size={15} weight="bold" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-[84px] left-4 z-[1200] animate-in slide-in-from-bottom-4 duration-500 hidden md:block">
      <div className="flex items-center justify-between bg-white dark:bg-[#25272a] border border-zinc-950/10 dark:border-white/10 rounded-xl shadow-2xl p-2 px-3 w-[280px]">
        <div className="flex flex-col min-w-0 pr-4">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${connectionState ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
            <span className="text-emerald-500 text-[13px] font-black tracking-tight truncate leading-tight">
              {connectionState ? t('vc.connecting') : t('vc.connected')}
            </span>
          </div>
          <span className="text-zinc-900/50 dark:text-zinc-400 text-[11px] font-bold mt-1 truncate pl-4" style={{ paddingLeft: '18px' }}>
            {connectionState || channelName}
          </span>
        </div>

        <button
          onClick={onLeave}
          className="w-9 h-9 rounded-md text-zinc-900/40 dark:text-zinc-400 hover:bg-zinc-950/5 dark:hover:bg-white/5 hover:text-red-500 transition-all flex items-center justify-center active:scale-95 cursor-pointer shrink-0"
          title={t('vc.disconnect')}
        >
          <PhosphorIcon icon={PhoneDisconnect} size={18} weight="bold" />
        </button>
      </div>
    </div>
  );
}
