import { useState, useEffect, useRef, useCallback } from 'react';
import { Palette as PaletteIcon, Check } from 'lucide-react';
import { hexToHsl, hslToHex } from '../../utils/colors';

export default function CustomColorPicker({ value, onChange, label, position = "top" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [hsl, setHsl] = useState([0, 100, 50]);
  
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const isDragging = useRef(false);
  const containerRef = useRef(null);
  const pickerRef = useRef(null);

  useEffect(() => {
    if (value && !isDragging.current) {
      const newHsl = hexToHsl(value);
      setHsl(newHsl);
    }
  }, [value, isOpen]);

  const updateColor = useCallback((h, s, l) => {
    const nextHsl = [h, s, l];
    setHsl(nextHsl);
    onChangeRef.current(hslToHex(nextHsl[0], nextHsl[1], nextHsl[2]));
  }, []);

  const handleMove = useCallback((e) => {
    if (!isDragging.current || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, (1 - (e.clientY - rect.top) / rect.height) * 100));
    
    setHsl(prev => {
      const next = [prev[0], x, y];
      onChangeRef.current(hslToHex(next[0], next[1], next[2]));
      return next;
    });
  }, []);

  const handleEnd = useCallback(() => {
    isDragging.current = false;
    window.removeEventListener('mousemove', handleMove);
    window.removeEventListener('mouseup', handleEnd);
  }, [handleMove]);

  const handleStart = useCallback((e) => {
    isDragging.current = true;
    handleMove(e);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
  }, [handleMove, handleEnd]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      // If the clicked element was removed from the DOM (e.g. by a React re-render 
      // triggered by an onChange event before this listener fired), ignore the click.
      if (!document.contains(e.target)) return;
      
      if (pickerRef.current && !pickerRef.current.contains(e.target) && !isDragging.current) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);


  const presets = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
    '#ec4899', '#06b6d4', '#f97316', '#ffffff', '#000000'
  ];

  return (
    <div className="flex flex-col gap-2">
      {label && <span className="text-[10px] font-bold text-zinc-900/40 uppercase tracking-widest">{label}</span>}
      <div className="flex items-center gap-3">
        <div className="relative" ref={pickerRef}>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-10 h-10 rounded-xl border border-zinc-950/10 shadow-lg transition-transform active:scale-95 overflow-hidden group"
            style={{ backgroundColor: value }}
          >
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
              <PaletteIcon size={14} className="text-zinc-900 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </button>
          
          {isOpen && (
            <div 
              className={`absolute z-[20002] bg-[#1a1a1e] border border-zinc-950/10 p-4 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 w-[240px] flex flex-col gap-4 ${
                position === 'top' ? 'bottom-full mb-2 left-0' : 
                position === 'left' ? 'right-full mr-4 top-1/2 -translate-y-1/2' :
                'top-full mt-2 left-0'
              }`}
            >


              <div 
                ref={containerRef}
                className="h-32 rounded-lg relative overflow-hidden cursor-crosshair select-none"
                style={{ 
                  backgroundColor: `hsl(${hsl[0]}, 100%, 50%)`,
                  backgroundImage: 'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)'
                }}
                onMouseDown={handleStart}
              >
                <div 
                  className="absolute w-4 h-4 border-2 border-white rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ left: `${hsl[1]}%`, top: `${100 - hsl[2]}%` }}
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[9px] font-black text-zinc-900/30 uppercase tracking-tighter">Hue</span>
                  <span className="text-[9px] font-mono font-bold text-zinc-900/60">{Math.round(hsl[0])}°</span>
                </div>
                <div className="relative h-3 group">
                  <div 
                    className="absolute inset-0 rounded-full"
                    style={{ background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)' }}
                  />
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={hsl[0]}
                    onChange={(e) => updateColor(parseFloat(e.target.value), hsl[1], hsl[2])}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div 
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg border border-black/10 pointer-events-none transition-transform group-active:scale-125"
                    style={{ left: `calc(${hsl[0] / 360 * 100}% - 8px)` }}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[9px] font-black text-zinc-900/30 uppercase">Saturation</span>
                    <span className="text-[9px] font-mono text-zinc-900/50">{Math.round(hsl[1])}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={hsl[1]}
                    onChange={(e) => updateColor(hsl[0], parseFloat(e.target.value), hsl[2])}
                    className="w-full h-1 bg-zinc-950/10 rounded-lg appearance-none cursor-pointer accent-white"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[9px] font-black text-zinc-900/30 uppercase">Lightness</span>
                    <span className="text-[9px] font-mono text-zinc-900/50">{Math.round(hsl[2])}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={hsl[2]}
                    onChange={(e) => updateColor(hsl[0], hsl[1], parseFloat(e.target.value))}
                    className="w-full h-1 bg-zinc-950/10 rounded-lg appearance-none cursor-pointer accent-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2 pt-1">
                {presets.map(p => (
                  <button
                    key={p}
                    onClick={() => {
                      onChange(p);
                      setIsOpen(false);
                    }}
                    className="w-6 h-6 rounded-lg border border-zinc-950/5 hover:scale-110 transition-all relative group"
                    style={{ backgroundColor: p }}
                  >
                    {value.toLowerCase() === p.toLowerCase() && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Check size={12} className={p === '#ffffff' ? 'text-black' : 'text-zinc-900'} />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-zinc-950/5">
                <span className="text-[10px] font-black text-zinc-900/40 uppercase tracking-widest">Hex</span>
                <input
                  type="text"
                  value={value?.toUpperCase() || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^#[0-9A-F]{0,6}$/i.test(val)) {
                      onChange(val);
                    }
                  }}
                  className="flex-1 bg-black/40 border border-zinc-950/10 rounded-lg px-3 py-2 text-[11px] font-mono text-zinc-900 focus:outline-none focus:border-zinc-950/30 transition-all text-center"
                />
              </div>
            </div>
          )}



        </div>

        <input
          type="text"
          value={value?.toUpperCase() || ''}
          onChange={(e) => onChange(e.target.value)}
          className="bg-white border border-zinc-950/10 rounded-xl px-3 py-2 text-[11px] text-zinc-900 font-mono w-24 focus:outline-none focus:border-zinc-950/30 transition-all"
        />
      </div>
    </div>
  );
}
