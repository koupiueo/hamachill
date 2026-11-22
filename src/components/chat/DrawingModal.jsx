import { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Eraser, Pen, Send, Undo2, Check, RotateCcw } from 'lucide-react';
import { t } from '../../i18n';

const DrawingModal = ({
  isOpen,
  onClose,
  onSend,
  initialImageUrl = null,
  title = t('composer.drawAndSend'),
  submitLabel = t('common.send'),
}) => {
  const canvasRef = useRef(null);
  const baseCanvasRef = useRef(null);
  const strokeCanvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef(null);

  const [color, setColor] = useState(initialImageUrl ? '#ef4444' : '#000000');
  const [lineWidth, setLineWidth] = useState(initialImageUrl ? 6 : 4);
  const [isEraser, setIsEraser] = useState(false);
  const [history, setHistory] = useState([]);
  const [displaySize, setDisplaySize] = useState({ width: 500, height: 375 });
  const [isReady, setIsReady] = useState(false);
  
  const [isVisible, setIsVisible] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setIsClosing(false);
    } else if (isVisible) {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setIsClosing(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isVisible]);

  const renderComposite = useCallback(() => {
    const canvas = canvasRef.current;
    const base = baseCanvasRef.current;
    const stroke = strokeCanvasRef.current;
    if (!canvas || !base || !stroke) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(stroke, 0, 0);
  }, []);

  const saveHistory = useCallback(() => {
    const stroke = strokeCanvasRef.current;
    if (!stroke) return;
    const ctx = stroke.getContext('2d');
    const imageData = ctx.getImageData(0, 0, stroke.width, stroke.height);
    setHistory(prev => [...prev.slice(-20), imageData]);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsReady(false);

    const setupCanvases = (w, h, drawBase) => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = w;
      canvas.height = h;

      const base = document.createElement('canvas');
      base.width = w;
      base.height = h;
      drawBase(base.getContext('2d'), w, h);
      baseCanvasRef.current = base;

      const stroke = document.createElement('canvas');
      stroke.width = w;
      stroke.height = h;
      strokeCanvasRef.current = stroke;

      // 画面に収まる表示サイズを計算
      const maxDispW = Math.min(720, window.innerWidth - 72);
      const maxDispH = Math.min(520, window.innerHeight * 0.56);
      const dispScale = Math.min(maxDispW / w, maxDispH / h, 1);
      // 小さすぎる画像はある程度拡大して描きやすくする
      const minScale = w < 320 && h < 320 ? Math.min(360 / w, 360 / h) : 1;
      const finalScale = Math.min(Math.max(dispScale, minScale), maxDispW / w, maxDispH / h);
      setDisplaySize({
        width: Math.max(160, Math.round(w * finalScale)),
        height: Math.max(120, Math.round(h * finalScale)),
      });

      renderComposite();
      const sCtx = stroke.getContext('2d');
      setHistory([sCtx.getImageData(0, 0, w, h)]);
      setIsReady(true);
    };

    if (initialImageUrl) {
      setColor('#ef4444');
      setLineWidth(6);
      setIsEraser(false);
      const img = new window.Image();
      img.onload = () => {
        const maxW = 1200;
        const maxH = 900;
        const scale = Math.min(1, maxW / (img.width || 1), maxH / (img.height || 1));
        const w = Math.max(1, Math.round((img.width || 500) * scale));
        const h = Math.max(1, Math.round((img.height || 375) * scale));
        setupCanvases(w, h, (bCtx) => {
          bCtx.drawImage(img, 0, 0, w, h);
        });
      };
      img.onerror = () => {
        setupCanvases(500, 375, (bCtx, w, h) => {
          bCtx.fillStyle = '#ffffff';
          bCtx.fillRect(0, 0, w, h);
        });
      };
      img.src = initialImageUrl;
    } else {
      setColor('#000000');
      setLineWidth(4);
      setIsEraser(false);
      setupCanvases(500, 375, (bCtx, w, h) => {
        bCtx.fillStyle = '#ffffff';
        bCtx.fillRect(0, 0, w, h);
      });
    }
  }, [isOpen, initialImageUrl, renderComposite]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isOpen) return;
    const preventDefault = (e) => e.preventDefault();
    canvas.addEventListener('touchstart', preventDefault, { passive: false });
    canvas.addEventListener('touchmove', preventDefault, { passive: false });
    return () => {
      canvas.removeEventListener('touchstart', preventDefault);
      canvas.removeEventListener('touchmove', preventDefault);
    };
  }, [isOpen, isVisible]);

  const getCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const getStrokeWidth = () => {
    const canvas = canvasRef.current;
    if (!canvas) return lineWidth;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / Math.max(1, rect.width);
    return Math.max(1, lineWidth * scale);
  };

  const startDrawing = (e) => {
    if (!isReady || !strokeCanvasRef.current) return;
    if (e.button !== undefined && e.button !== 0) return;
    const pt = getCoords(e);
    const sCtx = strokeCanvasRef.current.getContext('2d');
    sCtx.save();
    sCtx.lineCap = 'round';
    sCtx.lineJoin = 'round';
    sCtx.lineWidth = getStrokeWidth();
    sCtx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    sCtx.strokeStyle = isEraser ? 'rgba(0,0,0,1)' : color;
    sCtx.fillStyle = isEraser ? 'rgba(0,0,0,1)' : color;
    sCtx.beginPath();
    sCtx.arc(pt.x, pt.y, sCtx.lineWidth / 2, 0, Math.PI * 2);
    sCtx.fill();
    sCtx.restore();

    lastPointRef.current = pt;
    isDrawingRef.current = true;
    renderComposite();
  };

  const draw = (e) => {
    if (!isDrawingRef.current || !strokeCanvasRef.current || !lastPointRef.current) return;
    const pt = getCoords(e);
    const prev = lastPointRef.current;
    const sCtx = strokeCanvasRef.current.getContext('2d');
    sCtx.save();
    sCtx.lineCap = 'round';
    sCtx.lineJoin = 'round';
    sCtx.lineWidth = getStrokeWidth();
    sCtx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    sCtx.strokeStyle = isEraser ? 'rgba(0,0,0,1)' : color;
    sCtx.beginPath();
    sCtx.moveTo(prev.x, prev.y);
    sCtx.lineTo(pt.x, pt.y);
    sCtx.stroke();
    sCtx.restore();

    lastPointRef.current = pt;
    renderComposite();
  };

  const stopDrawing = () => {
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      lastPointRef.current = null;
      saveHistory();
    }
  };

  const handleUndo = () => {
    if (history.length <= 1 || !strokeCanvasRef.current) return;
    const sCtx = strokeCanvasRef.current.getContext('2d');
    const previousState = history[history.length - 2];
    sCtx.putImageData(previousState, 0, 0);
    setHistory(prev => prev.slice(0, -1));
    renderComposite();
  };

  const handleClear = () => {
    const stroke = strokeCanvasRef.current;
    if (!stroke) return;
    const sCtx = stroke.getContext('2d');
    sCtx.clearRect(0, 0, stroke.width, stroke.height);
    renderComposite();
    saveHistory();
  };

  const handleSend = () => {
    renderComposite();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) {
        onSend(blob);
      }
    }, 'image/png');
  };

  const colors = [
    '#000000', '#52525b', '#ef4444', '#f97316', '#eab308', 
    '#22c55e', '#0ea5e9', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff'
  ];

  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initX: 0, initY: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!initialImageUrl && window.innerWidth > 768) {
      setPosition({ x: -window.innerWidth / 4 + 100, y: -50 });
    } else {
      setPosition({ x: 0, y: 0 });
    }
  }, [initialImageUrl]);

  const handlePointerDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    dragRef.current.isDragging = true;
    dragRef.current.startX = e.clientX || e.touches?.[0]?.clientX;
    dragRef.current.startY = e.clientY || e.touches?.[0]?.clientY;
    dragRef.current.initX = position.x;
    dragRef.current.initY = position.y;
  };

  useEffect(() => {
    const handlePointerMove = (e) => {
      if (!dragRef.current.isDragging) return;
      const currentX = e.clientX || e.touches?.[0]?.clientX;
      const currentY = e.clientY || e.touches?.[0]?.clientY;
      setPosition({
        x: dragRef.current.initX + (currentX - dragRef.current.startX),
        y: dragRef.current.initY + (currentY - dragRef.current.startY)
      });
    };
    const handlePointerUp = () => dragRef.current.isDragging = false;
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [position]);

  if (!isVisible && !isOpen) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[2000] flex items-center justify-center p-4 overscroll-none touch-none transition-opacity duration-200 ${initialImageUrl ? 'bg-black/50 backdrop-blur-[2px] pointer-events-auto' : 'pointer-events-none'} ${isClosing ? 'opacity-0' : 'opacity-100'}`}>
      <div 
        className={`bg-white rounded-2xl shadow-2xl overflow-hidden w-fit max-w-[92vw] flex flex-col pointer-events-auto border border-zinc-200/50 ${isClosing ? 'animate-pop-out' : 'animate-pop-in'}`}
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 cursor-move bg-zinc-50"
          onMouseDown={handlePointerDown}
          onTouchStart={handlePointerDown}
        >
          <h3 className="font-bold text-zinc-800 flex items-center gap-2 pointer-events-none">
            <Pen size={18} className="text-zinc-700" />
            {title}
          </h3>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>
        
        {/* Toolbar */}
        <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-100 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {colors.map(c => (
                <button 
                  key={c}
                  onClick={() => { setColor(c); setIsEraser(false); }}
                  className={`w-6 h-6 rounded-full transition-transform border border-zinc-200 shadow-sm ${!isEraser && color === c ? 'scale-125 ring-2 ring-offset-1 ring-zinc-400' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                  title={c === '#ffffff' ? t('drawing.white') : c}
                />
              ))}
              
              <div className="relative flex items-center justify-center w-6 h-6 rounded-full border border-zinc-200 shadow-sm overflow-hidden bg-gradient-to-br from-red-500 via-green-500 to-blue-500 hover:scale-110 transition-transform ml-1">
                <input 
                  type="color" 
                  value={color}
                  onChange={(e) => { setColor(e.target.value); setIsEraser(false); }}
                  className="absolute inset-[-10px] w-10 h-10 cursor-pointer opacity-0"
                  title={t('drawing.customColor')}
                />
              </div>

              <div className="w-px h-6 bg-zinc-300 mx-1" />
              
              <button 
                onClick={() => setIsEraser(true)}
                className={`p-1 rounded-lg transition-colors ${isEraser ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:bg-zinc-200'}`}
                title={t('drawing.eraser')}
              >
                <Eraser size={18} />
              </button>
            </div>
            
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[10px] font-bold text-zinc-400">{t('drawing.size')}</span>
              <input 
                type="range" 
                min="1" max="50" 
                value={lineWidth} 
                onChange={(e) => setLineWidth(parseInt(e.target.value))}
                className="w-24 accent-zinc-800"
                title={t('drawing.penSize')}
              />
              <div className="flex items-center justify-center w-[30px] h-[30px] bg-zinc-100 rounded-lg ml-1">
                <div 
                  style={{ 
                    width: `${Math.min(lineWidth, 24)}px`, 
                    height: `${Math.min(lineWidth, 24)}px`, 
                    backgroundColor: isEraser ? '#ffffff' : color,
                    border: isEraser ? '1px solid #d4d4d8' : 'none'
                  }} 
                  className="rounded-full shadow-sm"
                  title={t('drawing.currentSizeColor')}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="bg-zinc-200 flex justify-center items-center p-4">
          <canvas
            ref={canvasRef}
            style={{ width: `${displaySize.width}px`, height: `${displaySize.height}px` }}
            className="bg-white rounded-lg shadow-sm cursor-crosshair touch-none select-none block"
            onContextMenu={(e) => e.preventDefault()}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            onTouchCancel={stopDrawing}
          />
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <button 
              onClick={handleUndo}
              disabled={history.length <= 1}
              className={`p-2 rounded-xl flex items-center gap-2 text-sm font-bold transition-colors ${history.length <= 1 ? 'text-zinc-300 cursor-not-allowed' : 'text-zinc-600 hover:bg-zinc-100'}`}
              title={t('drawing.undo')}
            >
              <Undo2 size={16} />
              <span className="hidden sm:inline">{t('drawing.undoShort')}</span>
            </button>
            <button 
              onClick={handleClear}
              className="p-2 rounded-xl flex items-center gap-2 text-sm font-bold text-red-500 hover:bg-red-50 transition-colors"
            >
              {initialImageUrl ? <RotateCcw size={16} /> : <X size={16} />}
              <span className="hidden sm:inline">{initialImageUrl ? t('common.reset') : t('drawing.clear')}</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-bold text-zinc-600 hover:bg-zinc-100 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button 
              onClick={handleSend} 
              className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-zinc-800 hover:bg-zinc-900 shadow-md shadow-zinc-900/20 transition-all flex items-center gap-2"
            >
              {initialImageUrl ? <Check size={16} /> : <Send size={16} />}
              {submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DrawingModal;
