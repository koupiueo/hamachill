import { t } from '../../i18n';
export default function FloatingControlPanel({
  color1, setColor1,
  color2, setColor2,
  isGradient, setIsGradient,
  opacity, setOpacity
}) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-4 bg-black/40 backdrop-blur-xl p-4 rounded-3xl border border-zinc-950/10 shadow-2xl min-w-[200px]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black tracking-widest text-zinc-900/40 uppercase">{t('colorPanel.mode')}</span>
        <button
          onClick={() => setIsGradient(!isGradient)}
          className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${isGradient ? 'bg-zinc-950/20 text-zinc-900' : 'bg-zinc-950/5 text-zinc-900/40'}`}
        >
          {isGradient ? t('common.gradient') : t('colorPanel.solid')}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-black tracking-widest text-zinc-900/40 uppercase">{t('colorPanel.color')}</span>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center gap-1">
            <input
              type="color"
              value={color1}
              onChange={(e) => setColor1(e.target.value)}
              className="w-10 h-10 rounded-xl border-none cursor-pointer bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-xl [&::-webkit-color-swatch]:border-none"
            />
            <span className="text-[8px] text-zinc-900/30 font-bold">1</span>
          </div>
          {isGradient && (
            <div className="flex flex-col items-center gap-1">
              <input
                type="color"
                value={color2}
                onChange={(e) => setColor2(e.target.value)}
                className="w-10 h-10 rounded-xl border-none cursor-pointer bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-xl [&::-webkit-color-swatch]:border-none"
              />
              <span className="text-[8px] text-zinc-900/30 font-bold">2</span>
            </div>
          )}
        </div>
      </div>

      <div className="w-full h-px bg-zinc-950/10 my-2" />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black tracking-widest text-zinc-900/40 uppercase">{t('colorPanel.opacity')}</span>
          <span className="text-[10px] font-mono text-zinc-900/50">{Math.round(opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={opacity}
          onChange={(e) => setOpacity(parseFloat(e.target.value))}
          className="w-full h-1 bg-zinc-950/10 rounded-lg appearance-none cursor-pointer accent-white"
        />
      </div>

    </div>

  );
}

