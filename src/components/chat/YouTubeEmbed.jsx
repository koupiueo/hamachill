import { useState, useEffect } from 'react';
import { t } from '../../i18n';

const ytCache = (typeof window !== 'undefined' && (window.__YT_CACHE__ = window.__YT_CACHE__ || {})) || {};
try {
  const saved = localStorage.getItem('hc_yt_cache_v2');
  if (saved) Object.assign(ytCache, JSON.parse(saved));
} catch (e) {}

const saveYtCache = (id, data) => {
  ytCache[id] = data;
  try {
    localStorage.setItem('hc_yt_cache_v2', JSON.stringify(ytCache));
  } catch (e) {}
};

const YouTubeEmbed = ({ videoId, fullUrl }) => {
  // 動画IDの検証（XSS対策）
  if (!videoId || typeof videoId !== 'string') return null;
  const isPlaylist = videoId.startsWith('playlist_');
  if (!isPlaylist && !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return null;
  }
  return <YouTubeEmbedInner key={videoId} videoId={videoId} fullUrl={fullUrl} isPlaylist={isPlaylist} />;
};

const YouTubeEmbedInner = ({ videoId, fullUrl, isPlaylist }) => {
  const cached = ytCache[videoId];
  const [videoInfo, setVideoInfo] = useState(cached?.info || null);
  const [isShorts, setIsShorts] = useState(cached?.isShorts || (fullUrl?.includes('/shorts/') || false));

  useEffect(() => {
    if (isPlaylist || ytCache[videoId]) return;
    let isMounted = true;

    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
      .then(res => res.json())
      .then(data => {
        if (isMounted) {
          setVideoInfo(data);
          saveYtCache(videoId, { info: data, isShorts: false });
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsShorts(true);
          saveYtCache(videoId, { info: null, isShorts: true });
        }
      });
    return () => { isMounted = false; };
  }, [videoId, isPlaylist]);

  let videoType = t('youtube.video');
  if (isPlaylist) videoType = t('youtube.playlist');
  else if (isShorts || fullUrl?.includes('/shorts/')) videoType = t('youtube.short');
  else if (fullUrl?.includes('/live/')) videoType = t('youtube.live');

  if (isPlaylist) {
    const targetUrl = fullUrl || `https://www.youtube.com/playlist?list=${videoId.replace('playlist_', '')}`;
    return (
      <div className="mt-2 flex w-full max-w-[400px] bg-white rounded-xl border-l-[4px] border-l-red-500 border-y border-r border-zinc-200 overflow-hidden select-none media-embed">
        <div className="p-3 flex flex-col gap-1 w-full">
          <div className="text-[11px] font-bold text-zinc-400 tracking-wider">{t('youtube.playlistLabel')}</div>
          <a
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[14px] font-bold text-[#0068e0] hover:underline mt-1 flex items-center gap-2"
          >
            {t('youtube.openPlaylist')}
          </a>
        </div>
      </div>
    );
  }

  if (isShorts) {
    const shortsTargetUrl = fullUrl || `https://www.youtube.com/shorts/${videoId}`;
    return (
      <div className="mt-2 flex w-full max-w-[280px] bg-white rounded-xl border-l-[4px] border-l-red-500 border-y border-r border-zinc-200 overflow-hidden select-none media-embed">
        <div className="p-3 flex flex-col gap-1 w-full">
          <div className="text-[11px] font-bold text-zinc-400 tracking-wider">{t('youtube.shortLabel')}</div>
          <div className="text-[13px] font-semibold text-zinc-900 mt-1 mb-0 truncate">
            {videoInfo?.title || 'YouTube Shorts'}
          </div>
          <a
            href={shortsTargetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="relative mt-1 rounded-xl overflow-hidden block w-full aspect-[9/16] bg-zinc-900 group shrink-0"
          >
            <img
              src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
              alt="YouTube Shorts"
              loading="lazy"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-12 h-12 rounded-full bg-black/40 group-hover:bg-black/60 flex items-center justify-center transition-colors duration-200">
                <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-white border-b-[8px] border-b-transparent ml-1" />
              </div>
            </div>
          </a>
        </div>
      </div>
    );
  }

  const targetUrl = fullUrl || `https://www.youtube.com/watch?v=${videoId}`;
  const title = videoInfo?.title;
  const author = videoInfo?.author_name;

  return (
    <div className="mt-2 flex w-full max-w-[400px] bg-white rounded-xl border-l-[4px] border-l-red-500 border-y border-r border-zinc-200 overflow-hidden select-none media-embed">
      <div className="p-3 flex flex-col gap-1 w-full">
        <div className="text-[11px] font-bold text-zinc-400 tracking-wider">YouTube ・ {videoType}</div>
        
        {/* 固定高さのチャンネル名エリア（レイアウトシフト防止） */}
        <div className="h-4 flex items-center">
          {author ? (
            <div className="text-[12px] font-semibold text-zinc-800 truncate">{author}</div>
          ) : (
            <div className="h-3 w-28 bg-zinc-200/70 rounded-sm animate-pulse" />
          )}
        </div>

        {/* 固定高さのタイトルエリア（レイアウトシフト防止） */}
        <div className="min-h-[22px] flex items-start">
          {title ? (
            <a
              href={targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[14px] font-medium text-[#0068e0] hover:underline line-clamp-2 leading-tight"
            >
              {title}
            </a>
          ) : (
            <div className="h-4 w-52 bg-zinc-200/70 rounded-sm animate-pulse my-1" />
          )}
        </div>

        {/* サムネイル画像は常に固定アスペクト比 16:9 で即時描画 */}
        <a
          href={targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="relative mt-1 rounded-xl overflow-hidden block w-full aspect-video bg-zinc-900 group shrink-0"
        >
          <img
            src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
            alt={title || 'YouTube thumbnail'}
            loading="lazy"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-12 h-12 rounded-full bg-black/40 group-hover:bg-black/60 flex items-center justify-center transition-colors duration-200 shadow-md">
              <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-white border-b-[8px] border-b-transparent ml-1" />
            </div>
          </div>
        </a>
      </div>
    </div>
  );
};

export default YouTubeEmbed;
