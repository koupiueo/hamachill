import React, { useEffect, useRef, useState } from 'react';
import { EyeOff } from 'lucide-react';
import { t } from '../../i18n';

/**
 * ネタバレ画像用のモザイクオーバーレイ。
 * 同一オリジン画像（/uploads/ や blob:）を低解像度ピクセル化して本物のモザイクを描画し、
 * 読み込み中や外部CORS画像では強めのぼかし＋モザイク格子で確実に隠す。
 */
export const SpoilerMosaic = React.memo(({ src, compact = false }) => {
  const canvasRef = useRef(null);
  const [mosaicReady, setMosaicReady] = useState(false);

  useEffect(() => {
    setMosaicReady(false);
    if (!src) return;
    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled || !canvasRef.current) return;
      try {
        const blocks = compact ? 12 : 20;
        const aspect = (img.naturalHeight || 1) / Math.max(1, img.naturalWidth || 1);
        const w = blocks;
        const h = Math.max(8, Math.round(blocks * aspect));
        const canvas = canvasRef.current;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, w, h);
        // CORS で汚染されていないか確認
        ctx.getImageData(0, 0, 1, 1);
        setMosaicReady(true);
      } catch {
        setMosaicReady(false);
      }
    };
    img.onerror = () => {
      if (!cancelled) setMosaicReady(false);
    };
    img.src = src;
    return () => { cancelled = true; };
  }, [src, compact]);

  return (
    <div className="absolute inset-0 overflow-hidden select-none z-20">
      <canvas
        ref={canvasRef}
        style={{ imageRendering: 'pixelated' }}
        className={`w-full h-full object-cover transition-opacity duration-150 ${mosaicReady ? 'opacity-100' : 'opacity-0'}`}
      />
      {!mosaicReady && (
        <div
          className="absolute inset-0 backdrop-blur-2xl bg-zinc-900/45"
          style={{
            backgroundImage:
              'linear-gradient(45deg, rgba(255,255,255,0.06) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.06) 75%), linear-gradient(45deg, rgba(255,255,255,0.06) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.06) 75%)',
            backgroundSize: compact ? '12px 12px' : '18px 18px',
            backgroundPosition: compact ? '0 0, 6px 6px' : '0 0, 9px 9px',
          }}
        />
      )}
      <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
        <div
          className={`flex items-center gap-1 rounded-full bg-zinc-900/90 text-white font-black tracking-wider shadow-lg border border-white/15 ${
            compact ? 'px-2 py-0.5 text-[10px]' : 'px-3.5 py-1.5 text-xs gap-1.5'
          }`}
        >
          {!compact && <EyeOff size={14} />}
          <span>{t('common.spoiler')}</span>
        </div>
      </div>
    </div>
  );
});

SpoilerMosaic.displayName = 'SpoilerMosaic';

export function splitImageUrls(imageUrl, max = 5) {
  if (typeof imageUrl !== 'string' || !imageUrl) return [];
  return imageUrl.split('|||').map(s => s.trim()).filter(Boolean).slice(0, max);
}

export function isSpoilerImageUrl(url) {
  if (typeof url !== 'string' || !url.includes('?')) return false;
  try {
    return new URL(url, 'http://localhost').searchParams.get('spoiler') === '1';
  } catch {
    return false;
  }
}

export const SidebarImagePreview = React.memo(({ imageUrl }) => {
  const [revealed, setRevealed] = useState(() => new Set());
  const images = splitImageUrls(imageUrl, 5);
  if (images.length === 0) return null;

  return (
    <div className="mt-1 h-24 overflow-hidden rounded-lg border border-zinc-950/5 relative flex gap-1">
      {images.map((u, i) => {
        const isHiddenSpoiler = isSpoilerImageUrl(u) && !revealed.has(i);
        return (
          <div
            key={`${u}-${i}`}
            className="relative flex-1 min-w-0 h-24 overflow-hidden bg-zinc-100"
            onClick={(e) => {
              if (!isHiddenSpoiler) return;
              e.stopPropagation();
              setRevealed(prev => {
                const next = new Set(prev);
                next.add(i);
                return next;
              });
            }}
          >
            <img
              src={u}
              alt=""
              loading="lazy"
              decoding="async"
              className={`w-full h-full object-cover transition-all duration-150 ${isHiddenSpoiler ? 'blur-xl scale-110 brightness-75' : ''}`}
            />
            {isHiddenSpoiler && (
              <div className="cursor-pointer">
                <SpoilerMosaic src={u} compact />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

SidebarImagePreview.displayName = 'SidebarImagePreview';

export default SpoilerMosaic;
