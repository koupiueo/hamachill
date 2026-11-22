import { useState, useEffect, useRef } from 'react';
import { api } from '../../utils/api';
import { t } from '../../i18n';

const ytChannelCache = new Map(); // url -> data | null (null = 失敗, undefined = 未取得)

const YTChannelEmbed = ({ url }) => {
  const ref = useRef(null);
  const [data, setData] = useState(() => ytChannelCache.get(url));

  useEffect(() => {
    if (ytChannelCache.has(url)) {
      setData(ytChannelCache.get(url));
      return;
    }
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      api.ytChannel(url)
        .then(res => (res && res.channelId ? res : null))
        .catch(() => null)
        .then(v => {
          ytChannelCache.set(url, v);
          if (alive) setData(v);
        });
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [url]);

  if (data === null) return null; // 失敗が分かっている → 何も出さない（最初から高さを取らない）

  if (data === undefined) {
    return (
      <div ref={ref} className="mt-2 flex w-full max-w-[440px] bg-zinc-50 rounded-xl border-l-[4px] border-l-red-500 border-y border-r border-zinc-200 overflow-hidden select-none media-embed animate-pulse h-[115px]">
        <div className="p-3 flex flex-col gap-2 w-full">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-zinc-200 shadow-sm border border-black/5 shrink-0" />
            <div className="flex flex-col justify-center gap-2 w-full">
              <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                {t('common.loading')}
              </div>
              <div className="h-4 w-32 bg-zinc-200 rounded-sm"></div>
            </div>
          </div>
          <div className="mt-1 flex flex-col gap-2">
            <div className="h-3 w-full bg-zinc-200 rounded-sm"></div>
            <div className="h-3 w-2/3 bg-zinc-200 rounded-sm"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 flex w-full max-w-[440px] bg-zinc-50 rounded-xl border-l-[4px] border-l-red-500 border-y border-r border-zinc-200 overflow-hidden select-none media-embed h-[115px]">
      <div className="p-3 flex flex-col gap-2 w-full">
        {/* Header */}
        <div className="flex items-center gap-3">
          {data.iconUrl ? (
            <img src={data.iconUrl} alt={data.channelName} className="w-11 h-11 rounded-full object-cover shadow-sm border border-black/5 bg-zinc-200 shrink-0" />
          ) : (
            <div className="w-11 h-11 rounded-full bg-zinc-200 shadow-sm border border-black/5 shrink-0" />
          )}
          <div className="flex flex-col justify-center min-w-0">
            <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider truncate">
              YouTube Channel
            </div>
            <a 
              href={`https://www.youtube.com/channel/${data.channelId}`} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-[14px] font-bold text-zinc-900 hover:text-[#0068e0] transition-colors line-clamp-1 leading-tight mt-1"
            >
              {data.channelName}
            </a>
          </div>
        </div>
        
        {/* Description */}
        <div className="text-[12px] text-zinc-600 line-clamp-2 leading-relaxed mt-1 h-[39px]">
          {data.description || ' '}
        </div>
      </div>
    </div>
  );
};

export default YTChannelEmbed;
